// Conversational briefing: the session store.
//
// A brief session is a conversation that converges on two things — a structured
// working brief and a set of text drafts — before anything is rendered. This file owns
// the record and its concurrency rules only. No model, no tools, no turn loop: those
// arrive in later phases. See conversation-plan-v4.md §6.
//
// Stored as JSON in R2 under briefs/, alongside posts/ and renders/. No new infra.
//
// Two concurrency mechanisms, because they cover different failures:
//
//   rev   catches the ordinary double-submit, where a second request arrives after the
//         first has finished and would otherwise overwrite it.
//
//   lock  catches the second message sent while the first turn is still running. A turn
//         takes seconds (a chat call, sometimes a nested planner call) and the record in
//         R2 is unchanged for all of it, so both requests read the same rev before either
//         writes. rev cannot see that; the lock can.
//
// R2 has no compare-and-swap, so two genuinely simultaneous writers can still race. For
// one person on one phone that is not the failure worth engineering against.

import { putJson, getJson, deleteKey, listKeys } from "./r2.js";
import { randomUUID } from "node:crypto";

const PREFIX = "briefs/";

export const LOCK_TTL_MS = 120_000;              // a turn that outlives this is dead
export const ABANDON_AFTER_MS = 14 * 24 * 3600 * 1000;

export const STATUSES = ["open", "drafted", "ready", "rendered", "abandoned"];
const RESUMABLE = new Set(["open", "drafted", "ready"]);

// Briefing is DriverTrack only. revive.js has no themes and no budget, the planner
// rejects it, and compose.js imports the DriverTrack tokens directly regardless.
const BRIEF_BRANDS = new Set(["drivertrack"]);

export class BriefError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "BriefError";
    this.status = status;
  }
}

// --- injectable backend, so the tests need neither R2 nor a real clock -------
let store = { putJson, getJson, deleteKey, listKeys };
let now = () => Date.now();

export function __setBackend({ store: s, now: clock } = {}) {
  if (s) store = s;
  if (clock) now = clock;
}

// --- shape -------------------------------------------------------------------

function emptyBrief() {
  return {
    idea: "",
    proof: { kind: "", detail: "" },   // kind: figure | quote | none
    showsProduct: null,                // null means not yet established
    demonstration: "",
    intent: "",
    count: 2,
    avoid: [],
    schedule: "",
    notes: [],
  };
}

const iso = () => new Date(now()).toISOString();
const key = (id) => `${PREFIX}${id}.json`;

// --- create / read -----------------------------------------------------------

export async function createSession({ brand = "drivertrack" } = {}) {
  if (!BRIEF_BRANDS.has(brand)) {
    throw new BriefError(
      `conversational briefing is not available for '${brand}'. ` +
        `Only drivertrack has the tokens the pipeline needs.`,
      400
    );
  }

  const stamp = iso();
  const session = {
    // A bearer token for the conversation, so unguessable rather than merely unique.
    id: `b_${randomUUID()}`,
    brand,
    status: "open",
    rev: 1,
    lock: { heldSince: "", turnId: "" },
    brief: emptyBrief(),
    transcript: [],
    drafts: [],
    nextDraftSeq: 1,
    readyAt: "",
    approvedAt: "",
    postIds: [],
    createdAt: stamp,
    updatedAt: stamp,
  };

  await store.putJson(key(session.id), session);
  return session;
}

// Reads sweep stale sessions to abandoned. A write on read is a side effect, but it
// keeps the sweep off a cron and out of a background job for a service that has neither.
export async function getSession(id) {
  const session = await store.getJson(key(id));
  if (!session) return null;

  if (RESUMABLE.has(session.status) && isStale(session)) {
    session.status = "abandoned";
    session.lock = { heldSince: "", turnId: "" };
    session.rev += 1;
    session.updatedAt = iso();
    await store.putJson(key(id), session);
  }
  return session;
}

function isStale(session) {
  const t = Date.parse(session.updatedAt || "");
  return Number.isFinite(t) && now() - t > ABANDON_AFTER_MS;
}

export async function requireSession(id) {
  const session = await getSession(id);
  if (!session) throw new BriefError(`no session '${id}'`, 404);
  return session;
}

// Resumable sessions, newest first. Transcripts stripped and drafts summarised: this
// feeds a picker, and a full transcript per row would be most of the payload.
export async function listSessions() {
  const keys = (await store.listKeys(PREFIX)).filter((k) => k.endsWith(".json"));
  const all = await Promise.all(keys.map((k) => store.getJson(k).catch(() => null)));

  return all
    .filter((s) => s && RESUMABLE.has(s.status) && !isStale(s))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .map((s) => ({
      id: s.id,
      brand: s.brand,
      status: s.status,
      rev: s.rev,
      idea: s.brief?.idea || "",
      turns: s.transcript.length,
      drafts: s.drafts.map((d) => ({
        draftId: d.draftId,
        state: d.state,
        headline: d.spec?.headline || "",
      })),
      locked: isLockHeld(s),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
}

// --- revision and lock -------------------------------------------------------

export function assertRev(session, rev) {
  if (rev === undefined || rev === null) return;   // caller opted out
  if (Number(rev) !== session.rev) {
    throw new BriefError(
      `stale revision: you sent ${rev}, the session is at ${session.rev}`,
      409
    );
  }
}

export function isLockHeld(session, at = now()) {
  const since = Date.parse(session.lock?.heldSince || "");
  return Number.isFinite(since) && at - since < LOCK_TTL_MS;
}

export function lockAgeMs(session, at = now()) {
  const since = Date.parse(session.lock?.heldSince || "");
  return Number.isFinite(since) ? at - since : null;
}

/**
 * Run work against a session while holding its lock.
 *
 * The write order matters and is the whole point of the helper. `before` mutates the
 * session and is persisted together with the lock, so a process that dies mid-turn
 * leaves the user's message on the record rather than a held lock and no trace of what
 * they said. An earlier draft of this plan locked first and appended afterwards, which
 * loses the message on exactly the failure the lock exists to survive.
 *
 *   1. load, reject terminal states, check rev
 *   2. lock held and fresh -> 409
 *   3. lock stale -> steal
 *   4. apply `before` in memory
 *   5. set lock, bump rev, WRITE
 *   6. run `work`
 *   7. clear lock, bump rev, WRITE — whether work succeeded or threw
 */
export async function withLock(id, { rev, before, work, allowStatuses } = {}) {
  const session = await requireSession(id);

  if (session.status === "abandoned") throw new BriefError("session is abandoned", 409);
  if (allowStatuses && !allowStatuses.includes(session.status)) {
    throw new BriefError(`session is ${session.status}`, 409);
  }
  assertRev(session, rev);

  if (isLockHeld(session)) {
    throw new BriefError("a turn is already in progress on this session", 409);
  }
  const stolen = session.lock?.heldSince ? lockAgeMs(session) : null;

  if (before) await before(session);

  const turnId = randomUUID();
  session.lock = { heldSince: iso(), turnId };
  session.rev += 1;
  session.updatedAt = iso();
  await store.putJson(key(id), session);

  let result, failure;
  try {
    result = work ? await work(session) : undefined;
  } catch (e) {
    failure = e;
  }

  session.lock = { heldSince: "", turnId: "" };
  session.rev += 1;
  session.updatedAt = iso();
  await store.putJson(key(id), session);

  if (failure) throw failure;
  return { session, result, stolenLockAgeMs: stolen };
}

// --- terminal ----------------------------------------------------------------

export async function abandonSession(id, rev) {
  const { session } = await withLock(id, {
    rev,
    work: (s) => { s.status = "abandoned"; },
  });
  return session;
}

export async function deleteSession(id) {
  const session = await store.getJson(key(id));
  if (!session) return false;
  await store.deleteKey(key(id));
  return true;
}

// --- drafts ------------------------------------------------------------------

// Ids are minted once and never reused. Revision mints new ones and marks the replaced
// drafts dropped, so a card you were reading never silently becomes a different post.
export function mintDraftId(session) {
  return `d${session.nextDraftSeq++}`;
}

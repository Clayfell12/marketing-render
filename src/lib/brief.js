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

// --- the working brief -------------------------------------------------------

const PROOF_KINDS = new Set(["figure", "quote", "none"]);
const INTENTS = new Set(["direct", "opinion"]);
const SLOTS = new Set([
  "idea", "proof", "showsProduct", "demonstration",
  "intent", "count", "avoid", "schedule", "notes",
]);

// A true partial patch: absent means unchanged. There is no null sentinel, because
// "null means leave it alone" is indistinguishable from a legitimate null and forces
// the model to restate eight untouched slots on every call.
//
// Two asymmetries, both deliberate: `avoid` replaces, because it is a statement of the
// current position; `notes` appends, because it accumulates.
// Every free-text slot ends up inside a prompt, so it gets cleaned on the way in.
// Angle brackets are the tell: the brand voice is plain prose and never needs them,
// whereas a model that fumbles a tool call can leak its own scaffolding into a string
// parameter. A real run put "><parameter name=" into notes, which would then have been
// handed to the planner as if it were something the user said.
const clean = (s) => String(s ?? "").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
const cleanList = (xs) => (xs || []).map(clean).filter(Boolean);

export function mergeBrief(brief, patch = {}) {
  const unknown = Object.keys(patch).filter((k) => !SLOTS.has(k));
  if (unknown.length) throw new BriefError(`unknown brief slots: ${unknown.join(", ")}`);

  const next = { ...brief, proof: { ...brief.proof }, avoid: [...brief.avoid], notes: [...brief.notes] };

  if ("idea" in patch) next.idea = clean(patch.idea);
  if ("demonstration" in patch) next.demonstration = clean(patch.demonstration);
  if ("schedule" in patch) next.schedule = clean(patch.schedule);
  if ("showsProduct" in patch) next.showsProduct = Boolean(patch.showsProduct);

  if ("proof" in patch) {
    const kind = String(patch.proof?.kind ?? "");
    if (!PROOF_KINDS.has(kind)) {
      throw new BriefError(`proof.kind must be figure, quote or none, not '${kind}'`);
    }
    next.proof = { kind, detail: clean(patch.proof?.detail) };
  }

  if ("intent" in patch) {
    const v = String(patch.intent ?? "");
    if (!INTENTS.has(v)) throw new BriefError(`intent must be direct or opinion, not '${v}'`);
    next.intent = v;
  }

  // Range is checked here rather than in the tool schema: the strict subset has no
  // minimum or maximum, so shape validation cannot carry it.
  if ("count" in patch) {
    const n = Number(patch.count);
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      throw new BriefError(`count must be a whole number from 1 to 7, not '${patch.count}'`);
    }
    next.count = n;
  }

  if ("avoid" in patch) next.avoid = cleanList(patch.avoid);
  if ("notes" in patch) next.notes = [...next.notes, ...cleanList(patch.notes)];

  return next;
}

// The three slots where guessing wrong wastes a render. Everything else gets a stated
// assumption instead of a question.
export function requiredSlotsFilled(brief) {
  return Boolean(brief.idea) && PROOF_KINDS.has(brief.proof?.kind) && typeof brief.showsProduct === "boolean";
}

export function missingSlots(brief) {
  const out = [];
  if (!brief.idea) out.push("idea");
  if (!PROOF_KINDS.has(brief.proof?.kind)) out.push("proof");
  if (typeof brief.showsProduct !== "boolean") out.push("showsProduct");
  return out;
}

// --- the bridge to the planner -----------------------------------------------

/**
 * The working brief as prose for `planPosts`. Deterministic and boring on purpose:
 * it is the seam between the two models, and the one place where "no figure exists"
 * turns into words the planner is actually told. See conversation-plan-v4.md §4.
 *
 * There is deliberately no COUNT section. `planPosts` already renders
 * `Plan ${count} LinkedIn post(s)` at the top of its own prompt, so emitting a count
 * here too puts two numbers in one prompt that can disagree. Count is a parameter,
 * and only a parameter.
 */
export function composeBriefText(session) {
  const b = session.brief;
  const lines = [];

  lines.push("IDEA", b.idea || "(not stated)", "");

  lines.push("PROOF");
  if (b.proof?.kind === "figure") {
    lines.push(`Use this figure exactly: ${b.proof.detail}. The stat block is allowed.`);
  } else if (b.proof?.kind === "quote") {
    lines.push(`Use this quote exactly: ${b.proof.detail}. The quote block is allowed.`);
  } else {
    // The single most important line in this string. Without it the planner fills the
    // gap with a plausible number, which is the failure the whole feature exists to fix.
    lines.push(
      "No figures or quotes are available. Argue from reasoning. " +
        "Do NOT use the stat or quote blocks."
    );
  }
  lines.push("");

  lines.push("PRODUCT");
  if (b.showsProduct) {
    lines.push(
      `This post SHOWS the product. Theme must be dark. ` +
        `Demonstration: ${b.demonstration || "none"}.`
    );
  } else {
    lines.push(
      "This post does NOT show the product. Theme must be light. " +
        "No thread or screenshot blocks."
    );
  }
  lines.push("");

  lines.push("INTENT");
  lines.push(
    b.intent === "opinion"
      ? "Opinion / advice. No cta. Display mode allowed."
      : "Direct response. Include a cta."
  );
  lines.push("");

  lines.push("AVOID");
  lines.push(...(b.avoid.length ? b.avoid : ["(none)"]));
  lines.push("");

  lines.push("NOTES");
  lines.push(...(b.notes.length ? b.notes : ["(none)"]));
  lines.push("");

  lines.push("SCHEDULE", b.schedule || "(unspecified)");

  return lines.join("\n");
}

// --- drafts ------------------------------------------------------------------

// Ids are minted once and never reused. Revision mints new ones and marks the replaced
// drafts dropped, so a card you were reading never silently becomes a different post.
export function mintDraftId(session) {
  return `d${session.nextDraftSeq++}`;
}

export const openDrafts = (session) => session.drafts.filter((d) => d.state === "open");

/**
 * Theme is a rule, not a preference, so the server is its source of truth. The planner
 * still sees the rule in its own prompt — steering it before generation is cheaper than
 * correcting after — but a wrong pick cannot survive this. §4.
 */
export function enforceTheme(draft, brief) {
  if (typeof brief.showsProduct === "boolean" && draft.spec) {
    draft.spec.theme = brief.showsProduct ? "dark" : "light";
  }
  return draft;
}

/**
 * Anything that changes the brief or the drafts un-declares readiness. Otherwise a
 * session could be `ready` while describing posts nobody has looked at since.
 */
export function demoteReadiness(session) {
  if (session.status === "ready") {
    session.status = "drafted";
    session.readyAt = "";
  }
}

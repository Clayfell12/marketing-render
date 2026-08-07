// Pure tests for the briefing session store.
// In-memory backend and a fake clock, so no R2 and no waiting. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  __setBackend, BriefError, LOCK_TTL_MS, ABANDON_AFTER_MS,
  createSession, getSession, requireSession, listSessions, abandonSession,
  withLock, assertRev, isLockHeld, mintDraftId,
} from "../src/lib/brief.js";

// Clone on the way in and out, or the store hands back live references and every
// "the write contained X" assertion becomes vacuous.
function fresh() {
  const data = new Map();
  const writes = [];
  let t = Date.parse("2026-08-06T10:00:00.000Z");

  const store = {
    async putJson(k, v) { writes.push({ k, v: structuredClone(v) }); data.set(k, structuredClone(v)); },
    async getJson(k) { return data.has(k) ? structuredClone(data.get(k)) : null; },
    async deleteKey(k) { data.delete(k); return true; },
    async listKeys(p) { return [...data.keys()].filter((k) => k.startsWith(p)); },
  };

  __setBackend({ store, now: () => t });
  return { store, writes, data, advance: (ms) => { t += ms; }, at: () => t };
}

const keyFor = (id) => `briefs/${id}.json`;

// --- create ------------------------------------------------------------------

test("createSession starts at rev 1, open, with an empty brief", async () => {
  fresh();
  const s = await createSession({ brand: "drivertrack" });
  assert.match(s.id, /^b_[0-9a-f-]{36}$/);
  assert.equal(s.rev, 1);
  assert.equal(s.status, "open");
  assert.equal(s.brief.count, 2);
  assert.equal(s.brief.showsProduct, null);
  assert.deepEqual(s.drafts, []);
  assert.equal(s.nextDraftSeq, 1);
});

test("createSession refuses a brand the pipeline cannot render", async () => {
  fresh();
  await assert.rejects(() => createSession({ brand: "revive" }), (e) => {
    assert.ok(e instanceof BriefError);
    assert.equal(e.status, 400);
    assert.match(e.message, /not available for 'revive'/);
    return true;
  });
});

test("requireSession is a 404, getSession is a null", async () => {
  fresh();
  assert.equal(await getSession("b_nope"), null);
  await assert.rejects(() => requireSession("b_nope"), (e) => e.status === 404);
});

// --- rev ---------------------------------------------------------------------

test("assertRev rejects a stale revision and opts out when omitted", async () => {
  fresh();
  const s = await createSession({});
  assert.throws(() => assertRev(s, 99), (e) => e.status === 409);
  assertRev(s, 1);
  assertRev(s, undefined);
});

// --- the lock ----------------------------------------------------------------

// The guarantee the whole helper exists for: a process that dies mid-turn must leave
// the user's message on the record, not a held lock and no trace of what they said.
test("the user turn is durable in the same write that takes the lock", async () => {
  const { store, writes } = fresh();
  const s = await createSession({});
  writes.length = 0;

  await withLock(s.id, {
    rev: s.rev,
    before: (sess) => { sess.transcript.push({ role: "user", text: "peak hiring" }); },
    work: () => {},
  });

  const lockWrite = writes[0].v;
  assert.equal(lockWrite.transcript.length, 1, "message must be persisted with the lock");
  assert.ok(lockWrite.lock.heldSince, "and the lock must be set in that same write");
  assert.equal(lockWrite.rev, 2);
});

test("withLock bumps rev twice and releases", async () => {
  fresh();
  const s = await createSession({});
  const { session } = await withLock(s.id, { rev: 1, work: () => {} });
  assert.equal(session.rev, 3);
  assert.equal(session.lock.heldSince, "");
});

test("a second turn while one is running is a 409, not a silent overwrite", async () => {
  const { store, at } = fresh();
  const s = await createSession({});

  const raw = await store.getJson(keyFor(s.id));
  raw.lock = { heldSince: new Date(at()).toISOString(), turnId: "in-flight" };
  await store.putJson(keyFor(s.id), raw);

  await assert.rejects(() => withLock(s.id, { work: () => {} }), (e) => {
    assert.equal(e.status, 409);
    assert.match(e.message, /already in progress/);
    return true;
  });
});

test("a lock older than the TTL is stolen, because the process that held it is gone", async () => {
  const { store, at, advance } = fresh();
  const s = await createSession({});

  const raw = await store.getJson(keyFor(s.id));
  raw.lock = { heldSince: new Date(at()).toISOString(), turnId: "dead" };
  await store.putJson(keyFor(s.id), raw);

  advance(LOCK_TTL_MS + 1000);
  const out = await withLock(s.id, { work: () => "ran" });
  assert.equal(out.result, "ran");
  assert.ok(out.stolenLockAgeMs > LOCK_TTL_MS);
});

test("work that throws still releases the lock, then rethrows", async () => {
  fresh();
  const s = await createSession({});
  await assert.rejects(
    () => withLock(s.id, { rev: 1, work: () => { throw new Error("planner exploded"); } }),
    /planner exploded/
  );
  const after = await getSession(s.id);
  assert.equal(after.lock.heldSince, "", "a failed turn must not strand the session");
  assert.equal(after.rev, 3);
});

test("withLock refuses an abandoned session and honours allowStatuses", async () => {
  fresh();
  const s = await createSession({});
  await abandonSession(s.id, 1);
  await assert.rejects(() => withLock(s.id, { work: () => {} }), (e) => e.status === 409);

  const t = await createSession({});
  await assert.rejects(
    () => withLock(t.id, { allowStatuses: ["ready"], work: () => {} }),
    (e) => e.status === 409 && /is open/.test(e.message)
  );
});

test("isLockHeld is false once the TTL has passed", async () => {
  const { at, advance } = fresh();
  const s = { lock: { heldSince: new Date(at()).toISOString() } };
  assert.equal(isLockHeld(s), true);
  advance(LOCK_TTL_MS + 1);
  assert.equal(isLockHeld(s), false);
});

// --- abandon and sweep -------------------------------------------------------

test("abandonSession is terminal", async () => {
  fresh();
  const s = await createSession({});
  const out = await abandonSession(s.id, 1);
  assert.equal(out.status, "abandoned");
});

test("a session untouched for fourteen days is swept on read", async () => {
  const { advance } = fresh();
  const s = await createSession({});

  advance(ABANDON_AFTER_MS - 1000);
  assert.equal((await getSession(s.id)).status, "open");

  advance(2000);
  assert.equal((await getSession(s.id)).status, "abandoned");
});

// --- listing -----------------------------------------------------------------

test("listSessions returns resumable sessions only, newest first, without transcripts", async () => {
  const { store, advance } = fresh();

  const a = await createSession({});
  advance(1000);
  const b = await createSession({});
  advance(1000);
  const gone = await createSession({});
  await abandonSession(gone.id, 1);

  const raw = await store.getJson(keyFor(a.id));
  raw.brief.idea = "overnight screening";
  raw.transcript = [{ role: "user", text: "a long message" }];
  raw.drafts = [{ draftId: "d1", state: "open", spec: { headline: "Screened overnight" } }];
  await store.putJson(keyFor(a.id), raw);

  const list = await listSessions();
  assert.deepEqual(list.map((s) => s.id), [b.id, a.id]);

  const row = list.find((s) => s.id === a.id);
  assert.equal(row.idea, "overnight screening");
  assert.equal(row.turns, 1);
  assert.equal(row.transcript, undefined, "transcripts must not ride in the list");
  assert.deepEqual(row.drafts, [{ draftId: "d1", state: "open", headline: "Screened overnight" }]);
});

// --- drafts ------------------------------------------------------------------

test("draft ids are minted once and never reused", async () => {
  fresh();
  const s = await createSession({});
  assert.equal(mintDraftId(s), "d1");
  assert.equal(mintDraftId(s), "d2");
  s.drafts = [];                       // a revision clears the open drafts
  assert.equal(mintDraftId(s), "d3", "ids must not restart when drafts are replaced");
});

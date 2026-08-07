// Phase 3: the bridge to the planner, drafting, editing, readiness and approval.
// Both models are faked and the renderer is injected, so these run with no key, no
// network, no Chromium and no cost. See conversation-plan-v4.md §16.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composeBriefText, openDrafts, __setBackend, createSession, capTranscript,
} from "../src/lib/brief.js";
import { TOOLS, runTurn, summariseTranscript } from "../src/lib/brief-turn.js";
import { approveWithin, approveDrafts, __setRenderer, APPROVE_CAP } from "../src/lib/brief-approve.js";

process.env.ANTHROPIC_API_KEY ||= "test-key-not-used";

const brief = (over = {}) => ({
  idea: "screening runs overnight",
  proof: { kind: "none", detail: "" },
  showsProduct: true,
  demonstration: "thread",
  intent: "direct",
  count: 2,
  avoid: [],
  schedule: "",
  notes: [],
  ...over,
});

const session = (over = {}) => ({
  id: "b_test",
  brand: "drivertrack",
  status: "open",
  rev: 1,
  lock: { heldSince: "", turnId: "" },
  brief: brief(),
  transcript: [],
  drafts: [],
  nextDraftSeq: 1,
  readyAt: "",
  approvedAt: "",
  postIds: [],
  ...over,
});

const draft = (over = {}) => ({
  draftId: "d1",
  spec: { theme: "dark", eyebrow: "Overnight", headline: "a real headline", accentWord: "", display: false, blocks: [] },
  caption: "c", firstComment: "f", altText: "", note: "", scheduledFor: "",
  state: "open", postId: "", warnings: [],
  ...over,
});

const toolUse = (name, input, id = `tu_${name}`) => ({ type: "tool_use", id, name, input });
const turn = (content, stop = "tool_use") => ({ content, stop_reason: stop, usage: { output_tokens: 10 } });

// A plan as planPosts expects to parse it: raw JSON in a text block.
const plan = (posts) => ({ content: [{ type: "text", text: JSON.stringify(posts) }], usage: {} });
const planned = (headline, over = {}) => ({
  theme: "light", eyebrow: "Eyebrow", headline, display: false, blocks: [],
  caption: "caption", firstComment: "first", altText: "", note: "", scheduledFor: "",
  ...over,
});

// One fake for both models, since the planner call is nested inside the chat call and
// both now take the same injected fetch. The chat call carries `tools`; the planner call
// does not. They are recorded separately, because a combined list makes every index-based
// assertion depend on how many times the planner happened to run.
function fakeApi({ chat = [], planner = [] } = {}) {
  const chatSent = [];
  const plannerSent = [];
  const fn = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    const isChat = Boolean(body.tools);
    (isChat ? chatSent : plannerSent).push(body);
    const next = isChat ? chat.shift() : planner.shift();
    if (!next) throw new Error(`fake ran out of ${isChat ? "chat" : "planner"} responses`);
    return { ok: true, json: async () => next };
  };
  fn.chatSent = chatSent;
  fn.plannerSent = plannerSent;
  // The tool_results the model was handed after round `n`, as an array of result blocks.
  fn.resultsAfter = (n = 0) => chatSent[n + 1].messages.at(-1).content;
  return fn;
}

// ---------------------------------------------------------------------------
// composeBriefText — the seam between the two models
// ---------------------------------------------------------------------------

test("composeBriefText states a figure and unlocks the stat block", () => {
  const s = session({ brief: brief({ proof: { kind: "figure", detail: "40 applicants overnight" } }) });
  const text = composeBriefText(s);
  assert.match(text, /Use this figure exactly: 40 applicants overnight\. The stat block is allowed\./);
});

test("composeBriefText states a quote and unlocks the quote block", () => {
  const s = session({ brief: brief({ proof: { kind: "quote", detail: "I used to spend Sunday nights ringing round" } }) });
  const text = composeBriefText(s);
  assert.match(text, /Use this quote exactly: I used to spend Sunday nights ringing round\. The quote block is allowed\./);
});

// The single line the whole feature turns on. If this wording weakens, the planner
// fills the gap with a plausible number and F2 fails again.
test("composeBriefText forbids stat and quote outright when there is no proof", () => {
  const text = composeBriefText(session({ brief: brief({ proof: { kind: "none", detail: "" } }) }));
  assert.match(text, /No figures or quotes are available\. Argue from reasoning\./);
  assert.match(text, /Do NOT use the stat or quote blocks\./);
});

test("composeBriefText states the theme rule per post, not per batch", () => {
  const shown = composeBriefText(session({ brief: brief({ showsProduct: true, demonstration: "thread" }) }));
  assert.match(shown, /The product may be shown\. Demonstration: thread\./);
  assert.match(shown, /dark if that post carries a thread or screenshot, light if it does not/);
  assert.match(shown, /A batch may hold both\./);
  // The old wording promised the planner a batch verdict the server no longer honours.
  assert.ok(!/Theme must be dark/.test(shown), "no batch-wide theme claim");

  const hidden = composeBriefText(session({ brief: brief({ showsProduct: false }) }));
  assert.match(hidden, /This post does NOT show the product\. Theme must be light\./);
  assert.match(hidden, /No thread or screenshot blocks\./);
});

// v2 emitted a count here AND passed one to planPosts, which renders its own count line.
// Two numbers in one prompt that can disagree.
test("composeBriefText emits no COUNT section", () => {
  const text = composeBriefText(session({ brief: brief({ count: 5 }) }));
  assert.ok(!/COUNT/.test(text), "no COUNT heading");
  assert.ok(!/\b5\b/.test(text), "the count must not leak in as a bare number");
});

test("composeBriefText falls back rather than emitting empty sections", () => {
  const text = composeBriefText(session({ brief: brief({ avoid: [], notes: [], schedule: "" }) }));
  assert.match(text, /AVOID\n\(none\)/);
  assert.match(text, /NOTES\n\(none\)/);
  assert.match(text, /SCHEDULE\n\(unspecified\)/);
});

// ---------------------------------------------------------------------------
// tool schemas
// ---------------------------------------------------------------------------

test("edit_draft cannot patch blocks, because that is a re-plan not a patch", () => {
  const edit = TOOLS.find((t) => t.name === "edit_draft");
  assert.ok(edit, "edit_draft is registered");
  assert.ok(!("blocks" in edit.input_schema.properties), "no blocks key");
  assert.deepEqual(edit.input_schema.required, ["draftId"]);
});

test("every Phase 3 tool is strict with additionalProperties false", () => {
  for (const name of ["draft_posts", "revise_drafts", "edit_draft", "declare_ready"]) {
    const t = TOOLS.find((x) => x.name === name);
    assert.ok(t, `${name} is registered`);
    assert.equal(t.strict, true, `${name} is strict`);
    assert.equal(t.input_schema.additionalProperties, false, `${name} closes its object`);
  }
});

// ---------------------------------------------------------------------------
// draft_posts
// ---------------------------------------------------------------------------

test("draft_posts refuses while a required slot is still open", async () => {
  const s = session({ brief: brief({ idea: "" }) });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("draft_posts", {})]),
      turn([toolUse("reply", { text: "what is the idea?" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts.length, 0, "nothing drafted");
  // the refusal came back as a tool result the model could act on
  const results = fetchImpl.resultsAfter(0);
  assert.match(results[0].content, /cannot draft yet: idea still missing/);
});

test("draft_posts turns planner output into drafts and moves the session on", async () => {
  const s = session();
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("draft_posts", {})]),
      turn([toolUse("reply", { text: "here are two" })]),
    ],
    planner: [plan([planned("first headline here"), planned("second headline here")])],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts.length, 2);
  assert.equal(s.status, "drafted");
  assert.deepEqual(s.drafts.map((d) => d.draftId), ["d1", "d2"]);
  assert.ok(s.drafts.every((d) => d.state === "open"));
});

// The planner is told the rule in its own prompt, but the server is the source of truth.
test("a post carrying a product block is forced dark whatever the planner said", async () => {
  const s = session({ brief: brief({ showsProduct: true }) });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "done" })])],
    planner: [plan([planned("a headline", { theme: "light", blocks: [{ type: "thread", messages: [] }] })])],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.theme, "dark");
});

test("a brief that rules the product out keeps every post light", async () => {
  const s = session({ brief: brief({ showsProduct: false }) });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "done" })])],
    planner: [plan([planned("a headline", { theme: "dark" })])],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.theme, "light");
});

// The 7 August gate run failed C1 three times, every one of them this shape: a display
// post stamped dark because the batch was product-led. display carries no blocks, so
// the post showed no product and the theme contradicted its own rule.
test("a display post in a product-led batch is light, not dark", async () => {
  const s = session({ brief: brief({ showsProduct: true }) });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "done" })])],
    planner: [plan([planned("a bold statement", { theme: "dark", display: true, blocks: [] })])],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.theme, "light", "no blocks means no product means light");
});

// F6: a brief wanting one product post and one statement post could not say so when a
// single boolean decided the whole batch. It took two sessions to produce the pair.
test("a batch can hold one product post and one statement post", async () => {
  const s = session({ brief: brief({ showsProduct: true }) });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "done" })])],
    planner: [plan([
      planned("the product one", { theme: "light", blocks: [{ type: "screenshot", name: "pipeline" }] }),
      planned("the quote one", { theme: "dark", blocks: [{ type: "quote", text: "a line", attribution: "a DSP owner" }] }),
    ])],
  });

  await runTurn(s, { fetchImpl });
  assert.deepEqual(s.drafts.map((d) => d.spec.theme), ["dark", "light"]);
});

// rows and compare are abstract representations, not the product on screen.
test("only thread and screenshot count as showing the product", async () => {
  const s = session({ brief: brief({ showsProduct: true }) });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "done" })])],
    planner: [plan([planned("a headline", { theme: "dark", blocks: [{ type: "rows", items: [] }] })])],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.theme, "light");
});

// An edit that removes the last product block has to move the theme with it.
test("editing a post out of display mode re-derives its theme", async () => {
  const s = session({
    status: "drafted",
    brief: brief({ showsProduct: true }),
    drafts: [draft({ spec: { theme: "light", eyebrow: "E", headline: "a line", accentWord: "", display: true, blocks: [] } })],
    nextDraftSeq: 2,
  });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d1", headline: "a different line" })]),
      turn([toolUse("reply", { text: "done" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.theme, "light", "still no blocks, still light");
});

test("an over-budget headline reaches the draft and the model as a warning", async () => {
  const s = session();
  const long = "one two three four five six seven eight nine ten eleven twelve";
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "done" })])],
    planner: [plan([planned(long)])],
  });

  await runTurn(s, { fetchImpl });
  assert.match(s.drafts[0].warnings.join(" "), /headline is 12 words, budget 9/);
  const results = fetchImpl.resultsAfter(0);
  assert.match(results[0].content, /headline is 12 words/);
});

test("the brief's count is used, and an explicit count overrides it", async () => {
  const s = session({ brief: brief({ count: 3 }) });
  let fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", {})]), turn([toolUse("reply", { text: "ok" })])],
    planner: [plan([planned("h")])],
  });
  await runTurn(s, { fetchImpl });
  assert.match(fetchImpl.plannerSent[0].messages[0].content, /Plan 3 LinkedIn post/);

  const s2 = session({ brief: brief({ count: 3 }) });
  fetchImpl = fakeApi({
    chat: [turn([toolUse("draft_posts", { count: 1 })]), turn([toolUse("reply", { text: "ok" })])],
    planner: [plan([planned("h")])],
  });
  await runTurn(s2, { fetchImpl });
  assert.match(fetchImpl.plannerSent[0].messages[0].content, /Plan 1 LinkedIn post/);
});

// ---------------------------------------------------------------------------
// revise_drafts
// ---------------------------------------------------------------------------

test("revise_drafts asks for as many posts as are standing, not the brief's count", async () => {
  const s = session({
    brief: brief({ count: 2 }),
    status: "drafted",
    drafts: [draft({ draftId: "d1" }), draft({ draftId: "d2" }), draft({ draftId: "d3" })],
    nextDraftSeq: 4,
  });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("revise_drafts", { feedback: "flatter" })]), turn([toolUse("reply", { text: "ok" })])],
    planner: [plan([planned("a"), planned("b"), planned("c")])],
  });

  await runTurn(s, { fetchImpl });
  assert.match(fetchImpl.plannerSent[0].messages[0].content, /Plan 3 LinkedIn post/);
  assert.match(fetchImpl.plannerSent[0].messages[0].content, /REVISION FEEDBACK\nflatter/);
});

// Ids are never reused, so a card someone is reading never becomes a different post.
test("revision drops the old drafts, keeps their ids, and mints new ones", async () => {
  const s = session({
    status: "drafted",
    drafts: [draft({ draftId: "d1" }), draft({ draftId: "d2" })],
    nextDraftSeq: 3,
  });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("revise_drafts", { feedback: "flatter" })]), turn([toolUse("reply", { text: "ok" })])],
    planner: [plan([planned("a"), planned("b")])],
  });

  await runTurn(s, { fetchImpl });
  assert.deepEqual(s.drafts.map((d) => d.draftId), ["d1", "d2", "d3", "d4"]);
  assert.deepEqual(s.drafts.map((d) => d.state), ["dropped", "dropped", "open", "open"]);
});

test("an approved draft survives a revision untouched", async () => {
  const s = session({
    status: "drafted",
    drafts: [
      draft({ draftId: "d1", state: "approved", postId: "p_1", spec: { ...draft().spec, headline: "approved line" } }),
      draft({ draftId: "d2" }),
    ],
    nextDraftSeq: 3,
  });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("revise_drafts", { feedback: "change it" })]), turn([toolUse("reply", { text: "ok" })])],
    planner: [plan([planned("a new line")])],
  });

  await runTurn(s, { fetchImpl });
  const d1 = s.drafts.find((d) => d.draftId === "d1");
  assert.equal(d1.state, "approved");
  assert.equal(d1.postId, "p_1");
  assert.equal(d1.spec.headline, "approved line");
  assert.equal(openDrafts(s).length, 1, "only the revised one is open");
});

test("revise_drafts with nothing open says so instead of planning", async () => {
  const s = session();
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("revise_drafts", { feedback: "flatter" })]),
      turn([toolUse("reply", { text: "nothing to revise" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  const results = fetchImpl.resultsAfter(0);
  assert.match(results[0].content, /no open drafts to revise/);
});

// Each planner call is a full round trip nested inside the chat round trip.
test("a second planner-class call in one turn is refused, not silently dropped", async () => {
  const s = session();
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("draft_posts", {}, "tu_a"), toolUse("revise_drafts", { feedback: "x" }, "tu_b")]),
      turn([toolUse("reply", { text: "ok" })]),
    ],
    planner: [plan([planned("a headline")])],
  });

  await runTurn(s, { fetchImpl });
  const results = fetchImpl.resultsAfter(0);
  const refused = results.find((r) => r.tool_use_id === "tu_b");
  assert.equal(refused.is_error, true);
  assert.match(refused.content, /already planned this turn/);
});

// ---------------------------------------------------------------------------
// batch ordering
// ---------------------------------------------------------------------------

// Without the first tier boundary this fails the required-slot check.
test("draft_posts listed before update_brief still runs the brief patch first", async () => {
  const s = session({ brief: brief({ idea: "" }) });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("draft_posts", {}, "tu_draft"), toolUse("update_brief", { idea: "overnight screening" }, "tu_brief")]),
      turn([toolUse("reply", { text: "ok" })]),
    ],
    planner: [plan([planned("a headline")])],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.brief.idea, "overnight screening");
  assert.equal(s.drafts.length, 1, "drafting saw the patched brief");
});

// Without the second, the end tool terminates the turn before its neighbours run.
test("declare_ready listed first still runs after the mutators beside it", async () => {
  const s = session({
    status: "drafted",
    drafts: [draft()],
    nextDraftSeq: 2,
  });
  const fetchImpl = fakeApi({
    chat: [
      turn([
        toolUse("declare_ready", { summary: "settled" }, "tu_ready"),
        toolUse("edit_draft", { draftId: "d1", headline: "a shorter line" }, "tu_edit"),
      ]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.headline, "a shorter line", "the edit ran");
  assert.equal(s.status, "ready", "and readiness still landed, after it");
});

// ---------------------------------------------------------------------------
// edit_draft
// ---------------------------------------------------------------------------

test("edit_draft patches only the fields sent", async () => {
  const s = session({ status: "drafted", drafts: [draft({ caption: "original caption" })], nextDraftSeq: 2 });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d1", headline: "a tighter line" })]),
      turn([toolUse("reply", { text: "done" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.drafts[0].spec.headline, "a tighter line");
  assert.equal(s.drafts[0].caption, "original caption", "untouched fields survive");
  assert.equal(s.drafts[0].spec.eyebrow, "Overnight");
});

test("edit_draft reports budget breaches it created", async () => {
  const s = session({ status: "drafted", drafts: [draft()], nextDraftSeq: 2 });
  const long = "one two three four five six seven eight nine ten eleven";
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d1", headline: long })]),
      turn([toolUse("reply", { text: "done" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.match(s.drafts[0].warnings.join(" "), /headline is 11 words, budget 9/);
  const results = fetchImpl.resultsAfter(0);
  assert.match(results[0].content, /headline is 11 words/);
});

// display mode has its own, tighter budget
test("edit_draft switching on display is scored against the display budget", async () => {
  const s = session({ status: "drafted", drafts: [draft({ spec: { ...draft().spec, headline: "one two three four five six seven" } })], nextDraftSeq: 2 });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d1", display: true })]),
      turn([toolUse("reply", { text: "done" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.match(s.drafts[0].warnings.join(" "), /headline is 7 words, budget 6/);
});

test("a rejected edit leaves the session exactly as it was", async () => {
  const s = session({ status: "drafted", drafts: [draft()], nextDraftSeq: 2 });
  const before = JSON.parse(JSON.stringify(s.drafts));
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d1", headline: "" })]),
      turn([toolUse("reply", { text: "that would leave it empty" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.deepEqual(s.drafts, before, "unchanged");
  const results = fetchImpl.resultsAfter(0);
  assert.equal(results[0].is_error, true);
  assert.match(results[0].content, /no headline/);
});

test("edit_draft on an unknown or already approved draft is an error result", async () => {
  const s = session({ status: "drafted", drafts: [draft({ state: "approved", postId: "p_1" })], nextDraftSeq: 2 });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d9" }, "tu_a"), toolUse("edit_draft", { draftId: "d1" }, "tu_b")]),
      turn([toolUse("reply", { text: "ok" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  const results = fetchImpl.resultsAfter(0);
  assert.match(results.find((r) => r.tool_use_id === "tu_a").content, /no draft 'd9'/);
  assert.match(results.find((r) => r.tool_use_id === "tu_b").content, /is approved and cannot be edited/);
});

// ---------------------------------------------------------------------------
// declare_ready and demotion
// ---------------------------------------------------------------------------

test("declare_ready needs a settled brief and a draft standing", async () => {
  const s = session();
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("declare_ready", { summary: "done" })]),
      turn([toolUse("reply", { text: "nothing to be ready with" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.status, "open");
  const results = fetchImpl.resultsAfter(0);
  assert.match(results[0].content, /no drafts to be ready with/);
});

test("declare_ready ends the turn and puts its summary on the transcript", async () => {
  const s = session({ status: "drafted", drafts: [draft()], nextDraftSeq: 2 });
  const fetchImpl = fakeApi({ chat: [turn([toolUse("declare_ready", { summary: "two posts, ready when you are" })])] });

  await runTurn(s, { fetchImpl });
  assert.equal(s.status, "ready");
  assert.ok(s.readyAt, "readyAt stamped");
  const last = s.transcript.at(-1);
  assert.equal(last.role, "assistant");
  assert.equal(last.text, "two posts, ready when you are");
  assert.deepEqual(last.options, []);
});

test("editing a ready session demotes it to drafted and clears readyAt", async () => {
  const s = session({ status: "ready", readyAt: "2026-08-07T00:00:00.000Z", drafts: [draft()], nextDraftSeq: 2 });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("edit_draft", { draftId: "d1", headline: "a different line" })]),
      turn([toolUse("reply", { text: "changed" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.status, "drafted");
  assert.equal(s.readyAt, "");
});

test("changing the brief demotes readiness too", async () => {
  const s = session({ status: "ready", readyAt: "2026-08-07T00:00:00.000Z", drafts: [draft()], nextDraftSeq: 2 });
  const fetchImpl = fakeApi({
    chat: [
      turn([toolUse("update_brief", { idea: "something else entirely" })]),
      turn([toolUse("reply", { text: "noted" })]),
    ],
  });

  await runTurn(s, { fetchImpl });
  assert.equal(s.status, "drafted");
  assert.equal(s.readyAt, "");
});

// ---------------------------------------------------------------------------
// approve
// ---------------------------------------------------------------------------

let postSeq = 0;
const fakeRenderer = async () => ({ id: `p_${++postSeq}` });
const failingRenderer = (failOn) => async (input) => {
  if (input.spec.headline === failOn) throw new Error("Chromium fell over");
  return { id: `p_${++postSeq}` };
};

test("approve renders the open drafts and marks them approved", async () => {
  __setRenderer(fakeRenderer);
  const s = session({ status: "ready", drafts: [draft({ draftId: "d1" }), draft({ draftId: "d2" })], nextDraftSeq: 3 });

  const out = await approveWithin(s);
  assert.equal(out.ok, true);
  assert.equal(out.posts.length, 2);
  assert.ok(s.drafts.every((d) => d.state === "approved" && d.postId));
  assert.equal(s.postIds.length, 2);
  assert.equal(s.status, "rendered", "nothing left open");
  assert.ok(s.approvedAt);
  __setRenderer(null);
});

test("approve is idempotent: a draft that already rendered is skipped", async () => {
  __setRenderer(fakeRenderer);
  const s = session({
    status: "ready",
    drafts: [draft({ draftId: "d1", state: "approved", postId: "p_existing" }), draft({ draftId: "d2" })],
    nextDraftSeq: 3,
  });

  const out = await approveWithin(s, { only: ["d1", "d2"] });
  assert.equal(out.ok, true);
  assert.equal(out.posts.length, 1, "only d2 rendered");
  assert.equal(s.drafts[0].postId, "p_existing", "d1 untouched, no double render");
  __setRenderer(null);
});

test("approving a subset leaves the session open for the rest", async () => {
  __setRenderer(fakeRenderer);
  const s = session({ status: "ready", drafts: [draft({ draftId: "d1" }), draft({ draftId: "d2" })], nextDraftSeq: 3 });

  await approveWithin(s, { only: ["d1"] });
  assert.equal(s.status, "ready", "still open for the conversation about d2");
  assert.equal(openDrafts(s).length, 1);
  __setRenderer(null);
});

test("approve caps the batch and renders none when over it", async () => {
  let calls = 0;
  __setRenderer(async () => { calls += 1; return { id: `p_${++postSeq}` }; });
  const s = session({
    status: "ready",
    drafts: [draft({ draftId: "d1" }), draft({ draftId: "d2" }), draft({ draftId: "d3" }), draft({ draftId: "d4" })],
    nextDraftSeq: 5,
  });

  await assert.rejects(() => approveWithin(s), (e) => {
    assert.equal(e.status, 400);
    assert.match(e.message, new RegExp(`over the ${APPROVE_CAP} per call cap`));
    return true;
  });
  assert.equal(calls, 0, "nothing rendered");
  assert.ok(s.drafts.every((d) => d.state === "open"));
  __setRenderer(null);
});

test("a mid-batch failure keeps its successes and does not finish the session", async () => {
  __setRenderer(failingRenderer("bad one"));
  const s = session({
    status: "ready",
    drafts: [
      draft({ draftId: "d1" }),
      draft({ draftId: "d2", spec: { ...draft().spec, headline: "bad one" } }),
      draft({ draftId: "d3" }),
    ],
    nextDraftSeq: 4,
  });

  const out = await approveWithin(s);
  assert.equal(out.ok, false);
  assert.match(out.error, /d2 failed to render/);
  assert.equal(out.posts.length, 1, "d1's render is kept");
  assert.equal(s.drafts[0].state, "approved");
  assert.equal(s.drafts[1].state, "open", "d2 still open");
  assert.equal(s.status, "ready", "not rendered — the batch did not finish");
  __setRenderer(null);
});

test("a retry after a mid-batch failure skips what already rendered", async () => {
  __setRenderer(failingRenderer("bad one"));
  const s = session({
    status: "ready",
    drafts: [draft({ draftId: "d1" }), draft({ draftId: "d2", spec: { ...draft().spec, headline: "bad one" } })],
    nextDraftSeq: 3,
  });
  await approveWithin(s);
  const d1Post = s.drafts[0].postId;

  // same call again, now with a renderer that works
  __setRenderer(fakeRenderer);
  const out = await approveWithin(s);
  assert.equal(out.ok, true);
  assert.equal(out.posts.length, 1, "only d2 this time");
  assert.equal(s.drafts[0].postId, d1Post, "d1 not re-rendered");
  assert.equal(s.status, "rendered");
  __setRenderer(null);
});

test("approve refuses a session that is not ready unless forced", async () => {
  __setRenderer(fakeRenderer);
  const s = session({ status: "drafted", drafts: [draft()], nextDraftSeq: 2 });

  await assert.rejects(() => approveWithin(s), /not ready. Send force: true/);
  assert.equal(s.drafts[0].state, "open");

  const out = await approveWithin(s, { force: true });
  assert.equal(out.ok, true);
  __setRenderer(null);
});

test("approve rejects an unknown draft id rather than silently approving the rest", async () => {
  __setRenderer(fakeRenderer);
  const s = session({ status: "ready", drafts: [draft()], nextDraftSeq: 2 });
  await assert.rejects(() => approveWithin(s, { only: ["d1", "d9"] }), /no draft 'd9'/);
  assert.equal(s.drafts[0].state, "open", "nothing rendered");
  __setRenderer(null);
});

test("approve refuses when no target has a headline to render", async () => {
  __setRenderer(fakeRenderer);
  const s = session({
    status: "ready",
    drafts: [draft({ spec: { theme: "dark", headline: "", blocks: [] } })],
    nextDraftSeq: 2,
  });
  await assert.rejects(() => approveWithin(s), /has a headline to render/);
  __setRenderer(null);
});

// ---------------------------------------------------------------------------
// approve through the turn lock
// ---------------------------------------------------------------------------

// In-memory store and a fixed clock, same shape as the Phase 1 tests. Each test file
// runs in its own process, so setting the module backend here does not leak.
function fresh() {
  const data = new Map();
  let t = Date.parse("2026-08-07T10:00:00.000Z");
  __setBackend({
    store: {
      async putJson(k, v) { data.set(k, structuredClone(v)); },
      async getJson(k) { return data.has(k) ? structuredClone(data.get(k)) : null; },
      async deleteKey(k) { data.delete(k); return true; },
      async listKeys(p) { return [...data.keys()].filter((k) => k.startsWith(p)); },
    },
    now: () => t,
  });
  return { data, at: () => new Date(t).toISOString() };
}

// Seed a ready session with drafts, straight into the store.
async function seeded(io, over = {}) {
  const s = await createSession({ brand: "drivertrack" });
  Object.assign(s, { status: "ready", drafts: [draft({ draftId: "d1" })], nextDraftSeq: 2, ...over });
  io.data.set(`briefs/${s.id}.json`, structuredClone(s));
  return s;
}

test("approve takes the same turn lock, so approving mid-turn is a 409", async () => {
  const io = fresh();
  __setRenderer(fakeRenderer);
  // a turn is running: the lock is held and fresh
  const s = await seeded(io, { lock: { heldSince: io.at(), turnId: "t1" } });

  await assert.rejects(() => approveDrafts(s.id, { rev: s.rev }), (e) => {
    assert.equal(e.status, 409);
    assert.match(e.message, /already in progress/);
    return true;
  });

  const after = io.data.get(`briefs/${s.id}.json`);
  assert.equal(after.drafts[0].state, "open", "nothing rendered behind the running turn");
  __setRenderer(null);
});

test("approve through the lock persists the render and releases", async () => {
  const io = fresh();
  __setRenderer(fakeRenderer);
  const s = await seeded(io);

  const out = await approveDrafts(s.id, { rev: s.rev });
  assert.equal(out.ok, true);

  const after = io.data.get(`briefs/${s.id}.json`);
  assert.equal(after.drafts[0].state, "approved");
  assert.ok(after.drafts[0].postId);
  assert.equal(after.status, "rendered");
  assert.equal(after.lock.heldSince, "", "lock released");
  assert.equal(after.rev, s.rev + 2, "one write to take the lock, one to release it");
  __setRenderer(null);
});

test("approve on a stale rev is a 409 before anything renders", async () => {
  const io = fresh();
  let calls = 0;
  __setRenderer(async () => { calls += 1; return { id: "p_x" }; });
  const s = await seeded(io);

  await assert.rejects(() => approveDrafts(s.id, { rev: s.rev - 1 }), (e) => {
    assert.equal(e.status, 409);
    return true;
  });
  assert.equal(calls, 0);
  __setRenderer(null);
});

// ---------------------------------------------------------------------------
// transcript growth — Phase 5
// ---------------------------------------------------------------------------

const manyTurns = (n) => Array.from({ length: n }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  text: "turn " + i,
  at: "",
  ...(i % 2 ? { options: [] } : {}),
}));

test("capTranscript is a no-op below the cap", () => {
  const s = session({ transcript: manyTurns(10) });
  assert.equal(capTranscript(s), false);
  assert.equal(s.transcript.length, 10);
});

test("capTranscript keeps the newest entries and drops the oldest", () => {
  const s = session({ transcript: manyTurns(50) });
  assert.equal(capTranscript(s, 40), true);
  assert.equal(s.transcript.length, 40);
  assert.equal(s.transcript.at(-1).text, "turn 49", "newest survives");
  assert.equal(s.transcript[0].text, "turn 10", "oldest went");
});

// The note is the only record of everything older, so it is never what gets trimmed.
test("capTranscript never drops the leading note", () => {
  const s = session({ transcript: [{ role: "note", text: "what was decided", at: "" }, ...manyTurns(50)] });
  capTranscript(s, 40);
  assert.equal(s.transcript.length, 40);
  assert.equal(s.transcript[0].role, "note");
  assert.equal(s.transcript.at(-1).text, "turn 49");
});

test("summariseTranscript leaves a short transcript alone", async () => {
  const s = session({ transcript: manyTurns(6) });
  const fetchImpl = () => { throw new Error("should not be called"); };
  assert.equal(await summariseTranscript(s, { fetchImpl }), false);
  assert.equal(s.transcript.length, 6);
});

test("summariseTranscript folds the oldest half into one note", async () => {
  const s = session({ transcript: manyTurns(30) });
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "They want overnight screening, no figure available." }] }) });

  assert.equal(await summariseTranscript(s, { fetchImpl }), true);
  assert.equal(s.transcript[0].role, "note");
  assert.match(s.transcript[0].text, /no figure available/);
  assert.equal(s.transcript.length, 16, "one note plus the newest half");
  assert.equal(s.transcript.at(-1).text, "turn 29", "the newest turn is untouched");
});

test("summarising twice folds into a fresh note rather than nesting", async () => {
  const s = session({ transcript: [{ role: "note", text: "older still", at: "" }, ...manyTurns(30)] });
  let sawExisting = false;
  const fetchImpl = async (_u, opts) => {
    if (JSON.parse(opts.body).messages[0].content.includes("older still")) sawExisting = true;
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "combined note" }] }) };
  };

  await summariseTranscript(s, { fetchImpl });
  assert.ok(sawExisting, "the existing note is given to the summariser, not dropped");
  assert.equal(s.transcript.filter(x => x.role === "note").length, 1, "still exactly one note");
  assert.equal(s.transcript[0].text, "combined note");
});

// The whole point of running it after the turn: a failure here costs a tidy transcript,
// never the user's message.
test("a failed summary leaves the transcript intact", async () => {
  const s = session({ transcript: manyTurns(30) });
  const before = JSON.parse(JSON.stringify(s.transcript));
  const fetchImpl = async () => ({ ok: false, status: 529, text: async () => "overloaded" });

  assert.equal(await summariseTranscript(s, { fetchImpl }), false);
  assert.deepEqual(s.transcript, before);
});

test("an empty summary is treated as a failure, not written as a note", async () => {
  const s = session({ transcript: manyTurns(30) });
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "   " }] }) });
  assert.equal(await summariseTranscript(s, { fetchImpl }), false);
  assert.ok(!s.transcript.some(x => x.role === "note"));
});

test("a note reaches the model labelled as history, not as the user talking", async () => {
  const s = session({
    status: "drafted",
    transcript: [{ role: "note", text: "decided: overnight screening, no figure", at: "" }],
  });
  const fetchImpl = fakeApi({ chat: [turn([toolUse("reply", { text: "ok" })])] });

  await runTurn(s, { fetchImpl });
  const first = fetchImpl.chatSent[0].messages[0];
  assert.equal(first.role, "user");
  assert.match(first.content, /Earlier in this conversation, summarised/);
  assert.match(first.content, /decided: overnight screening/);
});

test("a turn summarises only after its own result is on the session", async () => {
  const s = session({ transcript: manyTurns(30) });
  const fetchImpl = fakeApi({
    chat: [turn([toolUse("reply", { text: "the newest thing said" })])],
    planner: [],
  });
  // the summariser shares the injected fetch; it has no tools, so it lands on planner
  fetchImpl.plannerQueue = null;
  const stats = await runTurn(s, { fetchImpl }).catch((e) => e);

  // the reply is on the transcript regardless of what summarisation did
  assert.ok(s.transcript.some(x => x.role === "assistant" && x.text === "the newest thing said"),
    "the turn's own reply survives");
});

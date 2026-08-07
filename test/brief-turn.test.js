// Pure tests for the working brief and the turn loop.
// The model is faked, so these run with no key, no network and no cost.

import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeBrief, missingSlots, requiredSlotsFilled, BriefError } from "../src/lib/brief.js";
import { systemFor, TOOLS, runTurn } from "../src/lib/brief-turn.js";

process.env.ANTHROPIC_API_KEY ||= "test-key-not-used";

const emptyBrief = () => ({
  idea: "", proof: { kind: "", detail: "" }, showsProduct: null, demonstration: "",
  intent: "", count: 2, avoid: [], schedule: "", notes: [],
});

const session = (over = {}) => ({
  id: "b_test", brand: "drivertrack", status: "open",
  brief: emptyBrief(), transcript: [], drafts: [], ...over,
});

// A fake Anthropic. Records the request bodies so the batching can be inspected.
function fakeModel(responses) {
  const sent = [];
  const fn = async (_url, opts) => {
    sent.push(JSON.parse(opts.body));
    const next = responses.shift();
    if (!next) throw new Error("fake model ran out of responses");
    return { ok: true, json: async () => next };
  };
  fn.sent = sent;
  return fn;
}

const toolUse = (name, input, id = `tu_${name}`) => ({ type: "tool_use", id, name, input });
const turn = (content, stop = "tool_use") => ({ content, stop_reason: stop, usage: { output_tokens: 10 } });

// --- mergeBrief --------------------------------------------------------------

test("mergeBrief leaves untouched slots alone", () => {
  const b = mergeBrief(emptyBrief(), { idea: "overnight screening" });
  assert.equal(b.idea, "overnight screening");
  assert.equal(b.count, 2);
  assert.equal(b.showsProduct, null);
  assert.deepEqual(b.notes, []);
});

test("mergeBrief rejects an unknown slot rather than silently dropping it", () => {
  assert.throws(() => mergeBrief(emptyBrief(), { vibe: "punchy" }), (e) => {
    assert.ok(e instanceof BriefError);
    assert.match(e.message, /unknown brief slots: vibe/);
    return true;
  });
});

test("mergeBrief enforces the enums the strict schema also carries", () => {
  assert.throws(() => mergeBrief(emptyBrief(), { proof: { kind: "vibes", detail: "" } }), /figure, quote or none/);
  assert.throws(() => mergeBrief(emptyBrief(), { intent: "shouty" }), /direct or opinion/);
});

// Range is the one thing the strict subset cannot express, so it has to live here.
test("mergeBrief enforces the count range strict cannot", () => {
  assert.equal(mergeBrief(emptyBrief(), { count: 7 }).count, 7);
  assert.throws(() => mergeBrief(emptyBrief(), { count: 9 }), /1 to 7/);
  assert.throws(() => mergeBrief(emptyBrief(), { count: 2.5 }), /whole number/);
});

test("avoid replaces and notes append", () => {
  let b = mergeBrief(emptyBrief(), { avoid: ["peak"], notes: ["flatter tone"] });
  b = mergeBrief(b, { avoid: ["churn"], notes: ["no emoji"] });
  assert.deepEqual(b.avoid, ["churn"]);
  assert.deepEqual(b.notes, ["flatter tone", "no emoji"]);
});

// A live run leaked "><parameter name=" into notes. Free text ends up in a prompt.
test("free text is stripped of markup fragments the model can leak", () => {
  const b = mergeBrief(emptyBrief(), {
    idea: "callbacks <eat> the week",
    notes: ["><parameter name=", "  ", "a real note"],
    avoid: ["peak <hiring>"],
    proof: { kind: "figure", detail: "40 <applicants>" },
  });
  assert.equal(b.idea, "callbacks eat the week");
  assert.deepEqual(b.notes, ["parameter name=", "a real note"]);
  assert.deepEqual(b.avoid, ["peak hiring"]);
  assert.equal(b.proof.detail, "40 applicants");
});

test("missingSlots names only the three worth asking about", () => {
  assert.deepEqual(missingSlots(emptyBrief()), ["idea", "proof", "showsProduct"]);
  const full = mergeBrief(emptyBrief(), {
    idea: "x", proof: { kind: "none", detail: "" }, showsProduct: false,
  });
  assert.deepEqual(missingSlots(full), []);
  assert.equal(requiredSlotsFilled(full), true);
});

test("showsProduct false counts as settled, not as missing", () => {
  const b = mergeBrief(emptyBrief(), { showsProduct: false });
  assert.ok(!missingSlots(b).includes("showsProduct"));
});

// --- the system block --------------------------------------------------------

test("the system block is byte-identical across calls, or caching silently stops", () => {
  assert.equal(systemFor("drivertrack"), systemFor("drivertrack"));
  assert.doesNotMatch(systemFor("drivertrack"), /\d{4}-\d{2}-\d{2}T/, "no timestamps in a cached prefix");
});

test("the system block carries the blocks and the theme rule", () => {
  const s = systemFor("drivertrack");
  for (const name of ["thread", "stat", "quote", "cta"]) assert.match(s, new RegExp(`- ${name}:`));
  assert.match(s, /Never ask which theme/);
  assert.match(s, /at most two questions/i);
});

// --- tool schemas ------------------------------------------------------------

test("every tool object sets additionalProperties false, which is not optional", () => {
  const walk = (schema, path) => {
    if (schema?.type === "object") {
      assert.equal(schema.additionalProperties, false, `${path} must set it`);
      assert.ok(Array.isArray(schema.required), `${path} needs a required array`);
      for (const [k, v] of Object.entries(schema.properties || {})) walk(v, `${path}.${k}`);
    }
    if (schema?.type === "array") walk(schema.items, `${path}[]`);
  };
  for (const t of TOOLS) {
    assert.equal(t.strict, true, `${t.name} must be strict`);
    walk(t.input_schema, t.name);
  }
});

// --- the turn loop -----------------------------------------------------------

test("a reply ends the turn and reaches the transcript with its options", async () => {
  const s = session();
  const model = fakeModel([turn([toolUse("reply", { text: "Does it show the product?", options: ["Yes", "No"] })])]);

  const stats = await runTurn(s, { fetchImpl: model });

  assert.equal(stats.rounds, 1);
  assert.deepEqual(s.transcript.at(-1), {
    role: "assistant",
    text: "Does it show the product?",
    options: ["Yes", "No"],
    at: s.transcript.at(-1).at,
  });
});

test("options are clamped to four, since a phone cannot show more", async () => {
  const s = session();
  const model = fakeModel([turn([toolUse("reply", { text: "?", options: ["a", "b", "c", "d", "e", "f"] })])]);
  await runTurn(s, { fetchImpl: model });
  assert.equal(s.transcript.at(-1).options.length, 4);
});

test("update_brief and reply in one message both take effect, brief first", async () => {
  const s = session();
  const model = fakeModel([turn([
    // Deliberately the wrong way round: reply is listed first.
    toolUse("reply", { text: "Right, noted." }),
    toolUse("update_brief", { idea: "screening runs overnight" }),
  ])]);

  await runTurn(s, { fetchImpl: model });

  assert.equal(s.brief.idea, "screening runs overnight", "the mutator must run before the end tool");
  assert.equal(s.transcript.at(-1).text, "Right, noted.");
  assert.equal(model.sent.length, 1, "an ending batch needs no second round trip");
});

test("two tool results go back in one user message", async () => {
  const s = session();
  const model = fakeModel([
    turn([
      toolUse("update_brief", { idea: "overnight" }, "tu_1"),
      toolUse("update_brief", { showsProduct: true }, "tu_2"),
    ]),
    turn([toolUse("reply", { text: "Got it." })]),
  ]);

  await runTurn(s, { fetchImpl: model });

  const second = model.sent[1].messages;
  const results = second.at(-1);
  assert.equal(results.role, "user");
  assert.equal(results.content.length, 2, "both results must ride in one message");
  assert.deepEqual(results.content.map((c) => c.tool_use_id), ["tu_1", "tu_2"]);
  assert.equal(second.at(-2).role, "assistant");
});

test("a bad patch comes back as an error result, and the turn carries on", async () => {
  const s = session();
  const model = fakeModel([
    turn([toolUse("update_brief", { count: 99 }, "tu_bad")]),
    turn([toolUse("reply", { text: "Sorry, two it is." })]),
  ]);

  await runTurn(s, { fetchImpl: model });

  const sentBack = model.sent[1].messages.at(-1).content[0];
  assert.equal(sentBack.is_error, true);
  assert.match(sentBack.content, /1 to 7/);
  assert.equal(s.brief.count, 2, "a rejected patch must not half-apply");
  assert.equal(s.transcript.at(-1).text, "Sorry, two it is.");
});

test("a turn that ends without the end tool is coerced, not dropped", async () => {
  const s = session();
  const model = fakeModel([turn([{ type: "text", text: "Here is a thought." }], "end_turn")]);
  await runTurn(s, { fetchImpl: model });
  assert.equal(s.transcript.at(-1).text, "Here is a thought.");
  assert.deepEqual(s.transcript.at(-1).options, []);
});

test("the round cap still leaves the user something to read", async () => {
  const s = session();
  const model = fakeModel(Array.from({ length: 8 }, () => turn([toolUse("update_brief", { idea: "again" })])));
  const stats = await runTurn(s, { fetchImpl: model });
  assert.equal(stats.rounds, 6);
  assert.equal(s.transcript.at(-1).role, "assistant");
  assert.match(s.transcript.at(-1).text, /round a few times/);
});

test("the request carries the cache marker, forced tool choice, and the brief last", async () => {
  const s = session({ brief: mergeBrief(emptyBrief(), { idea: "overnight screening" }) });
  s.transcript.push({ role: "user", text: "do one about screening" });
  const model = fakeModel([turn([toolUse("reply", { text: "ok" })])]);

  await runTurn(s, { fetchImpl: model });

  const body = model.sent[0];
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });
  assert.deepEqual(body.tool_choice, { type: "any" });
  assert.match(body.messages.at(-1).content, /CURRENT BRIEF/);
  assert.match(body.messages.at(-1).content, /overnight screening/);
  assert.match(body.messages.at(-1).content, /STILL UNSETTLED: proof, showsProduct/);
});

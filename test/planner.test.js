// Pure tests for the planner's validation and budget checks.
// No network, no Chromium, no R2. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { assertBrandReady, checkBudgets, validatePlan } from "../src/lib/planner.js";

const post = (over = {}) => ({
  theme: "dark",
  eyebrow: "Peak hiring",
  headline: "Screened before you open the office",
  accentWord: "",
  display: false,
  blocks: [],
  caption: "c",
  firstComment: "f",
  altText: "a",
  note: "n",
  ...over,
});

// --- assertBrandReady --------------------------------------------------------

test("assertBrandReady accepts a complete brand", () => {
  assert.equal(assertBrandReady("drivertrack").name, "DriverTrack");
});

test("assertBrandReady names what revive is missing, rather than throwing a TypeError", () => {
  assert.throws(() => assertBrandReady("revive"), (e) => {
    assert.match(e.message, /not ready/);
    assert.match(e.message, /budget/);
    assert.match(e.message, /themes/);
    assert.doesNotMatch(e.message, /Cannot read properties/);
    return true;
  });
});

test("assertBrandReady still rejects an unknown brand", () => {
  assert.throws(() => assertBrandReady("nope"), /unknown brand/);
});

// --- checkBudgets ------------------------------------------------------------

test("checkBudgets passes copy that fits", () => {
  assert.deepEqual(checkBudgets(post()), []);
});

test("checkBudgets flags an over-length headline", () => {
  const w = checkBudgets({
    headline: "One two three four five six seven eight nine ten eleven twelve",
  });
  assert.equal(w.length, 1);
  assert.deepEqual(w[0], { field: "headline", words: 12, budget: 9 });
});

// The real failure from gate-fixtures.md: seven words is fine as a headline and
// over budget in display mode, where the type runs much larger.
test("checkBudgets uses the display budget when display is true", () => {
  const spec = { headline: "The callback round costs you an evening" };
  assert.deepEqual(checkBudgets({ ...spec, display: false }), []);
  assert.deepEqual(checkBudgets({ ...spec, display: true }), [
    { field: "headline", words: 7, budget: 6 },
  ]);
});

test("checkBudgets flags an over-length eyebrow", () => {
  const w = checkBudgets({ eyebrow: "one two three four five" });
  assert.deepEqual(w, [{ field: "eyebrow", words: 5, budget: 4 }]);
});

test("checkBudgets reaches inside blocks", () => {
  const w = checkBudgets({
    blocks: [
      { type: "body", text: Array(20).fill("word").join(" ") },
      { type: "points", items: ["fine", Array(9).fill("word").join(" ")] },
    ],
  });
  assert.deepEqual(w.map((x) => x.field), ["blocks[0].text", "blocks[1].items[1]"]);
  assert.equal(w[0].budget, 18);
  assert.equal(w[1].budget, 8);
});

test("checkBudgets is a no-op for a brand with no budget", () => {
  assert.deepEqual(checkBudgets({ headline: Array(30).fill("w").join(" ") }, "revive"), []);
});

// --- validatePlan ------------------------------------------------------------

test("validatePlan drops an unknown block and says so", () => {
  const { posts, warnings } = validatePlan([post({ blocks: [{ type: "carousel" }] })]);
  assert.deepEqual(posts[0].spec.blocks, []);
  assert.ok(warnings.some((w) => w.includes("carousel")));
});

test("validatePlan drops a screenshot that is not in the catalogue", () => {
  const { posts, warnings } = validatePlan([
    post({ blocks: [{ type: "screenshot", name: "invented-screen" }] }),
  ]);
  assert.deepEqual(posts[0].spec.blocks, []);
  assert.ok(warnings.some((w) => w.includes("invented-screen")));
});

test("validatePlan keeps a screenshot given as a URL", () => {
  const { posts } = validatePlan([
    post({ blocks: [{ type: "screenshot", name: "https://example.com/a.png" }] }),
  ]);
  assert.equal(posts[0].spec.blocks.length, 1);
});

test("validatePlan enforces two blocks, three with a cta", () => {
  const three = validatePlan([
    post({ blocks: [{ type: "body" }, { type: "points" }, { type: "quote" }] }),
  ]);
  assert.equal(three.posts[0].spec.blocks.length, 2);

  const withCta = validatePlan([
    post({ blocks: [{ type: "body" }, { type: "points" }, { type: "cta" }] }),
  ]);
  assert.deepEqual(withCta.posts[0].spec.blocks.map((b) => b.type), ["body", "points", "cta"]);
});

test("validatePlan drops a post with no headline", () => {
  const { posts, warnings } = validatePlan([post({ headline: "" })]);
  assert.equal(posts.length, 0);
  assert.ok(warnings.some((w) => w.includes("no headline")));
});

test("validatePlan normalises theme to dark or light", () => {
  assert.equal(validatePlan([post({ theme: "midnight" })]).posts[0].spec.theme, "light");
  assert.equal(validatePlan([post({ theme: "dark" })]).posts[0].spec.theme, "dark");
});

test("validatePlan strips the dashes the brand voice forbids", () => {
  const { posts } = validatePlan([post({ headline: "Screened overnight — before you open" })]);
  assert.equal(posts[0].spec.headline, "Screened overnight, before you open");
});

test("validatePlan surfaces budget breaches as warnings", () => {
  const { warnings } = validatePlan([
    post({ display: true, headline: "The callback round costs you an evening" }),
  ]);
  assert.ok(warnings.some((w) => w.includes("headline is 7 words, budget 6")));
});

test("validatePlan accepts a bare object as well as an array", () => {
  assert.equal(validatePlan(post()).posts.length, 1);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  extractQuantities,
  inventedQuantities,
  vaguePhrases,
  collectCopy,
  auditPost,
} from "../src/lib/quantities.js";

const values = (text) => [...extractQuantities(text).keys()].sort((a, b) => a - b);
const invented = (post, brief) => inventedQuantities(post, brief).map((x) => x.value);

// ---------------------------------------------------------------------------
// the bug the 5 August baseline run hit
// ---------------------------------------------------------------------------

test("forty and 40 are the same number", () => {
  assert.deepEqual(invented("forty applicants went through", "40 applicants went through"), []);
  assert.deepEqual(invented("40 applicants went through", "forty applicants went through"), []);
});

test("F1's real figures do not come back as inventions", () => {
  const brief =
    "Post about the overnight screening. Figure I can use: 40 applicants went through it in " +
    "one night and 11 were booked in for interview by Monday morning.";
  const post = "11 interviews booked from 40 applicants screened overnight in one night";
  assert.deepEqual(invented(post, brief), []);
});

test("a figure absent from the brief is still flagged", () => {
  const brief = "40 applicants went through it in one night and 11 were booked.";
  assert.deepEqual(invented("saves you 5 hours", brief), [5]);
});

// ---------------------------------------------------------------------------
// number forms
// ---------------------------------------------------------------------------

test("compound number words resolve, hyphenated or spaced", () => {
  assert.ok(values("twenty-five drivers").includes(25));
  assert.ok(values("twenty five drivers").includes(25));
});

test("scales and the and-joiner resolve", () => {
  assert.ok(values("a hundred and twenty applicants").includes(120));
  assert.ok(values("two thousand drivers").includes(2000));
  assert.ok(values("a dozen callbacks").includes(12));
});

test("thousands separators and magnitude suffixes normalise", () => {
  assert.deepEqual(invented("5,000 applicants", "five thousand applicants"), []);
  assert.deepEqual(invented("10k applicants", "ten thousand applicants"), []);
  assert.ok(values("1.5 hours").includes(1.5));
});

test("percentages match their bare number", () => {
  assert.deepEqual(invented("50% of owners", "50 out of every hundred owners"), []);
});

test("a unit starting with a magnitude letter is not read as a magnitude", () => {
  // "40 min" must be 40, not forty million — the trap in the suffix regex
  assert.deepEqual(values("40 min per week"), [40]);
  assert.deepEqual(values("15 minute demo"), [15]);
});

test("punctuation and or break a run rather than summing it", () => {
  assert.deepEqual(values("two, three drivers"), [2, 3]);
  assert.deepEqual(values("two or three drivers"), [2, 3]);
});

test("ordinals are not treated as quantities", () => {
  // mapping "first" to 1 is what would reintroduce false positives
  assert.deepEqual(values("the first thing owners notice"), []);
});

test("a bare article is not a quantity", () => {
  assert.deepEqual(values("a callback from an owner"), []);
});

// ---------------------------------------------------------------------------
// vague phrases
// ---------------------------------------------------------------------------

test("vague quantity phrases are found with context", () => {
  const hits = vaguePhrases("It eats a huge chunk of the week and applications roughly tripled");
  const found = hits.map((h) => h.phrase);
  assert.ok(found.includes("chunk of"));
  assert.ok(found.includes("tripled"));
  assert.ok(found.includes("roughly"));
  assert.ok(hits.every((h) => h.context.length > 0));
});

test("vague phrases are reported even when the brief used the same word", () => {
  // F2: the brief says "the next evening" (a time of day), the post says "costs you
  // an evening" (a duration). Only the second is a quantity, and no matcher can tell
  // them apart — so the phrase is always surfaced for a human call.
  const hits = vaguePhrases("The callback round costs you an evening");
  assert.ok(hits.some((h) => h.phrase === "an evening"));
});

// ---------------------------------------------------------------------------
// walking a post
// ---------------------------------------------------------------------------

test("collectCopy reaches graphic copy and LinkedIn copy alike", () => {
  const post = {
    spec: {
      eyebrow: "Peak hiring",
      headline: "the main line",
      blocks: [
        { type: "stat", value: "12", unit: "min", label: "average screen" },
        { type: "thread", title: "Automated screener", messages: [{ text: "Q5 of 5: nine hour routes?" }] },
      ],
    },
    caption: "the LinkedIn post",
    firstComment: "link line\n\nquestion line",
  };
  const fields = collectCopy(post).map((f) => f.field);
  assert.ok(fields.includes("headline"));
  assert.ok(fields.includes("blocks[0].value"));
  assert.ok(fields.includes("blocks[1].messages[0].text"));
  assert.ok(fields.includes("firstComment"));
});

test("collectCopy skips the screenshot catalogue name", () => {
  const fields = collectCopy({ spec: { blocks: [{ type: "screenshot", name: "pipeline" }] } });
  assert.deepEqual(fields, []);
});

test("auditPost catches an invented figure in the first comment", () => {
  // F2's actual baseline failure: nothing in the brief supports five hours
  const brief = "Do one about the time owners lose to callbacks. It eats a huge chunk of the week.";
  const post = {
    spec: { headline: "The callback round costs you an evening", blocks: [] },
    firstComment: "What would you do with five hours back this week?",
  };
  const { invented: inv, vague } = auditPost(post, brief);
  assert.ok(inv.some((x) => x.value === 5), "five hours should be flagged");
  assert.ok(vague.some((v) => v.phrase === "an evening"), "an evening should be surfaced");
});

test("auditPost is clean on a post that only reuses the brief's figures", () => {
  const brief = "40 applicants went through it in one night and 11 were booked in for interview.";
  const post = {
    spec: {
      headline: "Eleven interviews booked overnight",
      blocks: [{ type: "stat", value: "11", unit: "booked", label: "from 40 applicants screened overnight" }],
    },
    caption: "Forty applicants, one night.",
  };
  assert.deepEqual(auditPost(post, brief).invented, []);
});

// F1's baseline printed "Half your applicants won't answer a call from a number they
// don't know" — a fabricated statistic the first version of this module walked straight
// past, because fractions were in neither pass.
test("fractions are surfaced as quantity claims", () => {
  const hits = vaguePhrases("Half your applicants won't answer a call");
  assert.ok(hits.some((h) => h.phrase === "half"), "half is a quantity claim");
});

test("fractions stay out of the numeric pass, so ordinals do not false-positive", () => {
  assert.deepEqual(values("the third thing owners notice"), []);
  assert.deepEqual(values("half your applicants"), []);
});

// Settled 7 August 2026: a thread is a mockup, not a claim about results. Both paths
// produce threads, so counting their contents measures thread length, not honesty.
test("thread sample content is reported but not counted against C2", () => {
  const brief = "Post about the overnight screening. Show the screening thread.";
  const post = {
    spec: {
      headline: "Interviews booked while you were asleep",
      blocks: [{ type: "thread", title: "Automated screener", messages: [
        { text: "Q4 of 5: full UK licence with no more than 6 points?" },
        { text: "Yes, clean licence, held 4 years" },
      ] }],
    },
  };
  const { invented, illustrative } = auditPost(post, brief);
  assert.deepEqual(invented, [], "nothing from inside the thread counts");
  assert.ok(illustrative.length > 0, "but it is still reported");
});

// The exemption is the block, not the number. Escaping into prose is a failure again.
test("a figure asserted in the caption still counts, thread or no thread", () => {
  const brief = "Post about the overnight screening. Show the screening thread.";
  const post = {
    spec: { headline: "h", blocks: [{ type: "thread", messages: [{ text: "Q5 of 5" }] }] },
    caption: "An applicant answered five questions at 11pm on a Sunday.",
  };
  const { invented } = auditPost(post, brief);
  assert.ok(invented.some((x) => x.value === 5), "the caption claim is still a C2 failure");
});

#!/usr/bin/env node
// The mechanical half of the criterion 2 and 4 scoring pass in gate-fixtures.md.
//
//   node scripts/gate-check.js <brief-file> <plan-json-file>
//   ... | node scripts/gate-check.js <brief-file> -
//
// The plan JSON is whatever `POST /plan { create: false }` returned, for either path.
// C1 (theme) and C3 (block choice) are judgement and stay on the scoresheet by hand —
// C3 is scored blind, so this tool deliberately does not print which path it read.

import { readFileSync } from "node:fs";

import { auditPost, vaguePhrases } from "../src/lib/quantities.js";
import { checkBudgets } from "../src/lib/planner.js";

const [, , briefPath, planPath] = process.argv;

if (!briefPath || !planPath) {
  console.error("usage: node scripts/gate-check.js <brief-file> <plan-json-file|->");
  process.exit(2);
}

const read = (p) => (p === "-" ? readFileSync(0, "utf8") : readFileSync(p, "utf8"));

const brief = read(briefPath);
let plan;
try {
  plan = JSON.parse(read(planPath));
} catch (err) {
  console.error(`could not parse ${planPath} as JSON: ${err.message}`);
  process.exit(2);
}

const posts = Array.isArray(plan) ? plan : plan.posts || [];
if (!posts.length) {
  console.error("no posts in that plan");
  process.exit(2);
}

// Anything the brief itself hedges with is worth seeing once, because a post that
// repeats the hedge as fact is the F3 laundering failure.
const briefVague = vaguePhrases(brief);
if (briefVague.length) {
  console.log("brief hedges with:", [...new Set(briefVague.map((v) => v.phrase))].join(", "));
  console.log("");
}

let c2Failures = 0;
let c4Failures = 0;

for (const [i, post] of posts.entries()) {
  const spec = post.spec || post;
  const { invented, vague } = auditPost(post, brief);
  const budget = checkBudgets(spec, post.brand || "drivertrack");

  console.log(`── post ${i + 1} ${"─".repeat(52)}`);
  console.log(`   display: ${spec.display ? "true" : "false"}   theme: ${spec.theme || "?"}   blocks: ${(spec.blocks || []).map((b) => b.type).join(", ") || "none"}`);

  // C2
  if (invented.length) {
    c2Failures += 1;
    console.log("\n   C2  quantities not in the brief — confirm each is really a quantity:");
    for (const { value, uses } of invented) {
      for (const use of uses) console.log(`         ${String(value).padStart(9)}  "${use.surface}"  in: ${use.context}`);
    }
  } else {
    console.log("\n   C2  no unsourced numbers");
  }

  if (vague.length) {
    const seen = new Set();
    console.log("       vague quantity phrases — human call, not subtracted:");
    for (const v of vague) {
      if (seen.has(v.phrase)) continue;
      seen.add(v.phrase);
      console.log(`         ${v.phrase.padStart(14)}  in: ${v.context}`);
    }
  }

  // C4
  if (budget.length) {
    c4Failures += 1;
    console.log("\n   C4  over budget:");
    for (const b of budget) console.log(`         ${b.field}: ${b.words} words, budget ${b.budget}`);
  } else {
    console.log("\n   C4  all copy within budget");
  }
  console.log("");
}

console.log("─".repeat(64));
console.log(`posts: ${posts.length}   C2 posts with candidates: ${c2Failures}   C4 posts over budget: ${c4Failures}`);
console.log("C1 (theme) and C3 (block choice) are scored by hand. Score C3 blind.");

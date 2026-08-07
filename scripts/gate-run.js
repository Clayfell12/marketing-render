#!/usr/bin/env node
// Harness for the success gate in gate-fixtures.md §13.
//
//   node scripts/gate-run.js baseline [f1 f2 ...]   run POST /plan's path, unattended
//   node scripts/gate-run.js chat f2                start the chat path on a fixture
//   node scripts/gate-run.js say f2 "no, no figure" send one honest answer
//   node scripts/gate-run.js show f2                current brief, drafts and status
//   node scripts/gate-run.js score f2               run gate-check over both paths
//
// Sessions are kept on disk under gate-runs/, not in R2: the gate stops at
// declare_ready, so nothing here renders, needs Chromium, or touches production
// storage. Only ANTHROPIC_API_KEY is required.
//
// The chat path is deliberately one message per invocation. §13 says to answer as you
// genuinely would, and feeding it the answer you know it wants is how you fake a pass —
// so the answers have to come from a person, one turn at a time.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { __setBackend, createSession, getSession, withLock, composeBriefText } from "../src/lib/brief.js";
import { runTurn } from "../src/lib/brief-turn.js";
import { planPosts } from "../src/lib/planner.js";

const RUNS = "gate-runs";
mkdirSync(RUNS, { recursive: true });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. The gate makes real model calls.");
  process.exit(2);
}

// --- a filesystem store standing in for R2 ----------------------------------

const safe = (k) => k.replace(/[/\\]/g, "__");
__setBackend({
  store: {
    async putJson(k, v) { writeFileSync(join(RUNS, safe(k)), JSON.stringify(v, null, 2)); },
    async getJson(k) {
      const p = join(RUNS, safe(k));
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
    },
    async deleteKey(k) { const p = join(RUNS, safe(k)); if (existsSync(p)) unlinkSync(p); return true; },
    async listKeys(prefix) {
      return readdirSync(RUNS)
        .filter((f) => f.startsWith(safe(prefix)))
        .map((f) => f.replace(/__/g, "/"));
    },
  },
});

// --- fixtures ---------------------------------------------------------------

const briefText = (fx) => readFileSync(join("fixtures", `${fx}.txt`), "utf8").trim();
const ALL = ["f1", "f2", "f3", "f4", "f5", "f6"];

// Which session belongs to which fixture. Kept out of the store so a fixture can be
// restarted without hunting for its id.
const indexPath = join(RUNS, "index.json");
const readIndex = () => (existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {});
const writeIndex = (ix) => writeFileSync(indexPath, JSON.stringify(ix, null, 2));

// --- output -----------------------------------------------------------------

const rule = (s) => console.log(`\n${"─".repeat(70)}\n${s}\n${"─".repeat(70)}`);

function showTurn(session) {
  const last = session.transcript.at(-1);
  console.log(`\n  ${last?.text || "(nothing said)"}`);
  if (last?.options?.length) console.log(`\n  options: ${last.options.map((o) => `[${o}]`).join("  ")}`);

  console.log(`\n  status: ${session.status}   rev: ${session.rev}`);
  const missing = ["idea", "proof", "showsProduct"].filter((k) =>
    k === "proof" ? !session.brief.proof?.kind : k === "showsProduct"
      ? typeof session.brief.showsProduct !== "boolean"
      : !session.brief[k]
  );
  console.log(`  brief: ${missing.length ? `still unsettled — ${missing.join(", ")}` : "settled"}`);
  const standing = session.drafts.filter((d) => d.state === "open" || d.state === "approved");
  if (standing.length) {
    console.log(`  drafts:`);
    for (const d of standing) {
      console.log(`    ${d.draftId} ${d.spec?.display ? "display " : ""}${d.spec?.theme}  ${d.spec?.headline}`);
      for (const w of d.warnings || []) console.log(`        ! ${w}`);
    }
  }
}

// Drafts written in the same shape as a plan response, so gate-check.js reads both
// paths with no special casing.
function saveChat(fx, session) {
  const posts = session.drafts
    .filter((d) => d.state === "open" || d.state === "approved")
    .map((d) => ({
      brand: session.brand, spec: d.spec, caption: d.caption,
      firstComment: d.firstComment, altText: d.altText, note: d.note, scheduledFor: d.scheduledFor,
    }));
  writeFileSync(join(RUNS, `${fx}-chat.json`), JSON.stringify({ posts }, null, 2));
  writeFileSync(join(RUNS, `${fx}-chat-session.json`), JSON.stringify(session, null, 2));
}

// --- commands ---------------------------------------------------------------

async function baseline(which) {
  for (const fx of which) {
    const brief = briefText(fx);
    rule(`${fx.toUpperCase()} baseline — POST /plan, create: false`);
    console.log(brief);
    try {
      const out = await planPosts({ brand: "drivertrack", brief, count: 2, create: false });
      writeFileSync(join(RUNS, `${fx}-baseline.json`), JSON.stringify(out, null, 2));
      console.log(`\n  ${out.posts.length} posts -> ${RUNS}/${fx}-baseline.json`);
      for (const p of out.posts) {
        console.log(`    ${p.spec.display ? "display " : ""}${p.spec.theme}  ${p.spec.headline}`);
        console.log(`      blocks: ${p.spec.blocks.map((b) => b.type).join(", ") || "none"}`);
      }
      for (const w of out.warnings) console.log(`    ! ${w}`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }
}

async function chat(fx) {
  const session = await createSession({ brand: "drivertrack" });
  const ix = readIndex();
  ix[fx] = session.id;
  writeIndex(ix);

  rule(`${fx.toUpperCase()} chat — new session ${session.id}`);
  console.log(briefText(fx));
  await say(fx, briefText(fx));
}

async function say(fx, text) {
  const ix = readIndex();
  const id = ix[fx];
  if (!id) throw new Error(`no chat session for ${fx}. Run: gate-run.js chat ${fx}`);

  const { session, result } = await withLock(id, {
    before: (s) => { s.transcript.push({ role: "user", text, at: new Date().toISOString() }); },
    work: (s) => runTurn(s),
  });

  saveChat(fx, session);
  showTurn(session);
  console.log(`\n  [${result.rounds} rounds, tools: ${result.tools.join(" → ") || "none"}, ` +
    `cache read ${result.cacheRead}, ${result.ms}ms]`);

  if (session.status === "ready") {
    console.log(`\n  READY. Drafts saved to ${RUNS}/${fx}-chat.json — score with:`);
    console.log(`    node scripts/gate-run.js score ${fx}`);
  }
}

async function show(fx) {
  const id = readIndex()[fx];
  if (!id) throw new Error(`no chat session for ${fx}`);
  const session = await getSession(id);
  rule(`${fx.toUpperCase()} — ${session.status}`);
  console.log(JSON.stringify(session.brief, null, 2));
  console.log("\nBRIEF AS THE PLANNER SEES IT\n");
  console.log(composeBriefText(session));
  showTurn(session);
}

// Both paths through the same mechanical check. It prints which file it read, but
// gate-check itself does not know which path produced it — C3 still gets scored blind,
// off the drafts, not off this.
async function score(fx) {
  const { spawnSync } = await import("node:child_process");
  for (const path of ["baseline", "chat"]) {
    const file = join(RUNS, `${fx}-${path}.json`);
    if (!existsSync(file)) {
      console.log(`\n${fx} ${path}: not run yet`);
      continue;
    }
    rule(`${fx.toUpperCase()} ${path} — C2 and C4`);
    spawnSync(process.execPath, ["scripts/gate-check.js", join("fixtures", `${fx}.txt`), file], {
      stdio: "inherit",
    });
  }
}

export { baseline, chat, say, show, score };

const [, , cmd, ...rest] = process.argv;

try {
  if (cmd === "baseline") await baseline(rest.length ? rest : ALL);
  else if (cmd === "chat") await chat(rest[0]);
  else if (cmd === "say") await say(rest[0], rest.slice(1).join(" "));
  else if (cmd === "show") await show(rest[0]);
  else if (cmd === "score") for (const fx of rest.length ? rest : ALL) await score(fx);
  else {
    console.error("usage: gate-run.js baseline|chat|say|show|score ...");
    process.exit(2);
  }
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}

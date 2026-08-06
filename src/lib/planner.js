// The planner.
// Takes a brief and returns complete posts. It does not pick a template, because
// there are no templates any more. It composes: it decides what the headline is,
// which blocks the argument needs, and what goes in them. The shell (ground, logo,
// eyebrow with the fluent device, headline treatment) is locked and not its business.
//
// See DESIGN-SPEC.md. The constraints below are from evidence, not taste:
//   - one idea per graphic, because a feed post gets 1 to 2 seconds of attention
//   - two blocks maximum, three only with a cta, same reason
//   - copy budgets, because the type size is fixed by legibility and cannot shrink

import { drivertrack } from "../tokens/drivertrack.js";
import { revive } from "../tokens/revive.js";
import { BLOCK_CATALOGUE } from "../blocks.js";
import { shotCatalogue } from "./capture.js";
import { listPosts, createPost } from "./posts.js";

const BRANDS = { drivertrack, revive };
const MODEL = process.env.COPY_MODEL || "claude-sonnet-5";

// Thinking depth. Left unset so the model's default applies, because the recorded
// baseline in gate-fixtures.md was measured at the default and changing it here would
// invalidate that measurement. Sweep it with COPY_EFFORT (low, medium, high, xhigh, max)
// when there is something to compare against.
const EFFORT = process.env.COPY_EFFORT || "";

// A brand is only usable if its token file carries everything the pipeline reads.
// Without this, revive fails at `bud.headline` inside buildPrompt with a TypeError and
// the caller sees "Cannot read properties of undefined" as a 500.
export function assertBrandReady(brand) {
  const b = BRANDS[brand];
  if (!b) throw new Error(`unknown brand '${brand}'`);
  const missing = ["budget", "themes", "voice"].filter((k) => !b[k]);
  if (missing.length) {
    throw new Error(
      `brand '${brand}' is not ready: tokens are missing ${missing.join(", ")}. ` +
        `See src/tokens/${brand}.js.`
    );
  }
  return b;
}

function words(s) {
  return String(s == null ? "" : s).trim().split(/\s+/).filter(Boolean).length;
}

// What a conversational layer needs to know about blocks: the names and roughly what
// each is for. Not the shapes — those are this file's business, and duplicating them
// into a second prompt is how the two drift apart.
export function blockNamesForPrompt() {
  return BLOCK_CATALOGUE.map((b) => `${b.name}: ${b.useWhen.split(". ")[0]}.`);
}

// Copy budgets exist in the token file and are stated in the prompt, but nothing has
// ever checked that the output obeys them. It does not: a display post came back at
// seven words against a six-word budget on 5 August 2026. Type size is fixed by
// legibility and cannot shrink, so over-budget copy wraps or overflows.
//
// Warnings, not errors. The graphic still renders; the caller decides what to do.
export function checkBudgets(spec = {}, brand = "drivertrack") {
  const bud = (BRANDS[brand] || {}).budget;
  if (!bud) return [];

  const out = [];
  const flag = (field, text, budget) => {
    const n = words(text);
    if (n > budget) out.push({ field, words: n, budget });
  };

  flag("headline", spec.headline, spec.display ? bud.display : bud.headline);
  flag("eyebrow", spec.eyebrow, 4);

  for (const [i, b] of (spec.blocks || []).entries()) {
    const at = (name) => `blocks[${i}].${name}`;
    if (b.type === "body") flag(at("text"), b.text, bud.body);
    if (b.type === "stat") flag(at("label"), b.label, bud.small);
    if (b.type === "quote") flag(at("text"), b.text, bud.small);
    if (b.type === "points") {
      (b.items || []).forEach((x, j) => flag(at(`items[${j}]`), x, 8));
    }
    if (b.type === "rows") {
      (b.items || []).forEach((r, j) => flag(at(`items[${j}].detail`), r.detail, bud.small));
    }
    if (b.type === "compare") {
      (b.columns || []).forEach((c, j) => flag(at(`columns[${j}].text`), c.text, bud.small));
    }
  }
  return out;
}

function buildPrompt({ brand, brief, count, recent }) {
  const b = BRANDS[brand];
  const v = b.voice;
  const bud = b.budget;

  const blocks = BLOCK_CATALOGUE
    .map((x) => `  "${x.name}"\n    ${x.useWhen}\n    shape: ${x.shape}`)
    .join("\n\n");

  const shots = shotCatalogue().map((s) => `  - ${s.name}: ${s.description}`).join("\n");

  const recentLines = recent.length
    ? recent.map((p) => `  - ${(p.note || p.caption || "").slice(0, 110)}`).join("\n")
    : "  (nothing yet)";

  return `You are the creative lead for ${b.name}. Plan ${count} LinkedIn post${count > 1 ? "s" : ""}.

AUDIENCE
${v.audience}

REGISTER
${v.register}

DO
${v.doThis.map((x) => `- ${x}`).join("\n")}

AVOID
${v.avoid.map((x) => `- ${x}`).join("\n")}

FIXED FACTS (use exactly, never invent a variation)
- The website is ${b.links ? b.links.site : "drivertrack.co"}. No .co.uk, no /demo path.

HOW A GRAPHIC IS BUILT
Every graphic has the same locked shell: brand ground, logo, an eyebrow with a blue
diamond, and a headline. You write the eyebrow and the headline. You then choose the
blocks that sit underneath. You do not choose a template or a layout.

BLOCKS AVAILABLE
${blocks}

PRODUCT SCREENSHOTS (for the screenshot block)
${shots}

ALREADY IN THE QUEUE (do not repeat these angles)
${recentLines}

THE BRIEF
${brief}

HARD CONSTRAINTS
- ONE idea per graphic. A feed post gets one to two seconds of attention. Two ideas
  means two posts. This is not a style preference.
- TWO blocks maximum. Three only if one of them is a cta.
- Copy budgets, because type size is fixed by legibility and cannot shrink to fit:
    eyebrow    2 to 4 words, no punctuation
    headline   ${bud.headline} words maximum
    body       ${bud.body} words maximum
    row name   3 words maximum, it truncates if longer
    row detail ${bud.small} words maximum
    column title 3 words maximum
    column text ${bud.small} words maximum
    point      8 words maximum each
- Never invent a statistic, result, customer name or quote. If the brief supplies no
  proof, argue from reasoning. Do NOT use the "stat" block without a real figure or
  the "quote" block without a real quote.
- Use "display": true for a pure statement post: the headline runs large and centred
  and carries no blocks. Use it when the post is an opinion rather than a demonstration.
- Choose blocks for the argument, never for variety.
- Choose a theme. "dark" for anything showing the product: threads, screenshots,
  screening decisions, pipelines. "light" for bold statement posts: an opinion or a
  piece of advice with no product in it. This is a rule, not a preference. Mixing
  them at random undoes the recognition that consistent assets build.
- accentWord may pick out one short phrase from the headline, usually the payoff or
  the turn. Leave it empty rather than forcing one. Never more than one phrase.

WRITING
- caption is the LinkedIn post: 120 to 250 words, short paragraphs, a hook in the first
  line that survives truncation, no hashtags, no emoji unless the brief asks.
- firstComment is TWO lines separated by a blank line. First: a short lead in plus the
  link. Second: one open question ending in a question mark. Never run them together.
- altText describes the graphic for a screen reader in one or two sentences.
- note is one sentence on why this angle, for the human reviewing.

Return ONLY a JSON array of ${count} objects, no markdown fences, no commentary:
[
  {
    "theme": "dark",
    "eyebrow": "Peak hiring",
    "headline": "the main line",
    "accentWord": "one phrase from the headline to set in accent colour, or empty",
    "display": false,
    "blocks": [ { "type": "body", "text": "..." } ],
    "scheduledFor": "Monday",
    "note": "why this angle",
    "caption": "the LinkedIn post",
    "firstComment": "link line\\n\\nquestion line",
    "altText": "description of the graphic"
  }
]`;
}

// Turn whatever the model returned into posts the renderer can accept, dropping
// anything invented rather than letting it reach the composer. Extracted from planPosts
// unchanged, so that a conversational layer can re-validate a hand-edited draft without
// spending another model call.
export function validatePlan(plans, brand = "drivertrack") {
  const validBlocks = new Set(BLOCK_CATALOGUE.map((x) => x.name));
  const validShots = new Set(shotCatalogue().map((s) => s.name));
  const dashes = (x) => String(x || "").replace(/\s*[–—]\s*/g, ", ").trim();

  const posts = [];
  const warnings = [];

  for (const p of Array.isArray(plans) ? plans : [plans]) {
    // Validate blocks against what exists, so nothing invented reaches the renderer
    let blocks = Array.isArray(p.blocks) ? p.blocks : [];
    blocks = blocks.filter((bl) => {
      if (!bl || !validBlocks.has(bl.type)) {
        if (bl) warnings.push(`dropped unknown block '${bl.type}'`);
        return false;
      }
      if (bl.type === "screenshot") {
        const n = bl.name || "";
        if (!validShots.has(n) && !/^https?:/.test(n)) {
          warnings.push(`dropped screenshot '${n}', not in the catalogue`);
          return false;
        }
      }
      return true;
    });

    // Enforce the block limit here as well as in the composer
    const ctas = blocks.filter((x) => x.type === "cta").slice(0, 1);
    const rest = blocks.filter((x) => x.type !== "cta").slice(0, 2);
    blocks = [...rest, ...ctas];

    if (!p.headline) { warnings.push("dropped a post with no headline"); continue; }

    const spec = {
      theme: p.theme === "dark" ? "dark" : "light",
      eyebrow: dashes(p.eyebrow),
      headline: dashes(p.headline),
      accentWord: dashes(p.accentWord || ""),
      display: Boolean(p.display),
      blocks,
    };

    for (const b of checkBudgets(spec, brand)) {
      warnings.push(`${b.field} is ${b.words} words, budget ${b.budget}`);
    }

    posts.push({
      brand,
      spec,
      caption: dashes(p.caption),
      firstComment: String(p.firstComment || ""),
      altText: String(p.altText || ""),
      note: dashes(p.note),
      scheduledFor: String(p.scheduledFor || ""),
    });
  }

  return { posts, warnings };
}

export async function planPosts({ brand = "drivertrack", brief, count = 3, create = false }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  if (!brief || !brief.trim()) throw new Error("A brief is required.");
  assertBrandReady(brand);

  const all = await listPosts().catch(() => []);
  const recent = all.filter((p) => p.brand === brand && p.status !== "rejected").slice(0, 12);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    // max_tokens caps thinking AND response text together, and thinking is on by
    // default on current models. At 8000 a seven-post plan could exhaust the budget
    // mid-array, and truncated JSON surfaced as "Could not read the plan. Try rewording
    // the brief." — a message that blamed the brief for a token ceiling.
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      ...(EFFORT ? { output_config: { effort: EFFORT } } : {}),
      messages: [{ role: "user", content: buildPrompt({ brand, brief, count, recent }) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Planning failed (${res.status}). ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = (json.content || [])
    .filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();

  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let plans;
  try {
    plans = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("Could not read the plan. Try rewording the brief.");
    plans = JSON.parse(m[0]);
  }
  if (!Array.isArray(plans)) plans = [plans];

  const { posts: clean, warnings } = validatePlan(plans, brand);

  if (!clean.length) throw new Error("The plan produced nothing usable. " + warnings.join("; "));

  if (!create) return { ok: true, planned: clean.length, posts: clean, warnings };

  const made = [];
  for (const item of clean) made.push(await createPost(item));
  return { ok: true, created: made.length, posts: made, warnings };
}

export default planPosts;

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
    "eyebrow": "Peak hiring",
    "headline": "the main line",
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

export async function planPosts({ brand = "drivertrack", brief, count = 3, create = false }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  if (!brief || !brief.trim()) throw new Error("A brief is required.");
  if (!BRANDS[brand]) throw new Error(`unknown brand '${brand}'`);

  const all = await listPosts().catch(() => []);
  const recent = all.filter((p) => p.brand === brand && p.status !== "rejected").slice(0, 12);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
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

  const validBlocks = new Set(BLOCK_CATALOGUE.map((x) => x.name));
  const validShots = new Set(shotCatalogue().map((s) => s.name));
  const dashes = (x) => String(x || "").replace(/\s*[\u2013\u2014]\s*/g, ", ").trim();

  const clean = [];
  const warnings = [];

  for (const p of plans) {
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

    clean.push({
      brand,
      spec: {
        eyebrow: dashes(p.eyebrow),
        headline: dashes(p.headline),
        display: Boolean(p.display),
        blocks,
      },
      caption: dashes(p.caption),
      firstComment: String(p.firstComment || ""),
      altText: String(p.altText || ""),
      note: dashes(p.note),
      scheduledFor: String(p.scheduledFor || ""),
    });
  }

  if (!clean.length) throw new Error("The plan produced nothing usable. " + warnings.join("; "));

  if (!create) return { ok: true, planned: clean.length, posts: clean, warnings };

  const made = [];
  for (const item of clean) made.push(await createPost(item));
  return { ok: true, created: made.length, posts: made, warnings };
}

export default planPosts;

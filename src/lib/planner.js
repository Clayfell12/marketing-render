// The planner.
// Takes a brief ("a week of content", "something about peak hiring") and returns
// complete posts: template chosen, every field written, screenshot selected,
// caption, first comment, alt text, and a note on why that angle.
//
// What makes it content-aware rather than a template filler:
//   - Each template carries a `useWhen` line, so the model picks by job not by name.
//   - Each screenshot carries a description, so the image supports the argument.
//   - The existing queue is shown to it, so it does not repeat angles or templates.
//   - Each field's current default is shown as a worked example of correct length,
//     which keeps copy inside the layout without maintaining character limits.

import { drivertrack } from "../tokens/drivertrack.js";
import { revive } from "../tokens/revive.js";
import { schemas, defaultsFor } from "../templates/index.js";
import { shotCatalogue } from "./capture.js";
import { listPosts, createPost } from "./posts.js";

const BRANDS = { drivertrack, revive };
const MODEL = process.env.COPY_MODEL || "claude-sonnet-5";

function templateBrief(schema) {
  const defaults = defaultsFor(schema.key);
  const fields = schema.fields
    .filter((f) => f.type !== "url")
    .map((f) => {
      const eg = defaults[f.name];
      return `    - ${f.name}${f.optional ? " (optional)" : ""}` +
        (eg ? `\n      length guide: ${JSON.stringify(String(eg).slice(0, 180))}` : "");
    })
    .join("\n");
  const hero = schema.fields.some((f) => f.name === "heroImage");
  return `  ${schema.key} — ${schema.label}
    ${schema.useWhen || schema.blurb}
    fields:
${fields}${hero ? "\n    - heroImage: pick a screenshot name from the list below" : ""}`;
}

function buildPrompt({ brand, brief, count, recent }) {
  const b = BRANDS[brand];
  const v = b.voice;
  const mine = schemas.filter((s) => s.brand === brand);

  const recentLines = recent.length
    ? recent.map((p) => `  - ${p.template}: ${(p.note || p.caption || "").slice(0, 120)}`).join("\n")
    : "  (nothing yet)";

  const shots = shotCatalogue().map((s) => `  - ${s.name}: ${s.description}`).join("\n");

  return `You are the creative lead for ${b.name}. Plan ${count} LinkedIn post${count > 1 ? "s" : ""}.

AUDIENCE
${v.audience}

REGISTER
${v.register}

DO
${v.doThis.map((x) => `- ${x}`).join("\n")}

AVOID
${v.avoid.map((x) => `- ${x}`).join("\n")}

TEMPLATES AVAILABLE
${mine.map(templateBrief).join("\n\n")}

PRODUCT SCREENSHOTS AVAILABLE
${shots}

ALREADY IN THE QUEUE (do not repeat these angles, and vary the templates used)
${recentLines}

THE BRIEF
${brief}

RULES
- One single-minded point per post. If an angle contains two ideas, split or drop one.
- Choose the template that fits the ARGUMENT, not the one that looks nice.
- Vary the templates across the set. Do not use the same one twice unless the brief demands it.
- Never invent a statistic, result, customer name or quote. If the brief supplies no
  proof, argue from reasoning and operational experience instead. Do not use the stat
  or quote templates unless the brief gives you a real figure or a real quote.
- Copy on the image must match the length guides. Longer copy breaks the layout.
- The caption is the LinkedIn post itself: 120 to 250 words, short paragraphs, a hook
  in the first line that survives truncation, no hashtags, no emoji unless asked.
- firstComment holds the link and one genuine question to invite replies.
- altText describes the graphic for a screen reader in one or two sentences.
- note explains in one sentence why this angle was chosen. It is for the human reviewing.

Return ONLY a JSON array of ${count} objects, no markdown fences, no commentary:
[
  {
    "template": "one of the template keys above",
    "scheduledFor": "Monday",
    "note": "why this angle",
    "data": { every field for that template, including heroImage if it has one },
    "caption": "the LinkedIn post",
    "firstComment": "link plus a question",
    "altText": "description of the image"
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
    .filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();

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

  // Validate against what actually exists, so a hallucinated template or shot
  // never reaches the render engine.
  const validTemplates = new Set(schemas.filter((s) => s.brand === brand).map((s) => s.key));
  const validShots = new Set(shotCatalogue().map((s) => s.name));

  const clean = [];
  const warnings = [];
  for (const p of plans) {
    if (!validTemplates.has(p.template)) {
      warnings.push(`dropped a post using unknown template '${p.template}'`);
      continue;
    }
    const schema = schemas.find((s) => s.key === p.template);
    const allowed = new Set(schema.fields.map((f) => f.name));
    const data = {};
    for (const [k, val] of Object.entries(p.data || {})) {
      if (!allowed.has(k) || typeof val !== "string") continue;
      let value = val.replace(/\s*[\u2013\u2014]\s*/g, ", ").trim();
      if (k === "heroImage" && value && !validShots.has(value) && !/^https?:/.test(value)) {
        warnings.push(`unknown screenshot '${value}', left the hero zone empty`);
        continue;
      }
      data[k] = value;
    }
    clean.push({
      brand,
      template: p.template,
      format: "square",
      data,
      caption: String(p.caption || "").replace(/\s*[\u2013\u2014]\s*/g, ", "),
      firstComment: String(p.firstComment || ""),
      altText: String(p.altText || ""),
      note: String(p.note || ""),
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

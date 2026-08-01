// Copy generation. Calls the Anthropic API server-side so the key never reaches
// the browser. Given a rough brief and a template, returns filled field values.
//
// The trick that keeps output the right length and register: the template's own
// current defaults are shown to the model as worked examples. It matches them
// without needing separate character limits per field.

import { drivertrack } from "../tokens/drivertrack.js";
import { revive } from "../tokens/revive.js";

const BRANDS = { drivertrack, revive };
const MODEL = process.env.COPY_MODEL || "claude-sonnet-5";

function buildPrompt({ schema, defaults, brief }) {
  const brand = BRANDS[schema.brand];
  const v = brand.voice;

  const fieldLines = schema.fields
    .filter((f) => f.type !== "url")
    .map((f) => {
      const example = defaults[f.name];
      return `- "${f.name}" (${f.label})` +
        (example ? `\n  Current version, match this length and register: ${JSON.stringify(example)}` : "");
    })
    .join("\n");

  return `You write marketing copy for ${brand.name}.

AUDIENCE
${v.audience}

REGISTER
${v.register}

DO
${v.doThis.map((x) => `- ${x}`).join("\n")}

AVOID
${v.avoid.map((x) => `- ${x}`).join("\n")}

THE ASSET
A ${schema.label} graphic: ${schema.blurb}
Every field below appears on the image itself, so length matters. Match the length
of the current version closely. Copy that overflows breaks the layout.

FIELDS TO WRITE
${fieldLines}

THE BRIEF
${brief}

Write one version of each field. Make one single point across the whole asset, not
several. Return ONLY a JSON object mapping each field name to its string value. No
markdown fences, no commentary, no explanation.`;
}

export async function generateCopy({ schema, defaults, brief }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Copy generation is not set up. Add ANTHROPIC_API_KEY in Railway.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: buildPrompt({ schema, defaults, brief }) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Anthropic rejected the API key.");
    if (res.status === 429) throw new Error("Rate limited by Anthropic. Try again shortly.");
    throw new Error(`Copy generation failed (${res.status}). ${body.slice(0, 160)}`);
  }

  const json = await res.json();
  const text = (json.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Could not read the generated copy. Try rewording the brief.");
    parsed = JSON.parse(m[0]);
  }

  // Only return fields this template actually has, and strip any dashes that slipped through
  const allowed = new Set(schema.fields.map((f) => f.name));
  const out = {};
  for (const [k, val] of Object.entries(parsed)) {
    if (allowed.has(k) && typeof val === "string") {
      out[k] = val.replace(/\s*[\u2013\u2014]\s*/g, ", ").trim();
    }
  }
  return out;
}

export default generateCopy;

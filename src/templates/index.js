// Template registry. Every template the service can render is registered here.
// Adding a template = write the component (with a schema export), import it, add a line.

import { pipelineHero, schema as pipelineHeroSchema } from "./dt-pipeline-hero.js";
import { firstToDriver, schema as firstToDriverSchema } from "./dt-first-to-driver.js";

export const templates = {
  "dt-pipeline-hero": pipelineHero,
  "dt-first-to-driver": firstToDriver,
};

export const schemas = [pipelineHeroSchema, firstToDriverSchema];

// Defaults are read straight off each template function so the app can prefill
// the form without duplicating copy in two places.
export function defaultsFor(key) {
  const fn = templates[key];
  if (!fn) return {};
  const src = fn.toString();
  const out = {};
  // parse the destructured defaults: name = "value"
  const re = /(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!(m[1] in out)) out[m[1]] = m[2].replace(/\\"/g, '"');
  }
  return out;
}

export const brands = {
  drivertrack: { label: "DriverTrack", accent: "#2563EB" },
  revive: { label: "Revive! Barnsley", accent: "#DD1133" },
};

export default templates;

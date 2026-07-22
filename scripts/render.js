// Render CLI. Renders a named template to a PNG in /out.
// Usage: node scripts/render.js dt-pipeline-hero linkedin

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderToPng, closeBrowser } from "../src/lib/render.js";
import { pipelineHero } from "../src/templates/dt-pipeline-hero.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const templates = {
  "dt-pipeline-hero": pipelineHero,
};

async function main() {
  const [, , name = "dt-pipeline-hero", format = "linkedin"] = process.argv;
  const tpl = templates[name];
  if (!tpl) {
    console.error(`Unknown template: ${name}. Available: ${Object.keys(templates).join(", ")}`);
    process.exit(1);
  }
  const { html, width, height } = tpl({ format });
  const png = await renderToPng({ html, width, height, scale: 2 });
  const outPath = join(__dirname, "..", "out", `${name}-${format}.png`);
  writeFileSync(outPath, png);
  console.log(`Rendered ${name} (${format}) ${width}x${height} @2x -> ${outPath} (${png.length} bytes)`);
  await closeBrowser();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

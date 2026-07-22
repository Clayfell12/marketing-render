import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderToPng, closeBrowser } from "../src/lib/render.js";
import { pipelineHero } from "../src/templates/dt-pipeline-hero.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = (f) => join(__dirname, "..", "out", f);

async function go() {
  // Variant A: with the dashed hero zone marked (guide for overlay placement)
  let r = pipelineHero({ format: "linkedin" });
  writeFileSync(out("dt-hero-withslot.png"), await renderToPng({ ...r, scale: 2 }));

  // Variant B: queue only, no hero slot outline, clean plate for full compositing
  r = pipelineHero({ format: "linkedin", heroImage: "about:blank" });
  writeFileSync(out("dt-hero-plate.png"), await renderToPng({ ...r, scale: 2 }));

  console.log("done");
  await closeBrowser();
}
go().catch(e=>{console.error(e);process.exit(1);});

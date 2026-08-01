// Core render engine.
// Takes a full HTML document string and a pixel size, returns a PNG buffer.
// Fonts are embedded as base64 in the HTML so output is identical on any machine.

import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, "..", "assets", "fonts");

// Load Inter weights once and cache the base64
const fontFiles = {
  400: "Inter-Regular.ttf",
  500: "Inter-Medium.ttf",
  700: "Inter-Bold.ttf",
  800: "Inter-ExtraBold.ttf",
};

let fontFaceCss = null;
function getFontFaceCss() {
  if (fontFaceCss) return fontFaceCss;
  fontFaceCss = Object.entries(fontFiles)
    .map(([weight, file]) => {
      const b64 = readFileSync(join(fontsDir, file)).toString("base64");
      return `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
    })
    .join("\n");
  return fontFaceCss;
}

// Wrap a body fragment + css into a full, self-contained HTML document at the exact size
export function buildDocument({ bodyHtml, css, width, height }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${getFontFaceCss()}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${width}px;height:${height}px;overflow:hidden;}
body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}
${css}
</style></head><body>${bodyHtml}</body></html>`;
}

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb"],
    });
  }
  return browserPromise;
}

// Render a full HTML document string to a PNG buffer at deviceScaleFactor for crispness
export async function renderToPng({ html, width, height, scale = 2, transparent = false }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: "networkidle0" });
    // Wait for fonts to be fully ready before shooting
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const buffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
      omitBackground: transparent,
    });
    return buffer;
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

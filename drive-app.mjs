// Drives the chat view against the mock backend and screenshots each step.
// Phase 4 is UI: "it parses" is not "it works".
//
//   node mock-server.mjs &
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node drive-app.mjs

import puppeteer from "puppeteer";

const OUT = process.env.SHOT_DIR || "shots-app";
const url = "http://localhost:3457";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url() + " " + ((r.failure() || {}).errorText || "")));

const shot = async (name) => {
  await page.screenshot({ path: OUT + "/" + name + ".png" });
  console.log("  shot: " + name);
};
const text = (sel) => page.$eval(sel, (el) => el.innerText.trim()).catch(() => "(missing)");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

await fetch(url + "/__reset");

try {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForSelector("#thread", { timeout: 5000 });
  console.log("loaded");
  await shot("1-empty");
  console.log("brief card empty: " + JSON.stringify(await text("#briefcard")));

  // turn 1 — opening message, expect a question with chips
  await page.type("#msg", "Do one about the time owners lose to callbacks.");
  await page.click("#send");
  await page.waitForFunction(() => document.querySelectorAll("#chips button").length > 0, { timeout: 10000 });
  await shot("2-question-with-chips");
  console.log("chips: " + JSON.stringify(await page.$$eval("#chips button", (b) => b.map((x) => x.textContent))));

  // turn 2 — tap a chip, expect draft cards
  await page.click("#chips button");
  await page.waitForFunction(() => document.querySelectorAll(".dcard").length > 0, { timeout: 10000 });
  await shot("3-draft-cards");
  console.log("cards: " + JSON.stringify(await page.$$eval(".dcard", (cs) => cs.map((c) => ({
    id: c.dataset.d,
    headline: (c.querySelector(".dheadline") || {}).textContent,
    warn: (c.querySelector(".dwarn") || {}).textContent || null,
  })))));
  console.log("brief card: " + JSON.stringify(await text("#briefcard")));

  // caption disclosure
  await page.click(".dcard [data-more]");
  await pause(200);
  console.log("caption discloses: " + await page.$eval(".dcard .dcap", (el) => el.classList.contains("open")));
  await shot("4-caption-open");

  // Change this prefills the composer rather than firing a request
  await page.$$eval(".dcard", (cs) => {
    [...cs[0].querySelectorAll(".dacts button")].find((b) => b.textContent === "Change this").click();
  });
  console.log("change-this prefill: " + JSON.stringify(await page.$eval("#msg", (e) => e.value)));

  // turn 3 — drive to ready
  await page.$eval("#msg", (el) => { el.value = ""; });
  await page.type("#msg", "Looks good, hand it over.");
  await page.click("#send");
  await page.waitForFunction(() => /ready/i.test(document.querySelector("#briefcard").innerText), { timeout: 10000 });
  await shot("5-ready");
  console.log("approve button: " + JSON.stringify(await text("#approveAll")));

  // approve
  await page.click("#approveAll");
  await page.waitForFunction(() => document.querySelectorAll(".dcard.approved").length > 0, { timeout: 10000 });
  await pause(400);
  await shot("6-approved");
  console.log("after approve: " + JSON.stringify(await page.$$eval(".dcard", (cs) => cs.map((c) => ({
    id: c.dataset.d,
    approved: c.classList.contains("approved"),
    actions: [...c.querySelectorAll(".dacts button")].map((b) => b.textContent + (b.disabled ? " (disabled)" : "")),
  })))));
  console.log("brief card final: " + JSON.stringify(await text("#briefcard")));

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("horizontal overflow: " + overflow + "px");
  if (overflow > 0) errors.push("body scrolls sideways by " + overflow + "px");
} catch (err) {
  console.log("\nFAILED: " + err.message);
  await shot("x-failure");
  console.log("thread:  " + JSON.stringify((await text("#thread")).slice(0, 300)));
  console.log("chatErr: " + JSON.stringify(await text("#chatErr")));
  console.log("chips:   " + JSON.stringify(await page.$$eval("#chips button", (b) => b.map((x) => x.textContent)).catch(() => null)));
  errors.push(err.message);
}

console.log("");
console.log(errors.length ? "ERRORS:\n  " + errors.join("\n  ") : "no page errors, no failed requests");

await browser.close();
process.exit(errors.length ? 1 : 0);

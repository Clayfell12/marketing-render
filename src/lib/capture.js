// Product screenshot capture.
// Signs into the DriverTrack demo tenant with headless Chromium, walks a catalogue
// of screens, captures each one, frames it, and uploads it to R2 so templates can
// pull real product shots by name.
//
// Credentials come from environment variables set in Railway. They are never
// stored in the repo and never appear in a response:
//   DT_BASE_URL       e.g. https://www.drivertrack.co
//   DT_DEMO_EMAIL     the demo tenant login
//   DT_DEMO_PASSWORD  the demo tenant password
//
// Why the demo tenant: marketing assets must never show real candidate data.
// A tenant full of fabricated applicants is the correct source for public posts.

import puppeteer from "puppeteer";
import { uploadToR2 } from "./r2.js";
import { renderToPng, buildDocument } from "./render.js";

const BASE = () => (process.env.DT_BASE_URL || "https://www.drivertrack.co").replace(/\/$/, "");

// The catalogue. `description` is what makes screenshots content-aware: the post
// planner reads these to decide which shot supports the argument being made.
export const SHOTS = [
  {
    name: "pipeline",
    path: "/app/pipeline",
    description:
      "The pipeline board. Applicants sorted into To call, Interview, Onboarding and Lost columns. " +
      "Use for posts about visibility, sorting, or having a pipeline rather than a list.",
    wait: 2500,
  },
  {
    name: "call-queue",
    path: "/app/calls",
    description:
      "The call queue. Who is waiting to be contacted. Use for posts about speed to contact or " +
      "the Monday morning scramble.",
    wait: 2000,
  },
  {
    name: "interviews",
    path: "/app/interviews",
    description:
      "Booked interviews. Use for posts about automatic booking or turning applicants into diary entries.",
    wait: 2000,
  },
  {
    name: "candidates",
    path: "/app/candidates",
    description:
      "The candidate list. Use for posts about volume, sources, or managing applicants at scale.",
    wait: 2000,
  },
];

async function launch() {
  return puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb"],
  });
}

// Sign in. Tries the usual selectors and reports what it actually found, so the
// flow can be corrected without guesswork.
async function signIn(page, report = []) {
  const base = BASE();
  const email = process.env.DT_DEMO_EMAIL;
  const password = process.env.DT_DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error("DT_DEMO_EMAIL and DT_DEMO_PASSWORD must be set in the environment.");
  }

  const loginPaths = ["/login", "/signin", "/app/login", "/auth/login"];
  let opened = null;

  for (const p of loginPaths) {
    try {
      const res = await page.goto(base + p, { waitUntil: "networkidle2", timeout: 25000 });
      const hasPw = await page.$('input[type="password"]');
      report.push(`tried ${p} -> ${res ? res.status() : "?"}${hasPw ? " (password field found)" : ""}`);
      if (hasPw) { opened = p; break; }
    } catch (e) {
      report.push(`tried ${p} -> ${e.message.slice(0, 60)}`);
    }
  }

  if (!opened) throw new Error("Could not find a login form. Paths tried: " + loginPaths.join(", "));

  const emailSel = await page.$('input[type="email"]') ? 'input[type="email"]'
    : await page.$('input[name="email"]') ? 'input[name="email"]'
    : 'input[type="text"]';

  // Click into each field before typing. React controlled inputs sometimes ignore
  // programmatic typing unless the field has focus first.
  await page.click(emailSel);
  await page.type(emailSel, email, { delay: 30 });
  await page.click('input[type="password"]');
  await page.type('input[type="password"]', password, { delay: 30 });

  // Confirm the values actually landed in the DOM. If React did not register them
  // the form will submit empty and fail silently, which looks identical to a bad
  // password. Reporting the lengths tells the two apart without exposing anything.
  const filled = await page.evaluate((es) => ({
    email: (document.querySelector(es)?.value || "").length,
    password: (document.querySelector('input[type="password"]')?.value || "").length,
  }), emailSel);
  report.push(`fields filled -> email ${filled.email} chars, password ${filled.password} chars`);
  if (!filled.email || !filled.password) {
    throw new Error("The login fields did not accept input. Email chars: " +
      filled.email + ", password chars: " + filled.password);
  }

  // Wait for the submit button to be enabled before clicking
  await page.waitForFunction(() => {
    const b = document.querySelector('button[type="submit"]');
    return b && !b.disabled;
  }, { timeout: 8000 }).catch(() => report.push("submit button never became enabled"));

  // This form is a React app, so pressing Enter may not submit it. Click the
  // submit button, and fall back to Enter only if there is no button.
  const submit = await page.$('button[type="submit"]');
  report.push(submit ? "submit button found, clicking" : "no submit button, pressing Enter");

  await Promise.all([
    submit ? submit.click() : page.keyboard.press("Enter"),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
  ]);

  // Client-side routing may not fire a navigation event, so poll for the
  // password field disappearing rather than trusting navigation alone.
  let stillOnLogin = true;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    stillOnLogin = Boolean(await page.$('input[type="password"]'));
    if (!stillOnLogin) break;
  }

  const url = page.url();
  report.push(`after sign in -> ${url}`);

  if (stillOnLogin) {
    // Surface whatever the page is saying, so the cause is visible rather than guessed
    const msg = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const err = lines.find((l) => /invalid|incorrect|wrong|failed|error|denied|try again/i.test(l));
      return err || lines.slice(0, 6).join(" | ");
    });
    report.push(`page says: ${msg}`.slice(0, 300));

    // Upload a screenshot of the failed state so the cause is visible rather than guessed
    let shotUrl = "";
    try {
      const png = await page.screenshot({ type: "png" });
      shotUrl = await uploadToR2(png, "debug/login-failed.png");
      report.push("debug screenshot: " + shotUrl);
    } catch (e) {
      report.push("could not save debug screenshot: " + e.message.slice(0, 80));
    }

    const err = new Error("Sign in did not complete. Page reported: " + String(msg).slice(0, 160));
    err.debug = { report, shotUrl };
    throw err;
  }
  return url;
}

// Walk the app and report its structure, so the catalogue can be built from what
// is actually there rather than assumed paths.
export async function discover() {
  const browser = await launch();
  const report = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
    const landed = await signIn(page, report);

    const nav = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        text: (a.textContent || "").trim().slice(0, 40),
        href: a.getAttribute("href"),
      })).filter((l) => l.text && l.href && !l.href.startsWith("http"));
      const seen = new Set();
      const unique = links.filter((l) => !seen.has(l.href) && seen.add(l.href));
      return {
        title: document.title,
        url: location.pathname,
        headings: Array.from(document.querySelectorAll("h1,h2"))
          .map((h) => (h.textContent || "").trim().slice(0, 60)).filter(Boolean).slice(0, 12),
        links: unique.slice(0, 40),
      };
    });

    // Probe each catalogue path so we learn which ones are real
    const probes = [];
    for (const shot of SHOTS) {
      try {
        const res = await page.goto(BASE() + shot.path, { waitUntil: "networkidle2", timeout: 20000 });
        const h1 = await page.evaluate(() =>
          (document.querySelector("h1")?.textContent || "").trim().slice(0, 50));
        probes.push({ path: shot.path, status: res ? res.status() : null, heading: h1, url: page.url() });
      } catch (e) {
        probes.push({ path: shot.path, error: e.message.slice(0, 60) });
      }
    }

    return { ok: true, landedOn: landed, nav, probes, report };
  } finally {
    await browser.close();
  }
}

// Frame a raw screenshot: rounded corners and a soft shadow on a transparent
// background, so it sits on any template ground rather than looking pasted on.
async function frame(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  const pad = 60;
  const { width, height } = await sizeOf(pngBuffer);
  const w = width + pad * 2;
  const h = height + pad * 2;
  const html = buildDocument({
    width: w,
    height: h,
    css: `
      body{background:transparent;}
      .wrap{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;}
      img{width:${width}px;height:${height}px;border-radius:20px;
        box-shadow:0 26px 60px rgba(17,17,19,0.28);display:block;}
    `,
    bodyHtml: `<div class="wrap"><img src="data:image/png;base64,${b64}"></div>`,
  });
  return renderToPng({ html, width: w, height: h, scale: 1, transparent: true });
}

// Read PNG dimensions from the header, no image library needed
function sizeOf(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function refreshShots(only = null) {
  const browser = await launch();
  const results = [];
  const report = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
    await signIn(page, report);

    const list = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;

    for (const shot of list) {
      try {
        await page.goto(BASE() + shot.path, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise((r) => setTimeout(r, shot.wait || 2000));

        const raw = await page.screenshot({ type: "png" });
        const framed = await frame(raw);
        const url = await uploadToR2(framed, `shots/${shot.name}.png`);
        results.push({ name: shot.name, ok: true, url, bytes: framed.length });
      } catch (e) {
        results.push({ name: shot.name, ok: false, error: e.message.slice(0, 120) });
      }
    }
    return { ok: true, results, report };
  } finally {
    await browser.close();
  }
}

// The catalogue as the post planner sees it: names and what each shot is good for.
export function shotCatalogue() {
  return SHOTS.map(({ name, description }) => ({ name, description }));
}

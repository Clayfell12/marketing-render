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
    name: "dashboard",
    path: "/dashboard",
    selector: "section.card.p-5",
    maxHeight: 220,
    description:
      "The morning dashboard. New replies, today's interviews, callbacks due. Use for posts about " +
      "waking up to a pipeline, starting the day already sorted, or the state of play at a glance.",
    wait: 2500,
  },
  {
    name: "pipeline",
    path: "/pipeline",
    selector: "div.card.hover-lift.group",
    description:
      "The pipeline board. Applicants sorted into To call, Interview, Onboarding and Lost columns. " +
      "Use for posts about visibility, sorting, or having a pipeline rather than a pile of CVs.",
    wait: 2500,
  },
  {
    name: "call-queue",
    path: "/call-queue",
    selector: "div.mt-4.rounded-lg.border",
    description:
      "The call queue: who is waiting to be contacted. Use for posts about speed to first contact, " +
      "the Monday morning scramble, or working through a weekend's applications.",
    wait: 2000,
  },
  {
    name: "inbox",
    path: "/inbox",
    description:
      "The inbox of candidate replies, including SMS threads. Use for posts about call or text " +
      "screening, applicants who will not answer an unknown number, or replies arriving overnight.",
    wait: 2000,
  },
  {
    name: "interviews",
    path: "/interviews",
    description:
      "Booked interviews. Use for posts about automatic booking, or turning an applicant into a " +
      "diary entry without anyone picking up the phone.",
    wait: 2000,
  },
  {
    name: "candidates",
    path: "/candidates",
    description:
      "The candidate list across sources. Use for posts about volume, where applicants come from, " +
      "or managing a lot of people at once.",
    wait: 2000,
  },
  {
    name: "onboarding",
    path: "/onboarding",
    description:
      "Onboarding progress: getting a passed candidate to their first day on road. Use for posts " +
      "about drop-out between offer and start, or compliance before someone drives.",
    wait: 2000,
  },
  {
    name: "killer-questions",
    path: "/killer-questions",
    description:
      "The screening questions and pass thresholds a DSP sets per role. Use for posts about " +
      "control, tailoring screening, or the rules behind a decision.",
    wait: 2000,
  },
  {
    name: "reports",
    path: "/reports",
    description:
      "Reporting on hiring performance. Use for posts about measurement, time to hire, or " +
      "proving what changed.",
    wait: 2000,
  },
  {
    name: "jobs",
    path: "/jobs",
    description:
      "Live job adverts across stations. Use for posts about keeping adverts live out of season " +
      "or hiring across multiple stations.",
    wait: 2000,
  },
];

// The demo tenant shows an onboarding tour. Click it away before capturing.
async function dismissTour(page, report = []) {
  try {
    const clicked = await page.evaluate(() => {
      const starts = ["skip", "dismiss", "close", "got it", "no thanks", "maybe later"];
      const els = Array.from(document.querySelectorAll("button, a, [role=button]"));
      for (const el of els) {
        const txt = (el.textContent || "").trim().toLowerCase();
        if (!txt || txt.length > 24) continue;
        if (starts.some((k) => txt.startsWith(k))) { el.click(); return txt; }
      }
      return null;
    });
    if (clicked) {
      report.push(`dismissed tour via "${clicked}"`);
      await new Promise((r) => setTimeout(r, 900));
    }
  } catch (e) {
    report.push("tour dismiss failed: " + e.message.slice(0, 60));
  }
}

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

  // Dismiss the onboarding tour, or it appears in every screenshot
  await dismissTour(page, report);

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
      const png = Buffer.from(await page.screenshot({ type: "png" }));
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

    // Report candidate fragment selectors on each page, so the catalogue can target
    // a legible piece of UI rather than a whole dashboard.
    const fragments = [];
    for (const shot of SHOTS.slice(0, 6)) {
      try {
        await page.goto(BASE() + shot.path, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise((r) => setTimeout(r, 1500));
        await dismissTour(page);
        const cands = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll("div, section, article, li").forEach((el) => {
            const r = el.getBoundingClientRect();
            // a good fragment is roughly card sized: readable when magnified
            if (r.width > 200 && r.width < 900 && r.height > 60 && r.height < 700) {
              const cls = (el.className || "").toString().split(/\s+/).slice(0, 3).join(".");
              out.push({ w: Math.round(r.width), h: Math.round(r.height),
                sel: el.tagName.toLowerCase() + (cls ? "." + cls : ""),
                text: (el.innerText || "").trim().slice(0, 48).replace(/\n/g, " ") });
            }
          });
          return out.slice(0, 12);
        });
        fragments.push({ page: shot.name, candidates: cands });
      } catch (e) {
        fragments.push({ page: shot.name, error: e.message.slice(0, 60) });
      }
    }

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

    return { ok: true, landedOn: landed, nav, fragments, probes, report };
  } finally {
    await browser.close();
  }
}

// Frame a raw screenshot: rounded corners and a soft shadow on a transparent
// background, so it sits on any template ground rather than looking pasted on.
async function frame(input) {
  // Newer Puppeteer returns a Uint8Array, older returns a Buffer. Normalise.
  const pngBuffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const b64 = pngBuffer.toString("base64");
  const pad = 60;
  // Screenshots are captured at deviceScaleFactor 2, so the PNG header reports
  // double the CSS size. Lay out at CSS size and render the frame at 2x, which
  // keeps the output sharp without doubling the frame dimensions too.
  const raw = sizeOf(pngBuffer);
  const width = Math.round(raw.width / 2);
  const height = Math.round(raw.height / 2);
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
  return renderToPng({ html, width: w, height: h, scale: 2, transparent: true });
}

// Read PNG dimensions from the header, no image library needed
function sizeOf(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function refreshShots(only = null) {
  const browser = await launch();
  const results = [];
  const report = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 3 });
    await signIn(page, report);

    const list = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;

    for (const shot of list) {
      try {
        await page.goto(BASE() + shot.path, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise((r) => setTimeout(r, shot.wait || 2000));
        await dismissTour(page);

        // A fragment, not a whole dashboard. A full page shrunk into a graphic is
        // illegible: UI text at 14px displayed at 0.3x renders at about 4px. Capturing
        // a narrow element instead means it is MAGNIFIED when shown, not shrunk.
        let target = null;
        if (shot.selector) {
          target = await page.$(shot.selector);
          if (!target) report.push(`${shot.name}: selector not found, fell back to full page`);
        }
        let raw;
        if (target) {
          const box = await target.boundingBox();
          if (box && shot.maxHeight && box.height > shot.maxHeight) {
            // a tall column shrunk into the graphic is illegible again, so take a
            // legible top portion instead of the whole thing
            raw = Buffer.from(await page.screenshot({
              type: "png",
              clip: { x: box.x, y: box.y, width: box.width, height: shot.maxHeight },
            }));
          } else {
            raw = Buffer.from(await target.screenshot({ type: "png" }));
          }
        } else {
          raw = Buffer.from(await page.screenshot({ type: "png" }));
        }
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

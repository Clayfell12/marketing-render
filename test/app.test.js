// The app is one big template literal, so a syntax error in the browser JS is invisible
// until the page loads on a phone. These parse it here instead.

import { test } from "node:test";
import assert from "node:assert/strict";

import { appHtml } from "../src/app.js";
import { brands } from "../src/brands.js";

const page = (briefEnabled) => appHtml({ brands, requiresKey: true, briefEnabled });

const browserJs = (html) => {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "the page has a script block");
  return m[1];
};

test("the browser JS parses with the chat flag off", () => {
  assert.doesNotThrow(() => new Function(browserJs(page(false))));
});

test("the browser JS parses with the chat flag on", () => {
  assert.doesNotThrow(() => new Function(browserJs(page(true))));
});

// §14: off is the default, and off means the app is exactly what it was.
test("the chat surface is absent entirely when the flag is off", () => {
  const html = page(false);
  assert.ok(!html.includes('data-v="chat"'), "no chat tab");
  assert.ok(!html.includes('id="chatView"'), "no chat view");
  assert.ok(!html.includes('id="composer"'), "no composer");
  assert.ok(html.includes('data-v="make"'), "the Make tab is untouched");
});

test("the flag defaults to off, so a caller that forgets it gets the old app", () => {
  const html = appHtml({ brands, requiresKey: false });
  assert.ok(!html.includes('id="chatView"'));
  assert.ok(html.includes('data-v="make"'));
});

// §11: the Make tab retires into Chat, and Quick plan keeps one-tap /plan alive.
test("the flag on replaces Make with Chat and keeps Quick plan", () => {
  const html = page(true);
  assert.ok(html.includes('data-v="chat"'), "chat tab");
  assert.ok(!html.includes('data-v="make"'), "the Make tab retires");
  assert.ok(html.includes('id="chatView"'));
  assert.ok(html.includes('id="composer"'));
  assert.ok(html.includes('id="qgo"'), "Quick plan survives");
  assert.ok(html.includes('id="queueView"'), "the queue is untouched");
});

test("the composer carries chips, a mic and a send button", () => {
  const html = page(true);
  assert.ok(html.includes('id="chips"'));
  assert.ok(html.includes('id="mic"'));
  assert.ok(html.includes('id="send"'));
  // The mic is hidden until feature detection says otherwise; a dead button is worse
  // than no button.
  assert.match(html, /id="mic"[^>]*style="display:none"/);
});

test("the brief card and thread are present for the chat view", () => {
  const html = page(true);
  assert.ok(html.includes('id="briefcard"'));
  assert.ok(html.includes('id="thread"'));
  assert.ok(html.includes('id="approveAll"'));
});

test("the session id is kept under its own localStorage key", () => {
  const js = browserJs(page(true));
  assert.match(js, /localStorage\.getItem\("studio_brief"\)/);
  // and must not collide with the passcode
  assert.match(js, /localStorage\.getItem\("studio_key"\)/);
});

test("every mutating chat call sends the rev it last saw", () => {
  const js = browserJs(page(true));
  const bodies = js.match(/JSON\.stringify\(\{[^}]*\}\)/g) || [];
  const message = bodies.find((b) => b.includes("text: text") && b.includes("rev"));
  assert.ok(message, "the message call sends a rev");
  assert.match(js, /rev: chat\.s\.rev/);
});

test("a 409 reloads the session rather than guessing", () => {
  const js = browserJs(page(true));
  assert.match(js, /r\.status === 409/);
  assert.match(js, /reloadSession\(\)/);
  // A held lock is not an error, it is the previous turn still running.
  assert.match(js, /Still working on your last message/);
});

test("approve never sends more than the server's cap of three", () => {
  const js = browserJs(page(true));
  assert.match(js, /\.slice\(0, 3\)/);
});

// A failing turn used to be silent: the inline error block sits below the thread, and
// drawChat scrolls the thread's bottom into view, so the error was always below the fold.
test("a chat failure is surfaced somewhere that cannot be scrolled past", () => {
  const js = browserJs(page(true));
  const fn = js.slice(js.indexOf("function chatFail"), js.indexOf("function chatFail") + 400);
  assert.match(fn, /toast\(/, "chatFail raises a toast, not just the inline block");
});

// A turn can take a minute when the planner runs. Until the server answers there is
// otherwise nothing on screen but dots, which reads as the app losing what you said.
test("the user's message is shown before the server has answered", () => {
  const js = browserJs(page(true));
  assert.match(js, /chat\.pending = text/);
  assert.match(js, /chat\.pending \? .*bub me|if \(chat\.pending\) html \+=/);
});

test("a failed send puts the text back in the composer", () => {
  const js = browserJs(page(true));
  assert.match(js, /if \(box && !box\.value\) box\.value = text/);
});

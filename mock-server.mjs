// Serves the real app against a canned backend, so the chat view can be driven in a
// browser without R2, Chromium or an API key. Only the client is under test here.

import http from "node:http";
import { appHtml } from "./src/app.js";
import { brands } from "./src/brands.js";

const spec = (over = {}) => ({
  theme: "dark", eyebrow: "Overnight screening", accentWord: "", display: false,
  headline: "Interviews booked while you were asleep",
  blocks: [{ type: "thread", messages: [{ text: "Q5 of 5" }] }, { type: "cta", text: "See how it works" }],
  ...over,
});

const blank = () => ({
  id: "b_mock", brand: "drivertrack", status: "open", rev: 1,
  lock: { heldSince: "", turnId: "" },
  brief: { idea: "", proof: { kind: "", detail: "" }, showsProduct: null, demonstration: "",
           intent: "", count: 2, avoid: [], schedule: "", notes: [] },
  transcript: [
    { role: "note", text: "Decided: post is about overnight screening. No confirmed figure available, so it argues from reasoning. Owner ruled out anything about peak hiring, covered last week.", at: "" },
  ],
  drafts: [], nextDraftSeq: 1,
  readyAt: "", approvedAt: "", postIds: [],
  createdAt: "", updatedAt: "",
});
let session = blank();

// Three scripted turns: a question with chips, then drafts, then ready.
let turn = 0;
function advance(text) {
  session.transcript.push({ role: "user", text, at: "" });
  session.rev += 2;
  turn += 1;

  if (turn === 1) {
    session.brief.idea = "screening runs overnight so mornings start with a shortlist";
    session.transcript.push({ role: "assistant", at: "",
      text: "Good subject. Two things before I hand it over.\n\nDo you have a confirmed figure, or should the post argue from reasoning?\n\nAnd does this one show the product?",
      options: ["No figure, argue it plainly", "I have a real number", "Shows the product", "Statement post, no product"] });
    return;
  }
  if (turn === 2) {
    session.brief.proof = { kind: "none", detail: "" };
    session.brief.showsProduct = true;
    session.brief.demonstration = "thread";
    session.status = "drafted";
    session.drafts = [
      { draftId: "d1", spec: spec(), caption: "You do not need to be at your desk for the screening to happen.\n\nLast night an applicant answered on their phone at 11pm.", firstComment: "See it at drivertrack.co\n\nHow many went cold last weekend?", altText: "", note: "", scheduledFor: "", state: "open", postId: "", warnings: [] },
      { draftId: "d2", spec: spec({ display: true, theme: "light", blocks: [], headline: "Good drivers don't answer numbers they don't know" }), caption: "Half your applicants will not answer a call from a number they do not recognise.", firstComment: "", altText: "", note: "", scheduledFor: "", state: "open", postId: "", warnings: ["headline is 8 words, budget 6"] },
    ];
    session.nextDraftSeq = 3;
    session.transcript.push({ role: "assistant", at: "",
      text: "Two drafts back. The second is over the display budget, want it tightened?",
      options: ["Tighten it", "Leave as is"] });
    return;
  }
  session.status = "ready";
  session.readyAt = "2026-08-07T12:00:00.000Z";
  session.transcript.push({ role: "assistant", text: "Handed over. Both ready when you are.", options: [], at: "" });
}

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const read = (req) => new Promise((r) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } });
});

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/" ) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(appHtml({ brands, requiresKey: false, briefEnabled: true }));
  }
  if (url === "/__reset") { session = blank(); turn = 0; return json(res, 200, { ok: true }); }
  if (url === "/favicon.ico") { res.writeHead(204); return res.end(); }
  if (url === "/posts") return json(res, 200, { posts: [] });
  if (url === "/briefs") return json(res, 200, { ok: true, sessions: [] });

  if (url === "/brief" && req.method === "POST") {
    const b = await read(req);
    if (b.text) advance(b.text);
    return json(res, 200, session);
  }
  if (url === "/brief/b_mock" && req.method === "GET") return json(res, 200, session);
  if (url === "/brief/b_mock/message") {
    const b = await read(req);
    if (Number(b.rev) !== session.rev) return json(res, 409, { error: "stale revision" });
    advance(b.text);
    return json(res, 200, session);
  }
  if (url === "/brief/b_mock/approve") {
    const b = await read(req);
    const ids = b.only || session.drafts.filter((d) => d.state === "open").map((d) => d.draftId);
    const posts = [];
    for (const d of session.drafts) {
      if (ids.includes(d.draftId) && !d.postId) { d.state = "approved"; d.postId = "p_" + d.draftId; posts.push({ id: d.postId }); }
    }
    session.rev += 2;
    if (!session.drafts.some((d) => d.state === "open")) session.status = "rendered";
    return json(res, 200, { ok: true, posts, drafts: session.drafts, session });
  }
  json(res, 404, { error: "not found" });
}).listen(3457, () => console.log("mock app on http://localhost:3457"));

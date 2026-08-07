// HTTP render service.
// POST /render  { spec, upload, filename }  -> PNG (or JSON with R2 url if upload)
// GET  /health  -> ok
//
// This is the deployable entry point. Railway runs this. The marketing-studio
// skill calls POST /render to produce finished assets. A spec is the composed
// shape the planner emits: { theme, eyebrow, headline, accentWord, display, blocks }.

import http from "node:http";
import { renderToPng } from "./lib/render.js";
import { uploadToR2 } from "./lib/r2.js";
import { brands } from "./brands.js";
import { compose } from "./compose.js";
import { BLOCKS } from "./blocks.js";
import { appHtml } from "./app.js";
import { createPost, listPosts, getPost, updatePost, deletePost, rerenderAll } from "./lib/posts.js";
import { discover, refreshShots, shotCatalogue } from "./lib/capture.js";
import { planPosts } from "./lib/planner.js";
import {
  BriefError, createSession, requireSession, listSessions, abandonSession, withLock,
} from "./lib/brief.js";
import { runTurn } from "./lib/brief-turn.js";
import { approveDrafts } from "./lib/brief-approve.js";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.RENDER_API_KEY || null; // optional shared-secret gate

// Conversational briefing is off unless asked for, so the whole feature is reversible
// with a Railway variable rather than a revert. See conversation-plan-v4.md §14.
const BRIEF_ENABLED = process.env.BRIEF_ENABLED === "true";

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// One user message, one turn, under the session's lock. The user's text is appended
// inside `before` so it is persisted in the same write that takes the lock: a process
// that dies mid-turn then leaves the message on the record rather than a held lock and
// no trace of what was said.
async function sendMessage(id, rev, text) {
  const { session } = await withLock(id, {
    rev,
    allowStatuses: ["open", "drafted", "ready"],
    before: (s) => {
      s.transcript.push({ role: "user", text, at: new Date().toISOString() });
    },
    work: (s) => runTurn(s),
  });
  return session;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  // CORS for convenience when called from tools
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, x-api-key");
  res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return send(res, 204, "");

  // Mobile app UI
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = appHtml({ brands, requiresKey: Boolean(API_KEY), briefEnabled: BRIEF_ENABLED });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, blocks: Object.keys(BLOCKS) });
  }

  // --- Planner ---
  if (req.method === "POST" && req.url === "/plan") {
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }
    const body = await readBody(req);
    if (!body) return send(res, 400, { error: "invalid JSON" });
    try {
      const out = await planPosts({
        brand: body.brand || "drivertrack",
        brief: body.brief,
        count: Math.min(Math.max(parseInt(body.count, 10) || 3, 1), 7),
        create: body.create !== false,
      });
      return send(res, 200, out);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // --- Conversational briefing -------------------------------------------
  // Phase 3: sessions, the turn loop, drafting and partial approve.
  // Off unless BRIEF_ENABLED.
  if (req.url === "/briefs" || req.url === "/brief" || req.url.startsWith("/brief/")) {
    if (!BRIEF_ENABLED) return send(res, 404, { error: "not found" });
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }

    const parts = req.url.split("?")[0].split("/").filter(Boolean); // brief/:id/:action
    const [root, id, action] = parts;

    try {
      if (req.method === "GET" && root === "briefs") {
        return send(res, 200, { ok: true, sessions: await listSessions() });
      }
      if (req.method === "POST" && root === "brief" && !id) {
        const body = await readBody(req);
        if (!body) return send(res, 400, { error: "invalid JSON" });
        const session = await createSession({ brand: body.brand || "drivertrack" });
        const text = String(body.text || "").trim();
        if (!text) return send(res, 200, session);
        return send(res, 200, await sendMessage(session.id, session.rev, text));
      }
      if (req.method === "GET" && root === "brief" && id && !action) {
        return send(res, 200, await requireSession(id));
      }
      if (req.method === "POST" && root === "brief" && id && action === "message") {
        const body = await readBody(req);
        if (!body) return send(res, 400, { error: "invalid JSON" });
        const text = String(body.text || "").trim();
        if (!text) return send(res, 400, { error: "a message is required" });
        return send(res, 200, await sendMessage(id, body.rev, text));
      }
      if (req.method === "POST" && root === "brief" && id && action === "approve") {
        const body = (await readBody(req)) || {};
        const out = await approveDrafts(id, {
          rev: body.rev,
          only: body.only,
          force: Boolean(body.force),
        });
        // A mid-batch failure still persisted its successes, so this is a 200 carrying
        // ok: false rather than an error: the client needs the posts that did render.
        return send(res, 200, out);
      }
      if (req.method === "POST" && root === "brief" && id && action === "abandon") {
        const body = (await readBody(req)) || {};
        return send(res, 200, await abandonSession(id, body.rev));
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      // BriefError carries the status it wants; anything else is genuinely a 500.
      if (e instanceof BriefError) return send(res, e.status, { error: e.message });
      return send(res, 500, { error: e.message });
    }
  }

  // --- Product screenshots ---
  if (req.url === "/shots" || req.url.startsWith("/shots/")) {
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }
    const action = req.url.split("?")[0].split("/").filter(Boolean)[1];
    try {
      if (req.method === "GET" && !action) {
        return send(res, 200, { ok: true, shots: shotCatalogue() });
      }
      if (req.method === "POST" && action === "discover") {
        return send(res, 200, await discover());
      }
      if (req.method === "POST" && action === "refresh") {
        const body = (await readBody(req)) || {};
        return send(res, 200, await refreshShots(body.only || null));
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 500, { error: e.message, debug: e.debug || null });
    }
  }

  // --- Post queue ---------------------------------------------------------
  if (req.url === "/posts" || req.url.startsWith("/posts/")) {
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }
    const parts = req.url.split("?")[0].split("/").filter(Boolean); // ["posts", id?]
    const id = parts[1];

    try {
      if (req.method === "POST" && id === "rerender") {
        return send(res, 200, { ok: true, rerendered: await rerenderAll() });
      }
      if (req.method === "GET" && !id) {
        return send(res, 200, { ok: true, posts: await listPosts() });
      }
      if (req.method === "GET" && id) {
        const p = await getPost(id);
        return p ? send(res, 200, p) : send(res, 404, { error: "not found" });
      }
      if (req.method === "POST" && !id) {
        const body = await readBody(req);
        if (!body) return send(res, 400, { error: "invalid JSON" });
        // accept a single post or an array of them
        const items = Array.isArray(body) ? body : [body];
        const made = [];
        for (const item of items) made.push(await createPost(item));
        return send(res, 200, { ok: true, created: made.length, posts: made });
      }
      if (req.method === "PATCH" && id) {
        const body = await readBody(req);
        if (!body) return send(res, 400, { error: "invalid JSON" });
        const p = await updatePost(id, body);
        return p ? send(res, 200, p) : send(res, 404, { error: "not found" });
      }
      if (req.method === "DELETE" && id) {
        const ok = await deletePost(id);
        return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: "not found" });
      }
      return send(res, 405, { error: "method not allowed" });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  if (req.method === "POST" && req.url === "/render") {
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }
    const body = await readBody(req);
    if (!body) return send(res, 400, { error: "invalid JSON" });

    // A spec, not a template name: the composer builds the graphic from the
    // locked shell plus its blocks. Accept a bare spec too, for convenience.
    const { spec, upload = false, filename } = body;
    const s = spec || (body.headline || body.blocks ? body : null);
    if (!s || (!s.headline && !Array.isArray(s.blocks))) {
      return send(res, 400, {
        error: "a spec is required: { theme, eyebrow, headline, accentWord, display, blocks }",
        blocks: Object.keys(BLOCKS),
      });
    }

    try {
      const { html, width, height } = compose(s);
      const png = await renderToPng({ html, width, height, scale: 2 });

      if (upload) {
        const key = filename || `render-${Date.now()}.png`;
        const url = await uploadToR2(png, key);
        return send(res, 200, { ok: true, url, width, height, bytes: png.length });
      }

      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": png.length,
      });
      return res.end(png);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`marketing-render listening on :${PORT}`);
});

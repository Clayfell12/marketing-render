// HTTP render service.
// POST /render  { template, format, data, upload }  -> PNG (or JSON with R2 url if upload)
// GET  /health  -> ok
//
// This is the deployable entry point. Railway runs this. The marketing-studio
// skill calls POST /render to produce finished assets.

import http from "node:http";
import { renderToPng } from "./lib/render.js";
import { uploadToR2 } from "./lib/r2.js";
import { templates, schemas, brands, defaultsFor } from "./templates/index.js";
import { appHtml } from "./app.js";
import { generateCopy } from "./lib/copy.js";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.RENDER_API_KEY || null; // optional shared-secret gate

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
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
    const html = appHtml({ schemas, brands, requiresKey: Boolean(API_KEY), copyEnabled: Boolean(process.env.ANTHROPIC_API_KEY) });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  // Template defaults, so the app can prefill the form with the real copy
  if (req.method === "GET" && req.url.startsWith("/defaults/")) {
    const key = decodeURIComponent(req.url.slice("/defaults/".length));
    if (!templates[key]) return send(res, 404, { error: "unknown template" });
    return send(res, 200, defaultsFor(key));
  }

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, templates: Object.keys(templates) });
  }

  // Copy generation
  if (req.method === "POST" && req.url === "/copy") {
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }
    const body = await readBody(req);
    if (!body) return send(res, 400, { error: "invalid JSON" });
    const { template, brief } = body;
    const schema = schemas.find((s) => s.key === template);
    if (!schema) return send(res, 404, { error: "unknown template" });
    if (!brief || !brief.trim()) return send(res, 400, { error: "Write a brief first." });
    try {
      const values = await generateCopy({
        schema,
        defaults: defaultsFor(template),
        brief: brief.trim(),
      });
      return send(res, 200, { ok: true, values });
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

    const { template, format, data = {}, upload = false, filename } = body;
    const tpl = templates[template];
    if (!tpl) {
      return send(res, 404, {
        error: `unknown template '${template}'`,
        available: Object.keys(templates),
      });
    }

    try {
      const { html, width, height } = tpl({ format, ...data });
      const png = await renderToPng({ html, width, height, scale: 2 });

      if (upload) {
        const key = filename || `${template}-${format || "default"}-${Date.now()}.png`;
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

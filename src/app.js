// Mobile web app served at GET /.
// A dispatch console for content: pick brand, pick template, fill the sheet, render.
//
// Design notes:
// - Dark chrome on purpose. Every render is a white-ground 1200x1200, so a dark
//   frame lets you judge the artwork accurately instead of white-on-white.
// - The accent colour IS the brand you are working on. Switch brand, the whole
//   console changes colour. You always know what you are building for.
// - Job-sheet header strip carries real state (brand, template, output size)
//   rather than decoration.

export function appHtml({ schemas, brands, requiresKey, copyEnabled }) {
  const data = JSON.stringify({ schemas, brands, requiresKey, copyEnabled });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#12161D">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Studio</title>
<link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%2312161D'/%3E%3Crect x='26' y='26' width='48' height='48' rx='10' fill='%232563EB'/%3E%3C/svg%3E">
<style>
  :root{
    --ground:#12161D;
    --panel:#1A202A;
    --panel-2:#212936;
    --hairline:#2C3542;
    --ink:#E9EDF3;
    --ink-muted:#98A2B3;
    --ink-faint:#6B7688;
    --accent:#2563EB;
    --danger:#F87171;
    --r:14px;
    --safe-b:env(safe-area-inset-bottom,0px);
  }
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
  html,body{background:var(--ground);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;}
  body{min-height:100dvh;padding-bottom:calc(96px + var(--safe-b));}

  /* job sheet header */
  header{position:sticky;top:0;z-index:20;background:rgba(18,22,29,.86);
    backdrop-filter:saturate(160%) blur(14px);border-bottom:1px solid var(--hairline);
    padding:calc(env(safe-area-inset-top,0px) + 14px) 18px 12px;}
  .ticket{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;font-weight:700;color:var(--ink-faint);
    font-variant-numeric:tabular-nums;}
  .ticket .on{color:var(--accent);}
  .ticket .sep{opacity:.4;}
  h1{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:6px;}

  .tabs{display:flex;gap:6px;margin-top:12px;}
  .tabs button{flex:1;border:1px solid var(--hairline);background:var(--panel);
    color:var(--ink-muted);font-size:14px;font-weight:700;padding:10px;border-radius:10px;
    font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px;}
  .tabs button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff;}
  .count{background:rgba(255,255,255,.22);border-radius:999px;padding:1px 7px;font-size:12px;}
  .tabs button[aria-pressed="false"] .count{background:var(--panel-2);}

  .pcard{background:var(--panel);border:1px solid var(--hairline);border-radius:var(--r);
    overflow:hidden;margin-bottom:14px;}
  .pcard img{width:100%;display:block;background:#fff;}
  .pbody{padding:14px 15px;}
  .pmeta{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.12em;
    text-transform:uppercase;font-weight:700;color:var(--ink-faint);margin-bottom:8px;}
  .badge{padding:3px 9px;border-radius:999px;font-size:11px;letter-spacing:.06em;}
  .b-draft{background:rgba(152,162,179,.16);color:var(--ink-muted);}
  .b-approved{background:rgba(37,99,235,.18);color:#7FA9FF;}
  .b-posted{background:rgba(74,222,128,.16);color:#6EE7A0;}
  .b-rejected{background:rgba(248,113,113,.14);color:var(--danger);}
  .pnote{font-size:13px;color:var(--ink-muted);line-height:1.45;margin-bottom:10px;}
  .pcap{font-size:14px;color:var(--ink);line-height:1.5;white-space:pre-wrap;
    max-height:96px;overflow:hidden;position:relative;}
  .pcap.open{max-height:none;}
  .more{font-size:13px;font-weight:700;color:var(--accent);margin-top:6px;}
  .pacts{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;}
  .pacts button{flex:1;min-width:88px;border:1px solid var(--hairline);background:var(--panel-2);
    color:var(--ink);border-radius:999px;padding:11px;font-size:14px;font-weight:700;font-family:inherit;}
  .pacts button.ok{background:var(--accent);border-color:var(--accent);color:#fff;}
  .pacts button.bad{color:var(--danger);}

  main{padding:18px;display:flex;flex-direction:column;gap:22px;}
  .group{display:flex;flex-direction:column;gap:10px;}
  .glabel{font-size:11px;letter-spacing:.14em;text-transform:uppercase;
    font-weight:700;color:var(--ink-faint);padding-left:2px;}

  /* brand switch */
  .seg{display:flex;gap:6px;background:var(--panel);border:1px solid var(--hairline);
    border-radius:var(--r);padding:5px;}
  .seg button{flex:1;border:0;background:transparent;color:var(--ink-muted);
    font-size:15px;font-weight:600;padding:12px 8px;border-radius:10px;
    font-family:inherit;transition:background .15s,color .15s;}
  .seg button[aria-pressed="true"]{background:var(--accent);color:#fff;}

  /* template list */
  .tpl{display:flex;flex-direction:column;gap:8px;}
  .tpl button{display:block;width:100%;text-align:left;background:var(--panel);
    border:1px solid var(--hairline);border-radius:var(--r);padding:15px 16px;
    color:var(--ink);font-family:inherit;transition:border-color .15s,background .15s;}
  .tpl button[aria-pressed="true"]{border-color:var(--accent);background:var(--panel-2);}
  .tpl .n{font-size:16px;font-weight:700;display:flex;align-items:center;gap:9px;}
  .tpl .n i{width:8px;height:8px;border-radius:2px;background:var(--hairline);
    transform:rotate(45deg);flex:none;transition:background .15s;}
  .tpl button[aria-pressed="true"] .n i{background:var(--accent);}
  .tpl .b{font-size:13px;color:var(--ink-muted);margin-top:3px;line-height:1.4;}

  /* fields */
  .field{display:flex;flex-direction:column;gap:7px;}
  .field label{font-size:13px;font-weight:600;color:var(--ink-muted);padding-left:2px;}
  .field .hint{font-size:12px;color:var(--ink-faint);padding-left:2px;line-height:1.4;}
  input,textarea{width:100%;background:var(--panel);border:1px solid var(--hairline);
    border-radius:12px;padding:14px;color:var(--ink);font-size:16px;font-family:inherit;
    line-height:1.45;resize:none;transition:border-color .15s;}
  input:focus,textarea:focus{outline:none;border-color:var(--accent);}
  input::placeholder,textarea::placeholder{color:var(--ink-faint);}

  .write{width:100%;border:1px solid var(--accent);background:transparent;color:var(--accent);
    border-radius:999px;padding:14px;font-size:15px;font-weight:700;font-family:inherit;
    display:flex;align-items:center;justify-content:center;gap:9px;}
  .write:disabled{opacity:.45;}
  .write .spin{border-color:rgba(37,99,235,.3);border-top-color:var(--accent);}

  /* action bar */
  .bar{position:fixed;left:0;right:0;bottom:0;z-index:30;
    background:linear-gradient(180deg,rgba(18,22,29,0) 0%,rgba(18,22,29,.94) 34%);
    padding:22px 18px calc(16px + var(--safe-b));}
  .go{width:100%;border:0;border-radius:999px;background:var(--accent);color:#fff;
    font-size:17px;font-weight:700;padding:17px;font-family:inherit;
    display:flex;align-items:center;justify-content:center;gap:9px;}
  .go:disabled{opacity:.5;}
  .spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.35);
    border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;}
  @keyframes sp{to{transform:rotate(360deg);}}

  /* result sheet */
  .sheet{position:fixed;inset:0;z-index:50;background:var(--ground);
    display:flex;flex-direction:column;transform:translateY(100%);
    transition:transform .28s cubic-bezier(.32,.72,0,1);}
  .sheet.up{transform:translateY(0);}
  .sheet header{position:static;background:transparent;border:0;}
  .sheet .close{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);right:16px;
    width:36px;height:36px;border-radius:999px;border:1px solid var(--hairline);
    background:var(--panel);color:var(--ink);font-size:18px;line-height:1;}
  .canvas{flex:1;display:flex;align-items:center;justify-content:center;padding:18px;}
  .canvas img{max-width:100%;max-height:100%;border-radius:10px;
    box-shadow:0 24px 60px rgba(0,0,0,.55);}
  .acts{padding:0 18px calc(20px + var(--safe-b));display:flex;gap:10px;}
  .acts button{flex:1;border-radius:999px;padding:16px;font-size:16px;font-weight:700;
    font-family:inherit;border:1px solid var(--hairline);background:var(--panel);color:var(--ink);}
  .acts button.primary{background:var(--accent);border-color:var(--accent);color:#fff;}

  .err{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.4);
    color:var(--danger);border-radius:12px;padding:13px 15px;font-size:14px;line-height:1.45;}
  .empty{color:var(--ink-faint);font-size:14px;padding:6px 2px;line-height:1.5;}
  @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
</style>
</head>
<body>
<header>
  <div class="ticket" id="ticket"></div>
  <h1>Studio</h1>
  <div class="tabs">
    <button data-v="make" aria-pressed="true">Make</button>
    <button data-v="queue" aria-pressed="false">Queue <span class="count" id="qc"></span></button>
  </div>
</header>

<main id="makeView">
  <div class="group">
    <div class="glabel">Brand</div>
    <div class="seg" id="brands"></div>
  </div>

  <div class="group">
    <div class="glabel">Template</div>
    <div class="tpl" id="tpls"></div>
  </div>

  <div class="group" id="briefGroup">
    <div class="glabel">Brief</div>
    <textarea id="brief" rows="3" placeholder="What is this post about? A rough note is enough."></textarea>
    <button class="write" id="write">Write the copy</button>
  </div>

  <div class="group" id="formGroup">
    <div class="glabel">Content</div>
    <div id="form"></div>
  </div>

  <div id="err"></div>
</main>

<main id="queueView" style="display:none">
  <div id="queue"></div>
</main>

<div class="bar">
  <button class="go" id="go">Render</button>
</div>

<div class="sheet" id="sheet">
  <header><div class="ticket" id="ticket2"></div><h1>Ready</h1></header>
  <button class="close" id="close">&times;</button>
  <div class="canvas"><img id="out" alt="Rendered graphic"></div>
  <div class="acts">
    <button id="save">Save</button>
    <button id="share" class="primary">Share</button>
  </div>
</div>

<script>
const APP = ${data};
const $ = (s) => document.querySelector(s);
let state = { brand: "drivertrack", tpl: null, values: {}, blob: null, busy: false };
let KEY = localStorage.getItem("studio_key") || "";

function accent() { return (APP.brands[state.brand] || {}).accent || "#2563EB"; }
function paint() { document.documentElement.style.setProperty("--accent", accent()); }

function forBrand() { return APP.schemas.filter(s => s.brand === state.brand); }

function ticket() {
  const t = APP.schemas.find(s => s.key === state.tpl);
  const b = (APP.brands[state.brand] || {}).label || state.brand;
  const size = t ? (t.format === "square" ? "1200 × 1200" : t.format) : "—";
  const html = '<span class="on">' + b + '</span><span class="sep">/</span>' +
    (t ? t.label : "no template") + '<span class="sep">/</span>' + size;
  $("#ticket").innerHTML = html;
  $("#ticket2").innerHTML = html;
}

function drawBrands() {
  $("#brands").innerHTML = Object.entries(APP.brands).map(([k, v]) =>
    '<button data-b="' + k + '" aria-pressed="' + (k === state.brand) + '">' + v.label + '</button>'
  ).join("");
  $("#brands").querySelectorAll("button").forEach(b =>
    b.onclick = () => { state.brand = b.dataset.b; state.tpl = null; state.values = {}; render(); });
}

function drawTpls() {
  const list = forBrand();
  if (!list.length) {
    $("#tpls").innerHTML = '<div class="empty">No templates for this brand yet. ' +
      'They appear here automatically once they are built.</div>';
    return;
  }
  $("#tpls").innerHTML = list.map(s =>
    '<button data-k="' + s.key + '" aria-pressed="' + (s.key === state.tpl) + '">' +
      '<div class="n"><i></i>' + s.label + '</div>' +
      '<div class="b">' + s.blurb + '</div>' +
    '</button>'
  ).join("");
  $("#tpls").querySelectorAll("button").forEach(b =>
    b.onclick = () => { pick(b.dataset.k); });
}

async function pick(key) {
  state.tpl = key;
  state.values = {};
  render();
  try {
    const r = await fetch("/defaults/" + key);
    if (r.ok) { state.values = await r.json(); render(); }
  } catch (e) {}
}

function drawForm() {
  const t = APP.schemas.find(s => s.key === state.tpl);
  if (!t) { $("#formGroup").style.display = "none"; return; }
  $("#formGroup").style.display = "flex";
  $("#form").innerHTML = t.fields.map(f => {
    const v = (state.values[f.name] || "").replace(/"/g, "&quot;");
    const ctl = f.type === "textarea"
      ? '<textarea rows="' + (f.rows || 3) + '" data-f="' + f.name + '">' +
          (state.values[f.name] || "") + '</textarea>'
      : '<input type="' + (f.type === "url" ? "url" : "text") + '" data-f="' + f.name +
          '" value="' + v + '"' + (f.optional ? ' placeholder="Optional"' : "") + '>';
    return '<div class="field" style="margin-bottom:14px">' +
      '<label>' + f.label + '</label>' + ctl +
      (f.hint ? '<div class="hint">' + f.hint + '</div>' : "") + '</div>';
  }).join("");
  $("#form").querySelectorAll("[data-f]").forEach(el =>
    el.oninput = () => { state.values[el.dataset.f] = el.value; });
}

function render() { paint(); drawBrands(); drawTpls(); drawForm(); ticket();
  $("#briefGroup").style.display = (APP.copyEnabled && state.tpl) ? "flex" : "none";
  $("#go").disabled = !state.tpl || state.busy; }

async function write() {
  const brief = $("#brief").value.trim();
  if (!brief || !state.tpl || state.busy) return;
  state.busy = true; fail("");
  $("#write").innerHTML = '<span class="spin"></span>Writing';
  $("#write").disabled = true;
  try {
    const headers = { "content-type": "application/json" };
    if (KEY) headers["x-api-key"] = KEY;
    const r = await fetch("/copy", {
      method: "POST", headers,
      body: JSON.stringify({ template: state.tpl, brief }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("Copy failed (" + r.status + ")"));
    state.values = Object.assign({}, state.values, j.values);
    render();
    $("#formGroup").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    fail(e.message);
  } finally {
    state.busy = false;
    $("#write").textContent = "Write the copy";
    $("#write").disabled = false;
  }
}

function fail(msg) {
  $("#err").innerHTML = msg ? '<div class="err">' + msg + '</div>' : "";
}

async function go() {
  if (!state.tpl || state.busy) return;
  state.busy = true; fail("");
  $("#go").innerHTML = '<span class="spin"></span>Rendering';
  $("#go").disabled = true;
  try {
    const headers = { "content-type": "application/json" };
    if (KEY) headers["x-api-key"] = KEY;
    const r = await fetch("/render", {
      method: "POST", headers,
      body: JSON.stringify({ template: state.tpl, data: state.values }),
    });
    if (r.status === 401) {
      const k = prompt("Passcode");
      if (k) { KEY = k; localStorage.setItem("studio_key", k); }
      throw new Error("Enter the passcode and render again.");
    }
    if (!r.ok) {
      let m = "Render failed (" + r.status + ")";
      try { const j = await r.json(); if (j.error) m = j.error; } catch (e) {}
      throw new Error(m);
    }
    state.blob = await r.blob();
    $("#out").src = URL.createObjectURL(state.blob);
    $("#sheet").classList.add("up");
  } catch (e) {
    fail(e.message);
  } finally {
    state.busy = false;
    $("#go").textContent = "Render";
    $("#go").disabled = !state.tpl;
  }
}

function filename() {
  const d = new Date().toISOString().slice(0, 10);
  return state.tpl + "-" + d + ".png";
}

$("#go").onclick = go;
$("#write").onclick = write;
$("#close").onclick = () => $("#sheet").classList.remove("up");
$("#save").onclick = () => {
  if (!state.blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(state.blob);
  a.download = filename();
  a.click();
};
$("#share").onclick = async () => {
  if (!state.blob) return;
  const file = new File([state.blob], filename(), { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) {}
  } else {
    $("#save").click();
  }
};

// ---- views -------------------------------------------------------------
let view = "make";
let posts = [];

document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.v));

function setView(v) {
  view = v;
  document.querySelectorAll(".tabs button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  $("#makeView").style.display = v === "make" ? "flex" : "none";
  $("#queueView").style.display = v === "queue" ? "block" : "none";
  document.querySelector(".bar").style.display = v === "make" ? "block" : "none";
  if (v === "queue") loadQueue();
}

function esc(x) { return (x || "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

async function loadQueue() {
  $("#queue").innerHTML = '<div class="empty">Loading…</div>';
  try {
    const headers = {}; if (KEY) headers["x-api-key"] = KEY;
    const r = await fetch("/posts", { headers });
    if (!r.ok) throw new Error("Could not load the queue (" + r.status + ")");
    const j = await r.json();
    posts = j.posts || [];
    drawQueue();
  } catch (e) {
    $("#queue").innerHTML = '<div class="err">' + e.message + '</div>';
  }
}

function drawQueue() {
  const live = posts.filter(p => p.status !== "rejected");
  $("#qc").textContent = live.length ? live.length : "";
  if (!posts.length) {
    $("#queue").innerHTML = '<div class="empty">Nothing in the queue yet. ' +
      'Posts planned in chat land here ready to review.</div>';
    return;
  }
  $("#queue").innerHTML = posts.map(p => {
    const when = p.scheduledFor ? p.scheduledFor : "unscheduled";
    return '<div class="pcard" data-id="' + p.id + '">' +
      (p.imageUrl ? '<img src="' + p.imageUrl + '" alt="">' : "") +
      '<div class="pbody">' +
        '<div class="pmeta"><span class="badge b-' + p.status + '">' + p.status + '</span>' +
          '<span>' + esc(p.template) + '</span><span class="sep">·</span><span>' + esc(when) + '</span></div>' +
        (p.note ? '<div class="pnote">' + esc(p.note) + '</div>' : "") +
        '<div class="pcap" data-cap>' + esc(p.caption) + '</div>' +
        (p.caption && p.caption.length > 220 ? '<div class="more" data-more>Show all</div>' : "") +
        '<div class="pacts">' +
          '<button data-a="copy">Copy caption</button>' +
          '<button data-a="share">Share image</button>' +
          (p.status === "draft" ? '<button data-a="approve" class="ok">Approve</button>' : "") +
          (p.status === "approved" ? '<button data-a="posted" class="ok">Mark posted</button>' : "") +
          '<button data-a="reject" class="bad">Reject</button>' +
        '</div>' +
      '</div></div>';
  }).join("");

  $("#queue").querySelectorAll(".pcard").forEach(card => {
    const p = posts.find(x => x.id === card.dataset.id);
    const more = card.querySelector("[data-more]");
    if (more) more.onclick = () => {
      card.querySelector("[data-cap]").classList.toggle("open");
      more.textContent = more.textContent === "Show all" ? "Show less" : "Show all";
    };
    card.querySelectorAll("[data-a]").forEach(btn => btn.onclick = () => act(p, btn.dataset.a));
  });
}

async function act(p, a) {
  if (a === "copy") {
    const text = p.caption + (p.firstComment ? "\n\n---- first comment ----\n" + p.firstComment : "");
    try { await navigator.clipboard.writeText(text); btnFlash(); } catch (e) {}
    return;
  }
  if (a === "share") {
    if (!p.imageUrl) return;
    try {
      const blob = await (await fetch(p.imageUrl)).blob();
      const file = new File([blob], p.id + ".png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a2 = document.createElement("a");
        a2.href = URL.createObjectURL(blob); a2.download = p.id + ".png"; a2.click();
      }
    } catch (e) {}
    return;
  }
  const status = a === "approve" ? "approved" : a === "posted" ? "posted" : "rejected";
  try {
    const headers = { "content-type": "application/json" };
    if (KEY) headers["x-api-key"] = KEY;
    const r = await fetch("/posts/" + p.id, {
      method: "PATCH", headers, body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error("Update failed");
    const updated = await r.json();
    posts = posts.map(x => x.id === updated.id ? updated : x);
    drawQueue();
  } catch (e) {
    $("#queue").innerHTML = '<div class="err">' + e.message + '</div>' + $("#queue").innerHTML;
  }
}

function btnFlash() {
  const t = document.createElement("div");
  t.textContent = "Caption copied";
  t.style.cssText = "position:fixed;left:50%;bottom:80px;transform:translateX(-50%);" +
    "background:var(--panel-2);border:1px solid var(--hairline);color:var(--ink);" +
    "padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;z-index:99;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

render();
loadQueue();
</script>
</body>
</html>`;
}

export default appHtml;

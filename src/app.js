// Mobile web app served at GET /.
// A dispatch console for content: pick brand, write a brief, review the queue.
//
// Design notes:
// - Dark chrome on purpose. Renders are 1200x1200 in either theme, and a neutral
//   dark frame lets you judge both accurately without the page fighting the art.
// - The accent colour IS the brand you are working on. Switch brand, the whole
//   console changes colour. You always know what you are building for.
// - Job-sheet header strip carries real state (brand, output size)
//   rather than decoration.

// Chat is behind BRIEF_ENABLED. When it is off the Chat tab is not rendered and the
// Make tab stays exactly as it was, so the whole feature reverses with a Railway variable
// rather than a revert. See conversation-plan-v4.md §14. Delete the flag when the Make
// tab goes for good, not before.
export function appHtml({ brands, requiresKey, briefEnabled = false }) {
  const data = JSON.stringify({ brands, requiresKey, briefEnabled });

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

  /* fields */
  .field{display:flex;flex-direction:column;gap:7px;}
  .field label{font-size:13px;font-weight:600;color:var(--ink-muted);padding-left:2px;}
  .field .hint{font-size:12px;color:var(--ink-faint);padding-left:2px;line-height:1.4;}
  input,textarea{width:100%;background:var(--panel);border:1px solid var(--hairline);
    border-radius:12px;padding:14px;color:var(--ink);font-size:16px;font-family:inherit;
    line-height:1.45;resize:none;transition:border-color .15s;}
  input:focus,textarea:focus{outline:none;border-color:var(--accent);}
  input::placeholder,textarea::placeholder{color:var(--ink-faint);}

  .row2{display:flex;gap:10px;}
  .fieldsm{flex:0 0 130px;display:flex;flex-direction:column;gap:7px;}
  .fieldsm label{font-size:13px;font-weight:600;color:var(--ink-muted);padding-left:2px;}
  select{width:100%;background:var(--panel);border:1px solid var(--hairline);border-radius:12px;
    padding:14px;color:var(--ink);font-size:16px;font-family:inherit;}

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

  /* ---- chat ---------------------------------------------------------- */

  /* The brief card is the agreement made glanceable: what is settled reads in full
     ink, what is still assumed or unanswered stays muted. It sticks *below* the
     header, whose height varies with the notch, so the offset is measured rather
     than guessed. */
  .briefcard{position:sticky;top:var(--headh,0px);z-index:15;background:var(--panel);
    border:1px solid var(--hairline);border-radius:var(--r);padding:12px 14px;
    display:flex;flex-direction:column;gap:7px;
    /* paints the ground across the strip above the card, so a bubble scrolling
       under it does not show through the layout gap */
    box-shadow:0 -20px 0 0 var(--ground);}
  .bcrow{display:flex;gap:10px;font-size:13px;line-height:1.35;}
  .bckey{flex:0 0 84px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
    font-weight:700;color:var(--ink-faint);padding-top:2px;}
  .bcval{flex:1;color:var(--ink);}
  .bcval.soft{color:var(--ink-faint);}
  .bcstatus{display:flex;align-items:center;gap:8px;margin-top:2px;}
  .pill{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;
    padding:3px 9px;border-radius:999px;background:var(--panel-2);color:var(--ink-muted);}
  .pill.ready{background:rgba(74,222,128,.16);color:#6EE7A0;}
  .pill.rendered{background:rgba(37,99,235,.18);color:#7FA9FF;}

  .thread{display:flex;flex-direction:column;gap:12px;}
  .bub{max-width:86%;padding:12px 14px;border-radius:16px;font-size:15px;line-height:1.5;
    white-space:pre-wrap;overflow-wrap:anywhere;}
  .bub.them{align-self:flex-start;background:var(--panel);border:1px solid var(--hairline);
    border-bottom-left-radius:5px;}
  .bub.me{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:5px;}
  /* Stands in for turns that have been condensed away. Reads as a margin note, not as
     something either party said. */
  .bub.note{align-self:stretch;max-width:none;background:transparent;
    border:1px dashed var(--hairline);color:var(--ink-faint);font-size:13px;
    border-radius:10px;}
  .bub.note b{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
    color:var(--ink-faint);margin-bottom:6px;font-weight:700;}
  .thinking{align-self:flex-start;display:flex;gap:5px;padding:14px;}
  .thinking i{width:7px;height:7px;border-radius:50%;background:var(--ink-faint);
    animation:bl 1.2s ease-in-out infinite;}
  .thinking i:nth-child(2){animation-delay:.15s;}
  .thinking i:nth-child(3){animation-delay:.3s;}
  @keyframes bl{0%,60%,100%{opacity:.25;}30%{opacity:1;}}

  /* Draft cards sit in the thread where they were produced. */
  .dcard{background:var(--panel);border:1px solid var(--hairline);border-radius:var(--r);
    padding:14px 15px;display:flex;flex-direction:column;gap:10px;}
  .dcard.approved{border-color:rgba(74,222,128,.4);}
  .dhead{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.12em;
    text-transform:uppercase;font-weight:700;color:var(--ink-faint);}
  .deyebrow{font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;
    color:var(--accent);}
  .dheadline{font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.2;}
  .dblocks{display:flex;flex-wrap:wrap;gap:6px;}
  .btag{font-size:11px;letter-spacing:.06em;font-weight:700;padding:3px 9px;border-radius:999px;
    background:var(--panel-2);color:var(--ink-muted);}
  .dwarn{font-size:12px;line-height:1.45;color:#E8B45A;}
  .dcap{font-size:14px;color:var(--ink-muted);line-height:1.5;white-space:pre-wrap;
    max-height:0;overflow:hidden;}
  .dcap.open{max-height:none;margin-top:2px;}
  .dacts{display:flex;gap:8px;flex-wrap:wrap;}
  .dacts button{flex:1;min-width:96px;border:1px solid var(--hairline);background:var(--panel-2);
    color:var(--ink);border-radius:999px;padding:11px;font-size:14px;font-weight:700;
    font-family:inherit;}
  .dacts button.ok{background:var(--accent);border-color:var(--accent);color:#fff;}
  .dacts button:disabled{opacity:.45;}

  /* Composer. Chips sit above the field because the keyboard owns the bottom. */
  .composer{position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--ground);
    border-top:1px solid var(--hairline);padding:10px 14px calc(10px + var(--safe-b));
    display:flex;flex-direction:column;gap:9px;}
  .chips{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding-bottom:1px;}
  .chips::-webkit-scrollbar{display:none;}
  .chips button{flex:0 0 auto;border:1px solid var(--accent);background:transparent;
    color:var(--accent);border-radius:999px;padding:9px 15px;font-size:14px;font-weight:700;
    font-family:inherit;white-space:nowrap;}
  .cline{display:flex;gap:9px;align-items:flex-end;}
  .cline textarea{flex:1;max-height:120px;border-radius:20px;padding:12px 15px;}
  .icon{flex:0 0 auto;width:46px;height:46px;border-radius:50%;border:1px solid var(--hairline);
    background:var(--panel);color:var(--ink);font-size:18px;line-height:1;display:grid;
    place-items:center;font-family:inherit;}
  .icon.send{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700;}
  .icon:disabled{opacity:.45;}
  .icon.rec{background:var(--danger);border-color:var(--danger);color:#fff;
    animation:pulse 1.4s ease-in-out infinite;}
  @keyframes pulse{50%{opacity:.55;}}

  .approveall{width:100%;border:0;border-radius:999px;background:var(--accent);color:#fff;
    font-size:16px;font-weight:700;padding:15px;font-family:inherit;}
  .approveall:disabled{opacity:.5;}

  /* Quick plan keeps one-tap POST /plan alive without a second tab. */
  details.quick{border:1px solid var(--hairline);background:var(--panel);border-radius:var(--r);
    padding:0 14px;}
  details.quick summary{list-style:none;cursor:pointer;padding:13px 0;font-size:13px;
    font-weight:700;color:var(--ink-muted);}
  details.quick summary::-webkit-details-marker{display:none;}
  details.quick[open] summary{border-bottom:1px solid var(--hairline);}
  .quickbody{display:flex;flex-direction:column;gap:10px;padding:13px 0;}

  .toast{position:fixed;left:50%;bottom:calc(96px + var(--safe-b));transform:translateX(-50%);
    background:var(--panel-2);border:1px solid var(--hairline);color:var(--ink);
    padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;z-index:99;
    max-width:88vw;text-align:center;}
  @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
</style>
</head>
<body>
<header>
  <div class="ticket" id="ticket"></div>
  <h1>Studio</h1>
  <div class="tabs">
    ${briefEnabled
      ? '<button data-v="chat" aria-pressed="true">Chat</button>'
      : '<button data-v="make" aria-pressed="true">Make</button>'}
    <button data-v="queue" aria-pressed="false">Queue <span class="count" id="qc"></span></button>
  </div>
</header>

${briefEnabled ? `<main id="chatView">
  <div class="briefcard" id="briefcard"></div>
  <div class="thread" id="thread"></div>
  <div id="chatErr"></div>

  <details class="quick">
    <summary>Quick plan — skip the conversation</summary>
    <div class="quickbody">
      <textarea id="qbrief" rows="3" placeholder="A rough note is enough. This goes straight to the planner with no questions asked."></textarea>
      <div class="row2">
        <div class="fieldsm">
          <label>How many</label>
          <select id="qcount">
            <option>1</option><option selected>2</option><option>3</option>
            <option>4</option><option>5</option>
          </select>
        </div>
      </div>
      <button class="go" id="qgo">Plan the posts</button>
    </div>
  </details>
</main>` : ""}

<main id="makeView"${briefEnabled ? ' style="display:none"' : ""}>
  <div class="group">
    <div class="glabel">Brand</div>
    <div class="seg" id="brands"></div>
  </div>

  <div class="group">
    <div class="glabel">Brief</div>
    <textarea id="brief" rows="5" placeholder="What do you want posting about? A rough note is enough. Say how many posts if you want more than one."></textarea>
    <div class="row2">
      <div class="fieldsm">
        <label>How many</label>
        <select id="count">
          <option>1</option><option selected>2</option><option>3</option>
          <option>4</option><option>5</option>
        </select>
      </div>
    </div>
  </div>

  <div id="err"></div>
</main>

<main id="queueView" style="display:none">
  <div id="queue"></div>
</main>

<div class="bar"${briefEnabled ? ' style="display:none"' : ""}>
  <button class="go" id="go">Plan the posts</button>
</div>

${briefEnabled ? `<div class="composer" id="composer">
  <div id="approveRow" style="display:none"><button class="approveall" id="approveAll">Approve all</button></div>
  <div class="chips" id="chips"></div>
  <div class="cline">
    <textarea id="msg" rows="1" placeholder="Say what you want posting about"></textarea>
    <button class="icon" id="mic" style="display:none" aria-label="Dictate">&#127908;</button>
    <button class="icon send" id="send" aria-label="Send">&#8593;</button>
  </div>
</div>` : ""}

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
let state = { brand: "drivertrack", busy: false };
let KEY = localStorage.getItem("studio_key") || "";

function accent() { return (APP.brands[state.brand] || {}).accent || "#2563EB"; }

function drawBrands() {
  $("#brands").innerHTML = Object.entries(APP.brands).map(([k, v]) =>
    '<button data-b="' + k + '" aria-pressed="' + (k === state.brand) + '">' + v.label + '</button>'
  ).join("");
  $("#brands").querySelectorAll("button").forEach(b =>
    b.onclick = () => { state.brand = b.dataset.b; render(); });
}

function ticket() {
  const b = (APP.brands[state.brand] || {}).label || state.brand;
  const html = '<span class="on">' + b + '</span><span class="sep">/</span>1200 x 1200';
  $("#ticket").innerHTML = html;
  const t2 = $("#ticket2"); if (t2) t2.innerHTML = html;
}

function render() {
  document.documentElement.style.setProperty("--accent", accent());
  drawBrands(); ticket();
  $("#go").disabled = state.busy;
}

function fail(msg) { $("#err").innerHTML = msg ? '<div class="err">' + msg + '</div>' : ""; }

async function go() {
  const brief = $("#brief").value.trim();
  if (!brief) { fail("Write a brief first."); return; }
  if (state.busy) return;
  state.busy = true; fail("");
  $("#go").innerHTML = '<span class="spin"></span>Planning';
  $("#go").disabled = true;
  try {
    const headers = { "content-type": "application/json" };
    if (KEY) headers["x-api-key"] = KEY;
    const r = await fetch("/plan", {
      method: "POST", headers,
      body: JSON.stringify({
        brand: state.brand,
        brief,
        count: parseInt($("#count").value, 10) || 2,
        create: true,
      }),
    });
    if (r.status === 401) {
      const k = prompt("Passcode");
      if (k) { KEY = k; localStorage.setItem("studio_key", k); }
      throw new Error("Enter the passcode and try again.");
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("Planning failed (" + r.status + ")"));
    $("#brief").value = "";
    setView("queue");
  } catch (e) {
    fail(e.message);
  } finally {
    state.busy = false;
    $("#go").textContent = "Plan the posts";
    $("#go").disabled = false;
  }
}

$("#go").onclick = go;

// ---- views -------------------------------------------------------------
let view = APP.briefEnabled ? "chat" : "make";
let posts = [];

document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.v));

function setView(v) {
  view = v;
  document.querySelectorAll(".tabs button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  const show = (sel, on, how) => { const el = $(sel); if (el) el.style.display = on ? how : "none"; };
  show("#makeView", v === "make", "flex");
  show("#chatView", v === "chat", "flex");
  show("#queueView", v === "queue", "block");
  show(".bar", v === "make", "block");
  show("#composer", v === "chat", "flex");
  if (v !== "chat") document.body.style.paddingBottom = "";
  if (typeof fit === "function") fit();
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
          '<span>' + esc((p.spec && p.spec.theme) || p.brand || "") + '</span>' +
          '<span class="sep">·</span><span>' + esc(when) + '</span></div>' +
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
    const NL = String.fromCharCode(10);
    const text = p.caption + (p.firstComment ? NL + NL + "---- first comment ----" + NL + p.firstComment : "");
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

let toastEl = null;
function toast(msg) {
  if (toastEl) toastEl.remove();
  toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.textContent = msg;
  document.body.appendChild(toastEl);
  const mine = toastEl;
  setTimeout(() => { if (mine === toastEl) { mine.remove(); toastEl = null; } }, 2200);
}

function btnFlash() { toast("Caption copied"); }

// ---- chat --------------------------------------------------------------
// The session id lives in localStorage beside the passcode. Without it, closing the
// app orphans a session whose id was the only way back to it.

const chat = { s: null, busy: false, pending: "" };
let SID = localStorage.getItem("studio_brief") || "";

function hdrs(json) {
  const h = json ? { "content-type": "application/json" } : {};
  if (KEY) h["x-api-key"] = KEY;
  return h;
}

// The inline block sits below the thread, and drawChat scrolls the thread's bottom into
// view — which put every error below the fold, so a failing turn looked like a turn that
// simply never answered. The toast is fixed, so it cannot be scrolled past.
function chatFail(msg) {
  const el = $("#chatErr");
  if (el) el.innerHTML = msg ? '<div class="err">' + esc(msg) + "</div>" : "";
  if (msg) toast(msg.length > 90 ? msg.slice(0, 88) + "…" : msg);
}

// Every mutating call sends the rev it last saw. A 409 means the world moved: reload it
// rather than guessing, and say which kind of moved it was.
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (r.status === 401) {
    const k = prompt("Passcode");
    if (k) { KEY = k; localStorage.setItem("studio_key", k); }
    throw new Error("Enter the passcode and try again.");
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 409) {
    await reloadSession();
    const held = /in progress/i.test(j.error || "");
    toast(held ? "Still working on your last message" : "That was out of date, reloaded");
    const e = new Error(j.error || "conflict"); e.handled = true; throw e;
  }
  if (!r.ok) throw new Error(j.error || ("Request failed (" + r.status + ")"));
  return j;
}

async function reloadSession() {
  if (!SID) return;
  try {
    const s = await api("/brief/" + SID, { headers: hdrs(false) });
    chat.s = s;
    drawChat();
  } catch (e) { /* leave what is on screen */ }
}

async function startSession(text) {
  const j = await api("/brief", {
    method: "POST", headers: hdrs(true),
    body: JSON.stringify({ brand: state.brand, text: text }),
  });
  chat.s = j;
  SID = j.id;
  localStorage.setItem("studio_brief", SID);
}

async function sendMsg(text) {
  if (!text || chat.busy) return;
  // Show it straight away. A turn can take a minute when the planner runs, and until
  // the server answers there is otherwise nothing on screen but the thinking dots —
  // which reads as the app having swallowed what you said.
  chat.pending = text;
  chat.busy = true; chatFail(""); drawChat();
  try {
    if (!SID || !chat.s || chat.s.status === "abandoned") {
      await startSession(text);
    } else {
      chat.s = await api("/brief/" + SID + "/message", {
        method: "POST", headers: hdrs(true),
        body: JSON.stringify({ text: text, rev: chat.s.rev }),
      });
    }
    chat.pending = "";
  } catch (e) {
    chat.pending = "";
    if (!e.handled) {
      chatFail(e.message);
      // The server appends the message in the same write that takes the lock, so it may
      // well have landed even though the turn failed. Ask rather than assume.
      await reloadSession();
      // Whatever the truth on the server, put the words back where they can be re-sent.
      const box = $("#msg");
      if (box && !box.value) box.value = text;
    }
  } finally {
    chat.busy = false;
    drawChat();
  }
}

async function approve(only) {
  if (chat.busy || !chat.s) return;
  const ready = chat.s.status === "ready";
  if (!ready && !confirm("These aren't marked ready yet. Approve and render anyway?")) return;

  // The server caps a batch at three. Send at most three and say what is left rather
  // than letting it come back as an error.
  let targets = only;
  let left = 0;
  if (!targets) {
    const open = (chat.s.drafts || []).filter(d => d.state === "open").map(d => d.draftId);
    targets = open.slice(0, 3);
    left = open.length - targets.length;
  }

  chat.busy = true; chatFail(""); drawChat();
  try {
    const j = await api("/brief/" + SID + "/approve", {
      method: "POST", headers: hdrs(true),
      body: JSON.stringify({ rev: chat.s.rev, only: targets, force: !ready }),
    });
    if (j.session) chat.s = j.session;
    if (j.ok === false) {
      chatFail(j.error);
    } else {
      const n = (j.posts || []).length;
      toast(n === 1 ? "Rendered, it's in the queue" :
        left > 0 ? ("Rendered " + n + ", " + left + " still to go") : ("Rendered " + n + ", they're in the queue"));
    }
    loadQueue();
  } catch (e) {
    if (!e.handled) chatFail(e.message);
  } finally {
    chat.busy = false;
    drawChat();
  }
}

// ---- chat rendering ----------------------------------------------------

function drawBriefCard() {
  const el = $("#briefcard");
  if (!el) return;
  const b = (chat.s && chat.s.brief) || null;
  if (!b) {
    el.innerHTML = '<div class="bcrow"><div class="bckey">Brief</div>' +
      '<div class="bcval soft">Nothing yet. Say what you want posting about.</div></div>';
    return;
  }
  // Full ink for what has actually been settled, muted for what is still assumed.
  const row = (k, v, soft) =>
    '<div class="bcrow"><div class="bckey">' + k + '</div>' +
    '<div class="bcval' + (soft ? " soft" : "") + '">' + esc(v) + "</div></div>";

  const proof = b.proof && b.proof.kind
    ? (b.proof.kind === "none" ? "None, argue from reasoning"
      : b.proof.kind + (b.proof.detail ? ": " + b.proof.detail : ""))
    : "not settled";
  const shows = typeof b.showsProduct === "boolean"
    ? (b.showsProduct ? "Yes, dark where it shows" : "No, light") : "not settled";

  const st = chat.s.status || "open";
  const open = (chat.s.drafts || []).filter(d => d.state === "open").length;
  const drafts = open ? '<span class="pill">' + open + (open === 1 ? " draft" : " drafts") + "</span>" : "";

  el.innerHTML =
    row("Idea", b.idea || "not settled", !b.idea) +
    row("Proof", proof, !(b.proof && b.proof.kind)) +
    row("Product", shows, typeof b.showsProduct !== "boolean") +
    row("Posts", String(b.count || 2), true) +
    '<div class="bcstatus"><span class="pill ' + st + '">' + st + "</span>" + drafts + "</div>";
}

function draftCard(d) {
  const s = d.spec || {};
  const blocks = (s.blocks || []).map(x => '<span class="btag">' + esc(x.type) + "</span>").join("");
  const warn = (d.warnings || []).length
    ? '<div class="dwarn">' + (d.warnings || []).map(esc).join("<br>") + "</div>" : "";
  const done = d.state === "approved";
  return '<div class="dcard' + (done ? " approved" : "") + '" data-d="' + d.draftId + '">' +
    '<div class="dhead"><span>' + d.draftId + "</span><span>" + esc(s.theme || "") + "</span>" +
    (s.display ? "<span>display</span>" : "") + (done ? "<span>approved</span>" : "") + "</div>" +
    (s.eyebrow ? '<div class="deyebrow">' + esc(s.eyebrow) + "</div>" : "") +
    '<div class="dheadline">' + esc(s.headline || "") + "</div>" +
    (blocks ? '<div class="dblocks">' + blocks + "</div>" : "") +
    warn +
    (d.caption ? '<div class="more" data-more>Show caption</div><div class="dcap" data-cap>' +
      esc(d.caption) + (d.firstComment ? "\\n\\n---- first comment ----\\n" + esc(d.firstComment) : "") +
      "</div>" : "") +
    '<div class="dacts">' +
      (done ? '<button disabled>Approved</button>'
            : '<button data-a="approve" class="ok">Approve</button>') +
      '<button data-a="change">Change this</button>' +
    "</div></div>";
}

function drawThread() {
  const el = $("#thread");
  if (!el) return;
  const s = chat.s;
  if (!s || !s.transcript || !s.transcript.length) {
    el.innerHTML = chat.pending
      ? '<div class="bub me">' + esc(chat.pending) + "</div>" +
        (chat.busy ? '<div class="thinking"><i></i><i></i><i></i></div>' : "")
      : '<div class="empty">Tell me what you want posting about. ' +
        "I'll ask a couple of things, then hand it to the planner.</div>";
    return;
  }

  let html = s.transcript.map(t => {
    if (t.role === "note") {
      return '<div class="bub note"><b>Earlier, summarised</b>' + esc(t.text) + "</div>";
    }
    return '<div class="bub ' + (t.role === "assistant" ? "them" : "me") + '">' + esc(t.text) + "</div>";
  }).join("");

  // Drafts sit after the transcript: they are the current state of the batch, not a
  // moment in it, and a card that scrolled away would be a card you cannot act on.
  const live = (s.drafts || []).filter(d => d.state === "open" || d.state === "approved");
  html += live.map(draftCard).join("");
  if (chat.pending) html += '<div class="bub me">' + esc(chat.pending) + "</div>";
  if (chat.busy) html += '<div class="thinking"><i></i><i></i><i></i></div>';

  el.innerHTML = html;

  el.querySelectorAll(".dcard").forEach(card => {
    const id = card.dataset.d;
    const more = card.querySelector("[data-more]");
    if (more) more.onclick = () => {
      const cap = card.querySelector("[data-cap]");
      cap.classList.toggle("open");
      more.textContent = cap.classList.contains("open") ? "Hide caption" : "Show caption";
    };
    card.querySelectorAll("[data-a]").forEach(btn => btn.onclick = () => {
      if (btn.dataset.a === "approve") approve([id]);
      else {
        const box = $("#msg");
        box.value = "Change " + id + ": ";
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    });
  });
}

function drawChips() {
  const el = $("#chips");
  if (!el) return;
  const s = chat.s;
  let opts = [];
  if (s && s.transcript && s.transcript.length && !chat.busy) {
    const last = s.transcript[s.transcript.length - 1];
    if (last.role === "assistant" && Array.isArray(last.options)) opts = last.options;
  }
  el.innerHTML = opts.map((o, i) => '<button data-i="' + i + '">' + esc(o) + "</button>").join("");
  el.querySelectorAll("button").forEach(b =>
    b.onclick = () => sendMsg(opts[parseInt(b.dataset.i, 10)]));
}

function drawChat() {
  if (!APP.briefEnabled) return;
  drawBriefCard();
  drawThread();
  drawChips();

  // Approve all belongs to the ready state. Before that, approving is a per-card
  // decision behind a confirm, and a standing button competes with the conversation
  // for the scarcest thing on a phone: vertical space.
  const open = chat.s ? (chat.s.drafts || []).filter(d => d.state === "open").length : 0;
  const ready = chat.s && chat.s.status === "ready";
  $("#approveRow").style.display = ready && open ? "block" : "none";
  const btn = $("#approveAll");
  btn.disabled = chat.busy;
  btn.textContent = open > 1 ? "Approve all " + open : "Approve";

  $("#send").disabled = chat.busy;
  fit();
  if (view === "chat") {
    const t = $("#thread");
    if (t) t.scrollIntoView({ block: "end", behavior: "smooth" });
  }
}

// The header and the composer are both fixed and both change height — the composer
// grows with chips and the approve button, the header with the notch. Measure them and
// give the page real room, or the last draft card sits under the composer where it
// cannot be read or tapped.
function fit() {
  const head = document.querySelector("header");
  const comp = $("#composer");
  const r = document.documentElement.style;
  if (head) r.setProperty("--headh", head.offsetHeight + "px");
  if (comp && view === "chat") {
    document.body.style.paddingBottom = (comp.offsetHeight + 24) + "px";
  }
}
window.addEventListener("resize", fit);

function wireChat() {
  if (!APP.briefEnabled) return;

  const box = $("#msg");
  const grow = () => { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 120) + "px"; };
  box.addEventListener("input", grow);

  const submit = () => {
    const t = box.value.trim();
    if (!t) return;
    box.value = ""; grow();
    sendMsg(t);
  };
  $("#send").onclick = submit;
  box.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  $("#approveAll").onclick = () => approve(null);

  // Dictation. Feature-detected because it is Safari and Chrome only, and a dead
  // button is worse than no button. A phone keyboard is the slowest part of this.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const mic = $("#mic");
    mic.style.display = "grid";
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = "en-GB";
      rec.interimResults = true;
      rec.continuous = false;
      const before = box.value;
      rec.onresult = (e) => {
        let said = "";
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
        box.value = (before ? before + " " : "") + said;
        grow();
      };
      rec.onend = () => { rec = null; mic.classList.remove("rec"); box.focus(); };
      rec.onerror = () => { rec = null; mic.classList.remove("rec"); toast("Couldn't hear that"); };
      mic.classList.add("rec");
      rec.start();
    };
  }

  const qgo = $("#qgo");
  if (qgo) qgo.onclick = async () => {
    const brief = $("#qbrief").value.trim();
    if (!brief) { chatFail("Write something first."); return; }
    qgo.disabled = true; qgo.innerHTML = '<span class="spin"></span>Planning';
    try {
      await api("/plan", {
        method: "POST", headers: hdrs(true),
        body: JSON.stringify({
          brand: state.brand, brief: brief,
          count: parseInt($("#qcount").value, 10) || 2, create: true,
        }),
      });
      $("#qbrief").value = "";
      toast("Planned, they're in the queue");
      setView("queue");
    } catch (e) {
      if (!e.handled) chatFail(e.message);
    } finally {
      qgo.disabled = false; qgo.textContent = "Plan the posts";
    }
  };
}

// Resume: the stored id first, then the most recent resumable session, then nothing.
async function bootChat() {
  if (!APP.briefEnabled) return;
  wireChat();
  try {
    if (SID) {
      const s = await api("/brief/" + SID, { headers: hdrs(false) });
      if (s.status !== "abandoned") { chat.s = s; drawChat(); return; }
    }
    const j = await api("/briefs", { headers: hdrs(false) });
    const recent = (j.sessions || [])[0];
    if (recent) {
      SID = recent.id;
      localStorage.setItem("studio_brief", SID);
      chat.s = await api("/brief/" + SID, { headers: hdrs(false) });
    } else {
      SID = ""; localStorage.removeItem("studio_brief"); chat.s = null;
    }
  } catch (e) { /* a fresh conversation is a fine fallback */ }
  drawChat();
}

render();
loadQueue();
bootChat();
</script>
</body>
</html>`;
}

export default appHtml;

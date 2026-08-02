// Block library.
// A graphic is the locked shell plus one or two of these. Each block reads only
// from the brand tokens, so no combination can drift off brand. See DESIGN-SPEC.md.
//
// Every block exports { css, html }. The composer concatenates them.

import { drivertrack as t } from "./tokens/drivertrack.js";

const c = t.color;
const S = t.size;
const sp = t.space;

// Shared card styling. Rows, compare columns and quotes all sit on white cards
// over the tinted field, which is what makes them read as one family.
const CARD = `background:${c.surface};border:1px solid ${c.hairline};
  border-radius:${t.radius.lg}px;box-shadow:0 14px 40px rgba(17,17,19,0.07);`;

const statusInk = { pass: c.success, fail: c.danger, wait: c.warning, none: c.inkSubtle };
const statusBg = { pass: c.successSoft, fail: c.dangerSoft, wait: c.warningSoft, none: c.surfaceAlt };

function esc(x) {
  return String(x == null ? "" : x)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// body: one supporting sentence. The default companion to a headline.
// ---------------------------------------------------------------------------
export function body(d = {}) {
  return {
    css: `.b-body{font-weight:${t.font.regular};font-size:${S.body}px;line-height:1.4;
      color:${c.inkMuted};max-width:34ch;}`,
    html: `<div class="b-body">${esc(d.text)}</div>`,
  };
}

// ---------------------------------------------------------------------------
// rows: stacked cards, each a name, a detail and a status pill.
// For showing several people or items with outcomes.
// ---------------------------------------------------------------------------
export function rows(d = {}) {
  const items = (d.items || []).slice(0, 3);
  const glyph = {
    call: `<svg viewBox="0 0 24 24" fill="none" stroke="${c.inkSubtle}" stroke-width="2.2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>`,
    text: `<svg viewBox="0 0 24 24" fill="none" stroke="${c.inkSubtle}" stroke-width="2.2" stroke-linecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>`,
  };
  return {
    css: `
      .b-rows{display:flex;flex-direction:column;gap:${sp(1.5)};}
      .b-row{${CARD}display:flex;align-items:center;gap:${sp(2)};padding:${sp(2)} ${sp(3)};}
      .b-icon{width:60px;height:60px;border-radius:${t.radius.pill}px;background:${c.surfaceAlt};
        flex:none;display:flex;align-items:center;justify-content:center;}
      .b-icon svg{width:30px;height:30px;}
      .b-rtext{flex:1;min-width:0;}
      .b-rname{font-weight:${t.font.bold};font-size:${S.subhead}px;color:${c.ink};
        letter-spacing:-0.015em;line-height:1.1;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;}
      .b-rmeta{font-weight:${t.font.regular};font-size:${S.small}px;color:${c.inkSubtle};
        line-height:1.25;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .b-pill{font-weight:${t.font.bold};font-size:${S.label}px;padding:10px 22px;
        border-radius:${t.radius.pill}px;flex:none;}
    `,
    html: `<div class="b-rows">${items.map((r) => {
      const tone = statusInk[r.status] ? r.status : "none";
      return `<div class="b-row">
        <div class="b-icon">${glyph[r.channel] || ""}</div>
        <div class="b-rtext">
          <div class="b-rname">${esc(r.name)}</div>
          ${r.detail ? `<div class="b-rmeta">${esc(r.detail)}</div>` : ""}
        </div>
        ${r.label ? `<div class="b-pill" style="color:${statusInk[tone]};background:${statusBg[tone]}">${esc(r.label)}</div>` : ""}
      </div>`;
    }).join("")}</div>`,
  };
}

// ---------------------------------------------------------------------------
// compare: two columns, equal weight. For contrasting two things or showing
// a decision. Neither side is styled as the winner; the labels carry that.
// ---------------------------------------------------------------------------
export function compare(d = {}) {
  const cols = (d.columns || []).slice(0, 2);
  return {
    css: `
      .b-cmp{display:flex;gap:${sp(2)};align-items:stretch;}
      .b-col{${CARD}flex:1;min-width:0;padding:${sp(3)};display:flex;flex-direction:column;gap:${sp(2)};
        position:relative;overflow:hidden;}
      .b-rule{position:absolute;left:0;right:0;top:0;height:8px;}
      .b-chead{display:flex;align-items:flex-start;justify-content:space-between;gap:${sp(1)};margin-top:6px;min-height:${S.label + 20}px;}
      .b-ctitle{font-weight:${t.font.bold};font-size:${S.subhead}px;color:${c.ink};letter-spacing:-0.015em;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.1;}
      .b-cpill{font-weight:${t.font.bold};font-size:${S.label}px;padding:8px 18px;
        border-radius:${t.radius.pill}px;flex:none;}
      .b-ctext{font-weight:${t.font.regular};font-size:${S.small}px;line-height:1.35;color:${c.inkMuted};}
    `,
    html: `<div class="b-cmp">${cols.map((col) => {
      const tone = statusInk[col.status] ? col.status : "none";
      return `<div class="b-col">
        <div class="b-rule" style="background:${statusInk[tone]}"></div>
        <div class="b-chead">
          <div class="b-ctitle">${esc(col.title)}</div>
          ${col.label ? `<div class="b-cpill" style="color:${statusInk[tone]};background:${statusBg[tone]}">${esc(col.label)}</div>` : ""}
        </div>
        ${col.text ? `<div class="b-ctext">${esc(col.text)}</div>` : ""}
      </div>`;
    }).join("")}</div>`,
  };
}

// ---------------------------------------------------------------------------
// stat: one dominant number. Only ever used with a real figure.
// ---------------------------------------------------------------------------
export function stat(d = {}) {
  return {
    css: `
      .b-stat{display:flex;align-items:baseline;gap:${sp(2)};}
      .b-num{font-weight:${t.font.extrabold};font-size:${S.stat}px;line-height:0.85;
        letter-spacing:-0.045em;color:${c.accent};font-feature-settings:${t.font.tabularNums};}
      .b-unit{font-weight:${t.font.bold};font-size:${Math.round(S.stat * 0.28)}px;
        color:${c.accent};letter-spacing:-0.02em;}
      .b-slabel{font-weight:${t.font.medium};font-size:${S.body}px;line-height:1.3;
        color:${c.inkMuted};margin-top:${sp(2)};max-width:30ch;}
    `,
    html: `<div>
      <div class="b-stat"><span class="b-num">${esc(d.value)}</span>${d.unit ? `<span class="b-unit">${esc(d.unit)}</span>` : ""}</div>
      ${d.label ? `<div class="b-slabel">${esc(d.label)}</div>` : ""}
    </div>`,
  };
}

// ---------------------------------------------------------------------------
// screenshot: a product shot from the catalogue. Must be a legible fragment,
// not a dense dashboard, or it spends the attention budget on nothing.
// ---------------------------------------------------------------------------
export function screenshot(d = {}) {
  const src = /^https?:|^data:/.test(d.name || "") ? d.name : t.shots.url(d.name);
  if (!src) return { css: "", html: "" };
  return {
    css: `.b-shot{display:flex;justify-content:center;align-items:center;}
      .b-shot img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;}`,
    html: `<div class="b-shot"><img src="${src}"></div>`,
  };
}

// ---------------------------------------------------------------------------
// points: two or three parallel facts, each marked with the fluent device.
// ---------------------------------------------------------------------------
export function points(d = {}) {
  const items = (d.items || []).slice(0, 3);
  return {
    css: `
      .b-pts{display:flex;flex-direction:column;gap:${sp(2)};}
      .b-pt{${CARD}display:flex;align-items:center;gap:${sp(3)};padding:${sp(3)} ${sp(4)};
        font-weight:${t.font.medium};font-size:${S.subhead}px;color:${c.ink};
        letter-spacing:-0.015em;line-height:1.2;}
      .b-pt i{width:${t.shell.diamond}px;height:${t.shell.diamond}px;border-radius:4px;
        background:${c.accent};transform:rotate(45deg);flex:none;}
    `,
    html: `<div class="b-pts">${items.map((x) => `<div class="b-pt"><i></i>${esc(x)}</div>`).join("")}</div>`,
  };
}

// ---------------------------------------------------------------------------
// quote: someone else's words. Never used without permission.
// ---------------------------------------------------------------------------
export function quote(d = {}) {
  return {
    css: `
      .b-quote{border-left:10px solid ${c.accent};padding-left:${sp(3)};}
      .b-qtext{font-weight:${t.font.bold};font-size:${S.subhead}px;line-height:1.25;
        letter-spacing:-0.02em;color:${c.ink};max-width:26ch;}
      .b-qattr{font-weight:${t.font.regular};font-size:${S.small}px;color:${c.inkSubtle};
        margin-top:${sp(2)};}
    `,
    html: `<div class="b-quote">
      <div class="b-qtext">${esc(d.text)}</div>
      ${d.attribution ? `<div class="b-qattr">${esc(d.attribution)}</div>` : ""}
    </div>`,
  };
}

// ---------------------------------------------------------------------------
// cta: the accent pill. Omit entirely for opinion posts.
// ---------------------------------------------------------------------------
export function cta(d = {}) {
  return {
    css: `.b-cta{align-self:flex-start;background:${c.accent};color:${c.accentInk};
      font-weight:${t.font.bold};font-size:${S.body}px;padding:${sp(3)} ${sp(5)};
      border-radius:${t.radius.pill}px;}`,
    html: `<div class="b-cta">${esc(d.text)}</div>`,
  };
}

export const BLOCKS = { body, rows, compare, stat, screenshot, points, quote, cta };

// What the planner is told each block is for.
export const BLOCK_CATALOGUE = [
  { name: "body", useWhen: "A single supporting sentence under the headline. Use in almost every post unless the headline stands alone.", shape: '{ "text": "one sentence, 18 words max" }' },
  { name: "rows", useWhen: "Showing two or three people or items each with an outcome. Good for screening results, callbacks, applicants.", shape: '{ "items": [ { "name": "Marek K.", "detail": "3 years commercial", "label": "Pass", "status": "pass|fail|wait", "channel": "call|text" } ] }' },
  { name: "compare", useWhen: "Contrasting exactly two things, or showing a decision with its reasoning on both sides.", shape: '{ "columns": [ { "title": "Dele O.", "label": "Pass", "status": "pass", "text": "why, 14 words max" } ] }' },
  { name: "stat", useWhen: "ONE real number worth leading with. Never use this without a genuine figure from the brief.", shape: '{ "value": "12", "unit": "min", "label": "what the number is" }' },
  { name: "screenshot", useWhen: "The product itself is the proof. Pick a name from the screenshot catalogue.", shape: '{ "name": "pipeline" }' },
  { name: "points", useWhen: "Two or three short parallel facts. Each must be under 8 words.", shape: '{ "items": ["Runs overnight", "Call or text"] }' },
  { name: "quote", useWhen: "Someone else's words. NEVER use without a real quote supplied in the brief.", shape: '{ "text": "the quote", "attribution": "role, company" }' },
  { name: "cta", useWhen: "Direct response posts only. Omit for opinion or advice posts.", shape: '{ "text": "Book a 15 minute demo" }' },
];

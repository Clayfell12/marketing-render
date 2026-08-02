// DriverTrack "stat" template, square-native.
// One dominant number carrying a single proof point.
//
// Design thinking:
// - The number is the hero and it is set enormous, scaled from the canvas width so
//   it holds at any output size. Tabular figures so digits sit on a true grid.
// - The unit sits alongside at a fraction of the size, baseline-aligned, so "40" and
//   "min" read as one object rather than two words.
// - Two supporting facts sit below as quiet cards. They give the number context
//   without competing: this is where the scepticism gets answered.
// - Accent is spent on the number and the CTA. Nothing else.

import { drivertrack as t } from "../tokens/drivertrack.js";
import { buildDocument } from "../lib/render.js";
import { baseCss, logoTag, eyebrowTag } from "../lib/chrome.js";

export function stat(data = {}) {
  const {
    format = "square",
    eyebrow = "Speed to contact",
    value = "12",
    unit = "min",
    statLabel = "Average time from application to first contact",
    context = "Applications do not wait for office hours. Neither does the screening.",
    cta = "Book a 15 minute demo",
    supportA = "Runs overnight and at weekends",
    supportB = "Call or text, whichever they answer",
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;
  const numSize = Math.round(w * 0.24);

  const css = `
    ${baseCss(t, c, w, h, { fieldHeight: "58%" })}
    .statblock{position:relative;z-index:2;margin:${t.space(4)} ${t.space(6)} 0;
      display:flex;align-items:baseline;gap:14px;}
    .num{font-weight:${t.font.extrabold};font-size:${numSize}px;line-height:0.86;
      letter-spacing:-0.045em;color:${c.accent};font-feature-settings:${t.font.tabularNums};}
    .unit{font-weight:${t.font.bold};font-size:${Math.round(numSize * 0.26)}px;
      color:${c.accent};letter-spacing:-0.02em;}
    .statlabel{position:relative;z-index:2;margin:${t.space(2)} ${t.space(6)} 0;
      font-weight:${t.font.bold};font-size:${t.size.md}px;line-height:1.2;
      letter-spacing:${t.font.displayTracking};color:${c.ink};max-width:20ch;}
    .context{position:relative;z-index:2;margin:${t.space(2)} ${t.space(6)} 0;
      font-weight:${t.font.regular};font-size:${t.size.sm}px;line-height:1.5;
      color:${c.inkMuted};max-width:36ch;}
    .props{position:relative;z-index:2;margin:${t.space(4)} ${t.space(6)} 0;
      display:flex;flex-direction:column;gap:10px;}
    .prop{display:flex;align-items:center;gap:14px;background:${c.surface};
      border:1px solid ${c.hairline};border-radius:${t.radius.md}px;padding:16px 20px;
      box-shadow:0 6px 18px rgba(17,17,19,0.05);font-weight:${t.font.medium};
      font-size:19px;color:${c.ink};}
    .prop b{width:9px;height:9px;border-radius:2px;background:${c.accent};
      transform:rotate(45deg);flex:none;}
  `;

  const bodyHtml = `
    <div class="stage">
      <div class="field"></div>
      ${logoTag(t)}
      <div class="top">${eyebrowTag(eyebrow)}</div>
      <div class="statblock">
        <span class="num">${value}</span><span class="unit">${unit}</span>
      </div>
      <div class="statlabel">${statLabel}</div>
      <div class="context">${context}</div>
      <div class="props">
        <div class="prop"><b></b>${supportA}</div>
        <div class="prop"><b></b>${supportB}</div>
      </div>
      <div class="cta">${cta}</div>
    </div>`;

  return { html: buildDocument({ bodyHtml, css, width: w, height: h }), width: w, height: h };
}

export const schema = {
  key: "dt-stat",
  brand: "drivertrack",
  label: "Stat card",
  blurb: "One big number carrying a single proof point, with two supporting facts.",
  useWhen:
    "Use when there is ONE number worth leading with. Do not invent numbers. Only use this template if the brief supplies a real figure.",
  format: "square",
  fields: [
    { name: "eyebrow", label: "Eyebrow", type: "text" },
    { name: "value", label: "The number", type: "text" },
    { name: "unit", label: "Unit", type: "text", hint: "min, hrs, %, x. Leave blank for a plain number." },
    { name: "statLabel", label: "What the number is", type: "textarea", rows: 2 },
    { name: "context", label: "Context line", type: "textarea", rows: 2 },
    { name: "supportA", label: "Supporting fact 1", type: "text" },
    { name: "supportB", label: "Supporting fact 2", type: "text" },
    { name: "cta", label: "Button", type: "text" },
  ],
};

export default stat;

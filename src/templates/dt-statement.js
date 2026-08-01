// DriverTrack "statement" template, square-native.
// The workhorse. A single opinion or observation, set large, for the quick posts
// that make up most of a regular posting rhythm.
//
// Design thinking:
// - Nothing competes with the sentence. No panel, no product, no supporting cards.
//   The headline runs at display size and takes most of the frame, which is the
//   point: a take is worth reading or it is not.
// - The gradient sits low and shallow so the type has clean white behind it and the
//   card still belongs to the family.
// - An optional attribution line lets it double as a "said by Clay" card, which is
//   what makes a text post feel like a person rather than a brand account.

import { drivertrack as t } from "../tokens/drivertrack.js";
import { buildDocument } from "../lib/render.js";
import { baseCss, logoTag, eyebrowTag } from "../lib/chrome.js";

export function statement(data = {}) {
  const {
    format = "square",
    eyebrow = "",
    headline = "The good drivers get hired before peak starts, not during it.",
    support = "By the time the volume lands, you are choosing from what everyone else left behind.",
    attribution = "",
    cta = "",
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;
  const headSize = Math.round(w * 0.072);

  const css = `
    ${baseCss(t, c, w, h, { fieldHeight: "34%", ctaPush: false })}
    .body{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center;padding:${t.space(6)} ${t.space(6)} ${t.space(2)};gap:${t.space(3)};}
    .head{font-weight:${t.font.extrabold};font-size:${headSize}px;line-height:1.08;
      letter-spacing:-0.028em;color:${c.ink};max-width:17ch;}
    .sup{font-weight:${t.font.regular};font-size:${t.size.base}px;line-height:1.45;
      color:${c.inkMuted};max-width:32ch;}
    .attr{display:flex;align-items:center;gap:12px;margin-top:${t.space(1)};
      font-weight:${t.font.medium};font-size:19px;color:${c.inkSubtle};}
    .attr b{width:28px;height:2px;background:${c.accent};flex:none;}
    .nocta{margin-bottom:${t.space(6)};}
  `;

  const bodyHtml = `
    <div class="stage">
      <div class="field"></div>
      ${logoTag(t)}
      ${eyebrow ? `<div class="top">${eyebrowTag(eyebrow)}</div>` : ""}
      <div class="body">
        <div class="head">${headline}</div>
        ${support ? `<div class="sup">${support}</div>` : ""}
        ${attribution ? `<div class="attr"><b></b>${attribution}</div>` : ""}
      </div>
      ${cta ? `<div class="cta">${cta}</div>` : `<div class="nocta"></div>`}
    </div>`;

  return { html: buildDocument({ bodyHtml, css, width: w, height: h }), width: w, height: h };
}

export const schema = {
  key: "dt-statement",
  brand: "drivertrack",
  label: "Statement card",
  blurb: "A single take, set large. The workhorse for quick posts.",
  format: "square",
  fields: [
    { name: "eyebrow", label: "Eyebrow", type: "text", optional: true },
    { name: "headline", label: "The statement", type: "textarea", rows: 3 },
    { name: "support", label: "Support line", type: "textarea", rows: 2, optional: true },
    { name: "attribution", label: "Attribution", type: "text", optional: true,
      hint: "e.g. Clay Harris, DriverTrack. Leave blank for none." },
    { name: "cta", label: "Button", type: "text", optional: true,
      hint: "Leave blank for a clean text-only card." },
  ],
};

export default statement;

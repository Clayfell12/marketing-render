// DriverTrack "quote" template, square-native.
// Someone else's words about the product. The most persuasive asset a niche B2B
// brand owns, because in a small community a recognised name carries more weight
// than any claim the vendor makes.
//
// Design thinking:
// - The quote is set large and tight, black on white, with no quotation marks in
//   the text itself. Instead an oversized glyph sits behind it in accentSoft as a
//   watermark, so the mark is present without stealing contrast from the words.
// - A left accent rule runs the height of the quote. It is the only hard accent in
//   the upper frame and it anchors the block without a box around it.
// - Attribution sits on the tinted field below as a single quiet line. Role and
//   company matter more than the name for credibility in this market.
//
// NOTE: never render a real customer's words without their written permission.

import { drivertrack as t } from "../tokens/drivertrack.js";
import { buildDocument } from "../lib/render.js";
import { baseCss, logoTag, eyebrowTag } from "../lib/chrome.js";

export function quote(data = {}) {
  const {
    format = "square",
    eyebrow = "What DSPs say",
    quoteText = "We were losing good drivers to the DSP next door for no reason other than they rang first. That does not happen now.",
    personName = "Operations manager",
    personRole = "Amazon DSP",
    personCompany = "Riverside North",
    cta = "Book a 15 minute demo",
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;
  const markSize = Math.round(w * 0.42);

  const attribution = [personRole, personCompany].filter(Boolean).join(", ");

  const css = `
    ${baseCss(t, c, w, h, { fieldHeight: "40%", ctaPush: false })}
    .mark{position:absolute;top:${t.space(9)};left:${t.space(4)};z-index:1;
      font-weight:${t.font.extrabold};font-size:${markSize}px;line-height:1;
      color:${c.accentSoft};user-select:none;}
    .quote{position:relative;z-index:2;flex:1;display:flex;align-items:center;margin:${t.space(3)} ${t.space(6)} 0;
      padding-left:${t.space(3)};border-left:5px solid ${c.accent};
      font-weight:${t.font.bold};font-size:${t.size.xl}px;line-height:1.22;
      letter-spacing:${t.font.displayTracking};color:${c.ink};max-width:24ch;}
    .attr{position:relative;z-index:2;margin:0 ${t.space(6)} ${t.space(4)};
      display:flex;align-items:center;gap:16px;}
    .who{width:56px;height:56px;border-radius:${t.radius.pill}px;background:${c.surface};
      border:1px solid ${c.hairline};flex:none;}
    .name{font-weight:${t.font.bold};font-size:21px;color:${c.ink};}
    .role{font-weight:${t.font.regular};font-size:17px;color:${c.inkSubtle};margin-top:2px;}
  `;

  const bodyHtml = `
    <div class="stage">
      <div class="field"></div>
      ${logoTag(t)}
      <div class="mark">&ldquo;</div>
      <div class="top">${eyebrowTag(eyebrow)}</div>
      <div class="quote">${quoteText}</div>
      <div class="attr">
        <div class="who"></div>
        <div>
          <div class="name">${personName}</div>
          <div class="role">${attribution}</div>
        </div>
      </div>
      <div class="cta">${cta}</div>
    </div>`;

  return { html: buildDocument({ bodyHtml, css, width: w, height: h }), width: w, height: h };
}

export const schema = {
  key: "dt-quote",
  brand: "drivertrack",
  label: "Quote card",
  blurb: "A DSP owner's words. Only use with their written permission.",
  useWhen:
    "Use only when the brief supplies a real quote from a named or anonymised customer with permission. Never fabricate a quote.",
  format: "square",
  fields: [
    { name: "eyebrow", label: "Eyebrow", type: "text" },
    { name: "quoteText", label: "The quote", type: "textarea", rows: 4 },
    { name: "personName", label: "Name or job title", type: "text" },
    { name: "personRole", label: "Role", type: "text" },
    { name: "personCompany", label: "Company or station", type: "text" },
    { name: "cta", label: "Button", type: "text" },
  ],
};

export default quote;

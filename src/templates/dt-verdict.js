// DriverTrack "verdict" template, square-native.
// Two screening decisions side by side: one pass, one fail, with the reasoning.
//
// Why this asset matters more than a feature list:
// The objection every DSP owner has about automated screening is "it will filter
// out good people". A rules engine cannot answer that. Showing the actual reasoning
// on a rejection can. The fail example is the persuasive one, because it rejects a
// candidate who is otherwise strong, for a specific and defensible reason.
//
// Design thinking:
// - Two cards, equal weight, distinguished only by the verdict pill and a coloured
//   top rule. Neither is styled as "the good one", because the point is judgement,
//   not filtering.
// - The reasoning text is the hero of each card and gets the most room. The met and
//   not-met rows underneath are supporting evidence, set small.
// - Accent blue appears only on the eyebrow tick and the CTA. Verdict colour comes
//   from the status tokens so pass and fail read instantly without competing.

import { drivertrack as t } from "../tokens/drivertrack.js";
import { buildDocument } from "../lib/render.js";
import { baseCss, logoTag, eyebrowTag } from "../lib/chrome.js";

export function verdict(data = {}) {
  const {
    format = "square",
    eyebrow = "Screening decisions",
    headline = "It does not just filter. It explains itself.",
    passName = "Dele O.",
    passReason = "Clean licence held 11 years, 18 months of Amazon multi-drop experience, and full availability including weekends.",
    passChecks = "Licence · Endorsements · Experience · Availability",
    failName = "Kieran W.",
    failReason = "Over the points limit at 8, above the 6 allowed for this role. Both endorsements are speeding, no drink or drug offences, and the experience is otherwise strong.",
    failChecks = "Endorsements · Experience · Availability",
    cta = "Book a 15 minute demo",
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;

  function card(name, verdictLabel, tone, reason, checks) {
    const line = tone === "pass" ? c.success : c.danger;
    const soft = tone === "pass" ? c.successSoft : c.dangerSoft;
    return `
      <div class="vcard">
        <div class="vrule" style="background:${line}"></div>
        <div class="vhead">
          <div class="vname">${name}</div>
          <div class="vpill" style="color:${line};background:${soft}">${verdictLabel}</div>
        </div>
        <div class="vreason">${reason}</div>
        <div class="vchecks">${checks}</div>
      </div>`;
  }

  const css = `
    ${baseCss(t, c, w, h, { fieldHeight: "62%", ctaPush: false })}
    .head{position:relative;z-index:2;margin:${t.space(1)} ${t.space(6)} 0;
      font-weight:${t.font.extrabold};font-size:${t.size.lg}px;line-height:1.1;
      letter-spacing:${t.font.displayTracking};color:${c.ink};max-width:22ch;}
    .cards{position:relative;z-index:2;flex:1;display:flex;gap:${t.space(2)};
      margin:${t.space(4)} ${t.space(6)} 0;align-items:stretch;}
    .vcard{flex:1;background:${c.surface};border:1px solid ${c.hairline};
      border-radius:${t.radius.lg}px;padding:${t.space(3)};display:flex;
      flex-direction:column;gap:14px;box-shadow:0 12px 32px rgba(17,17,19,0.07);
      position:relative;overflow:hidden;}
    .vrule{position:absolute;left:0;right:0;top:0;height:5px;}
    .vhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;}
    .vname{font-weight:${t.font.bold};font-size:22px;color:${c.ink};}
    .vpill{font-weight:${t.font.bold};font-size:14px;padding:6px 14px;
      border-radius:${t.radius.pill}px;flex:none;}
    .vreason{font-weight:${t.font.regular};font-size:18px;line-height:1.45;
      color:${c.inkMuted};flex:1;}
    .vchecks{font-weight:${t.font.medium};font-size:14px;color:${c.inkFaint};
      border-top:1px solid ${c.hairline};padding-top:12px;line-height:1.4;}
  `;

  const bodyHtml = `
    <div class="stage">
      <div class="field"></div>
      ${logoTag(t)}
      <div class="top">${eyebrowTag(eyebrow)}</div>
      <div class="head">${headline}</div>
      <div class="cards">
        ${card(passName, "Pass", "pass", passReason, passChecks)}
        ${card(failName, "Fail", "fail", failReason, failChecks)}
      </div>
      <div class="cta">${cta}</div>
    </div>`;

  return { html: buildDocument({ bodyHtml, css, width: w, height: h }), width: w, height: h };
}

export const schema = {
  key: "dt-verdict",
  brand: "drivertrack",
  label: "Screening verdict",
  blurb: "Two decisions side by side with the reasoning. Answers the will-it-reject-good-people objection.",
  format: "square",
  fields: [
    { name: "eyebrow", label: "Eyebrow", type: "text" },
    { name: "headline", label: "Headline", type: "textarea", rows: 2 },
    { name: "passName", label: "Pass: name", type: "text" },
    { name: "passReason", label: "Pass: reasoning", type: "textarea", rows: 3 },
    { name: "passChecks", label: "Pass: checks met", type: "text" },
    { name: "failName", label: "Fail: name", type: "text" },
    { name: "failReason", label: "Fail: reasoning", type: "textarea", rows: 3 },
    { name: "failChecks", label: "Fail: checks met", type: "text" },
    { name: "cta", label: "Button", type: "text" },
  ],
};

export default verdict;

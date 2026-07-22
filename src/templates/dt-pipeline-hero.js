// DriverTrack "pipeline hero" template, square-native (1080x1080).
// DriverTrack renders are always square, so this is built as a vertical stack,
// not a squashed landscape: text block on top, product visual below.
//
// Design thinking:
// - Vertical rhythm: eyebrow, headline, support at the top on clean white; the
//   product visual (the callbacks queue, the signature element) anchored in the
//   lower half on a tinted field; CTA bridges the two.
// - The hero zone (laptop shot) overlays the tinted lower field, sitting in front
//   of the queue so the queue reads as the screen content behind the device.
// - Accent blue appears exactly twice: the eyebrow tick and the CTA. Nowhere else.
// - Inter throughout, weight contrast not a second face, headline tracking pulled in.

import { drivertrack as t } from "../tokens/drivertrack.js";
import { buildDocument } from "../lib/render.js";

export function pipelineHero(data = {}) {
  const {
    format = "square",
    eyebrow = "AI voice screening",
    headline = "You wake up to a pipeline, not a pile of CVs",
    support = "DriverTrack calls, screens and sorts every applicant overnight. Consent-first, UK-hosted, built for DSPs.",
    cta = "Book a 15 minute demo",
    heroImage = null,   // null = dashed placeholder zone; URL = baked in
    showQueue = true,
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;

  const rows = [
    { name: "Marek K.", meta: "Cat C+E \u00b7 Polish", status: "Pass", tone: "success" },
    { name: "Aisha R.", meta: "Right to work confirmed", status: "Callback", tone: "warning" },
    { name: "Dan H.", meta: "No weekend availability", status: "Decline", tone: "danger" },
  ];
  const statusColor = { success: c.success, warning: c.warning, danger: c.danger };
  const statusSoft = { success: c.successSoft, warning: c.warningSoft, danger: c.dangerSoft };

  const queueRows = rows
    .map(
      (r) => `
    <div class="row">
      <div class="avatar"></div>
      <div class="rowtext">
        <div class="rname">${r.name}</div>
        <div class="rmeta">${r.meta}</div>
      </div>
      <div class="pill" style="color:${statusColor[r.tone]};background:${statusSoft[r.tone]}">${r.status}</div>
    </div>`
    )
    .join("");

  const heroSlot = heroImage
    ? `<img class="heroimg" src="${heroImage}" />`
    : `<div class="heroslot"><span>hero image overlays here</span></div>`;

  const css = `
    .stage{position:relative;width:${w}px;height:${h}px;background:${c.canvas};overflow:hidden;display:flex;flex-direction:column;}
    .top{padding:${t.space(6)} ${t.space(6)} ${t.space(3)};display:flex;flex-direction:column;gap:${t.space(2)};z-index:3;}
    .eyebrow{display:flex;align-items:center;gap:12px;font-weight:${t.font.bold};font-size:18px;color:${c.inkSubtle};letter-spacing:0.08em;text-transform:uppercase;}
    .tick{width:13px;height:13px;border-radius:3px;background:${c.accent};transform:rotate(45deg);flex:none;}
    .headline{font-weight:${t.font.extrabold};font-size:${t.size.xxl}px;line-height:1.05;letter-spacing:${t.font.displayTracking};color:${c.ink};max-width:16ch;}
    .support{font-weight:${t.font.regular};font-size:${t.size.base}px;line-height:1.5;color:${c.inkMuted};max-width:38ch;}
    .cta{margin-top:${t.space(2)};align-self:flex-start;background:${c.accent};color:${c.accentInk};font-weight:${t.font.bold};font-size:20px;padding:18px 34px;border-radius:${t.radius.pill}px;z-index:3;}
    .bottom{position:relative;margin-top:auto;height:46%;background:${c.surfaceAlt};overflow:hidden;}
    .glow{position:absolute;inset:0;background:linear-gradient(180deg, ${c.accentSoft} 0%, rgba(219,234,254,0) 55%);opacity:0.7;}
    .topfade{position:absolute;left:0;right:0;top:0;height:80px;background:linear-gradient(180deg, ${c.canvas} 0%, rgba(255,255,255,0) 100%);z-index:1;}
    .queue{position:absolute;left:${t.space(6)};top:${t.space(4)};width:560px;display:flex;flex-direction:column;gap:12px;z-index:2;
      ${showQueue ? "" : "display:none;"}}
    .qlabel{font-weight:${t.font.bold};font-size:14px;letter-spacing:0.1em;text-transform:uppercase;color:${c.inkSubtle};margin-bottom:2px;padding-left:2px;}
    .row{display:flex;align-items:center;gap:14px;background:${c.surface};border:1px solid ${c.hairline};border-radius:${t.radius.md}px;padding:14px 18px;box-shadow:0 12px 32px rgba(17,17,19,0.09);}
    .avatar{width:42px;height:42px;border-radius:${t.radius.pill}px;background:${c.surfaceAlt};flex:none;}
    .rowtext{flex:1;min-width:0;}
    .rname{font-weight:${t.font.bold};font-size:19px;color:${c.ink};}
    .rmeta{font-weight:${t.font.regular};font-size:15px;color:${c.inkSubtle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .pill{font-weight:${t.font.bold};font-size:14px;padding:7px 15px;border-radius:${t.radius.pill}px;flex:none;}
    .heroslot{position:absolute;right:${t.space(4)};bottom:${t.space(4)};width:50%;height:78%;border:2px dashed ${c.hairline};border-radius:${t.radius.lg}px;display:flex;align-items:center;justify-content:center;color:${c.inkFaint};font-size:15px;font-weight:${t.font.medium};text-align:center;padding:0 20px;z-index:4;background:rgba(255,255,255,0.35);}
    .heroimg{position:absolute;right:0;bottom:0;width:58%;height:auto;z-index:4;}
  `;

  const bodyHtml = `
    <div class="stage">
      <div class="top">
        <div class="eyebrow"><span class="tick"></span>${eyebrow}</div>
        <div class="headline">${headline}</div>
        <div class="support">${support}</div>
        <div class="cta">${cta}</div>
      </div>
      <div class="bottom">
        <div class="glow"></div>
        <div class="topfade"></div>
        <div class="queue">
          <div class="qlabel">This morning's callbacks</div>
          ${queueRows}
        </div>
        ${heroSlot}
      </div>
    </div>`;

  return {
    html: buildDocument({ bodyHtml, css, width: w, height: h }),
    width: w,
    height: h,
  };
}

export default pipelineHero;

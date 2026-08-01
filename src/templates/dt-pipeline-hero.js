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
    eyebrow = "AI candidate screening",
    headline = "You wake up to a pipeline, not a pile of CVs",
    support = "DriverTrack screens and sorts every applicant by call or text, day or night. Consent-first, UK-hosted, built for DSPs.",
    cta = "Book a 15 minute demo",
    heroImage = "pipeline", // a shot name (pipeline, conversation, screen-pass,
                            // screen-fail), a full URL, or null for an empty zone
    showQueue = true,
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;
  // hero square scales with the canvas (46% of width) so it holds at any output size
  const heroSize = Math.round(w * 0.46);

  const rows = [
    { name: "Marek K.", meta: "3 years commercial driving experience", status: "Pass", tone: "success", channel: "call" },
    { name: "Aisha R.", meta: "Right to work confirmed", status: "Callback", tone: "warning", channel: "text" },
    { name: "Dan H.", meta: "No weekend availability", status: "Decline", tone: "danger", channel: "call" },
  ];

  // Channel glyphs. The avatar circle doubles as the screening-channel indicator,
  // so the rows themselves show that screening happens by call or by text.
  const glyph = {
    call: `<svg viewBox="0 0 24 24" fill="none" stroke="${c.inkSubtle}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    text: `<svg viewBox="0 0 24 24" fill="none" stroke="${c.inkSubtle}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  };
  const statusColor = { success: c.success, warning: c.warning, danger: c.danger };
  const statusSoft = { success: c.successSoft, warning: c.warningSoft, danger: c.dangerSoft };

  const queueRows = rows
    .map(
      (r) => `
    <div class="row">
      <div class="avatar">${glyph[r.channel] || ""}</div>
      <div class="rowtext">
        <div class="rname">${r.name}</div>
        <div class="rmeta">${r.meta}</div>
      </div>
      <div class="pill" style="color:${statusColor[r.tone]};background:${statusSoft[r.tone]}">${r.status}</div>
    </div>`
    )
    .join("");

  // Accept either a short shot name or a full URL
  const heroSrc = heroImage
    ? (/^https?:|^data:/.test(heroImage) ? heroImage : t.shots.url(heroImage))
    : null;

  const heroSlot = heroSrc
    ? `<div class="herobox"><img class="heroimg" src="${heroSrc}" /></div>`
    : `<div class="heroslot"><span>hero image overlays here</span></div>`;

  const logoUrl = t.logo.url("accent");
  const logoHtml = logoUrl
    ? `<img class="logo" src="${logoUrl}" />`
    : "";

  const css = `
    .stage{position:relative;width:${w}px;height:${h}px;background:${c.canvas};overflow:hidden;display:flex;flex-direction:column;}
    .logo{position:absolute;top:${t.space(5)};right:${t.space(6)};height:64px;width:auto;z-index:5;}
    .top{padding:${t.space(6)} ${t.space(6)} ${t.space(3)};display:flex;flex-direction:column;gap:${t.space(2)};z-index:3;}
    .eyebrow{display:flex;align-items:center;gap:12px;font-weight:${t.font.bold};font-size:18px;color:${c.inkSubtle};letter-spacing:0.08em;text-transform:uppercase;}
    .tick{width:13px;height:13px;border-radius:3px;background:${c.accent};transform:rotate(45deg);flex:none;}
    .headline{font-weight:${t.font.extrabold};font-size:${t.size.xxl}px;line-height:1.05;letter-spacing:${t.font.displayTracking};color:${c.ink};max-width:16ch;}
    .support{font-weight:${t.font.regular};font-size:${t.size.base}px;line-height:1.5;color:${c.inkMuted};max-width:38ch;}
    .cta{margin-top:${t.space(2)};align-self:flex-start;background:${c.accent};color:${c.accentInk};font-weight:${t.font.bold};font-size:20px;padding:18px 34px;border-radius:${t.radius.pill}px;z-index:3;}
    .bottom{position:relative;margin-top:auto;height:54%;background:${c.surfaceAlt};overflow:hidden;}
    .glow{position:absolute;inset:0;background:linear-gradient(180deg, ${c.accentSoft} 0%, rgba(219,234,254,0) 55%);opacity:0.7;}
    .topfade{position:absolute;left:0;right:0;top:0;height:80px;background:linear-gradient(180deg, ${c.canvas} 0%, rgba(255,255,255,0) 100%);z-index:1;}
    .queue{position:absolute;left:${t.space(6)};bottom:${t.space(5)};width:560px;display:flex;flex-direction:column;gap:12px;z-index:2;
      ${showQueue ? "" : "display:none;"}}
    .qlabel{font-weight:${t.font.bold};font-size:14px;letter-spacing:0.1em;text-transform:uppercase;color:${c.inkSubtle};margin-bottom:2px;padding-left:2px;}
    .row{display:flex;align-items:center;gap:14px;background:${c.surface};border:1px solid ${c.hairline};border-radius:${t.radius.md}px;padding:14px 18px;box-shadow:0 12px 32px rgba(17,17,19,0.09);}
    .avatar{width:42px;height:42px;border-radius:${t.radius.pill}px;background:${c.surfaceAlt};flex:none;display:flex;align-items:center;justify-content:center;}
    .avatar svg{width:20px;height:20px;}
    .rowtext{flex:1;min-width:0;}
    .rname{font-weight:${t.font.bold};font-size:19px;color:${c.ink};}
    .rmeta{font-weight:${t.font.regular};font-size:15px;color:${c.inkSubtle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .pill{font-weight:${t.font.bold};font-size:14px;padding:7px 15px;border-radius:${t.radius.pill}px;flex:none;}
    .heroslot{position:absolute;right:${t.space(4)};top:50%;transform:translateY(-50%);width:${heroSize}px;height:${heroSize}px;border:2px dashed ${c.hairline};border-radius:${t.radius.lg}px;display:flex;align-items:center;justify-content:center;color:${c.inkFaint};font-size:15px;font-weight:${t.font.medium};text-align:center;padding:0 20px;z-index:4;background:rgba(255,255,255,0.35);}
    .herobox{position:absolute;right:${t.space(4)};top:50%;transform:translateY(-50%);width:${heroSize}px;height:${heroSize}px;display:flex;align-items:center;justify-content:center;z-index:4;overflow:hidden;}
    .heroimg{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;}
  `;

  const bodyHtml = `
    <div class="stage">
      ${logoHtml}
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
      </div>
      ${heroSlot}
    </div>`;

  return {
    html: buildDocument({ bodyHtml, css, width: w, height: h }),
    width: w,
    height: h,
  };
}

export default pipelineHero;

// Field schema. Drives the mobile app's form and keeps it in sync automatically.
export const schema = {
  key: "dt-pipeline-hero",
  brand: "drivertrack",
  label: "Pipeline hero",
  blurb: "Product hero with the callbacks queue and a space for a laptop shot.",
  format: "square",
  fields: [
    { name: "eyebrow", label: "Eyebrow", type: "text" },
    { name: "headline", label: "Headline", type: "textarea", rows: 2 },
    { name: "support", label: "Support line", type: "textarea", rows: 3 },
    { name: "cta", label: "Button", type: "text" },
    { name: "heroImage", label: "Hero image", type: "text", optional: true,
      hint: "pipeline, conversation, screen-pass or screen-fail. Or paste a full URL. Blank for an empty zone." },
  ],
};

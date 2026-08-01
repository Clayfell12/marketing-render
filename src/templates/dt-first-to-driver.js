// DriverTrack "first to the driver" template, square-native.
// Built for the peak-hiring angle: a good applicant applies to several DSPs at the
// same station, and takes the first offer that actually turns up.
//
// Design thinking:
// - The whole graphic IS the argument: one applicant at the top, then the four DSPs
//   who received that application, ranked by how fast they responded. The winner is
//   marked. The reader instantly sees the race and where they usually finish.
// - Accent is spent on the winning row only, plus the eyebrow tick and CTA, because
//   the winning row is the entire point of the visual.
// - The losing rows use muted ink and a faint strike-through feel (no literal strike,
//   just lowered contrast) so the hierarchy reads without shouting.
// - Inter throughout, tabular figures on the times so the column aligns.

import { drivertrack as t } from "../tokens/drivertrack.js";
import { buildDocument } from "../lib/render.js";

export function firstToDriver(data = {}) {
  const {
    format = "square",
    eyebrow = "Peak hiring",
    headline = "With peak on the horizon, the best drivers get hired now.",
    support = "Most applications land over the weekend. By Monday it is a foot race, and the DSP that gets through the list first takes the best of them.",
    kicker = "Which one do you want to be?",
    cta = "Book a 15 minute demo",
    applicantName = "Marek K.",
    applicantMeta = "3 years commercial · applied 9:14pm Saturday",
    // The race. First entry is the winner.
    contenders = [
      { label: "Your DSP", time: "12 min", note: "Screened and booked", winner: true },
      { label: "DSP two", time: "6 hrs", note: "Left a voicemail" },
      { label: "DSP three", time: "2 days", note: "Applicant already placed" },
      { label: "DSP four", time: "Never", note: "Application not opened" },
    ],
  } = data;

  const { w, h } = t.formats[format] || t.formats.square;
  const c = t.color;

  const phoneGlyph = `<svg viewBox="0 0 24 24" fill="none" stroke="${c.accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

  const rowsHtml = contenders
    .map((x) => {
      if (x.winner) {
        return `
      <div class="crow win">
        <div class="cicon">${phoneGlyph}</div>
        <div class="ctext">
          <div class="clabel win">${x.label}</div>
          <div class="cnote win">${x.note}</div>
        </div>
        <div class="ctime win">${x.time}</div>
      </div>`;
      }
      return `
      <div class="crow">
        <div class="cdot"></div>
        <div class="ctext">
          <div class="clabel">${x.label}</div>
          <div class="cnote">${x.note}</div>
        </div>
        <div class="ctime">${x.time}</div>
      </div>`;
    })
    .join("");

  const logoUrl = t.logo.url("accent");
  const logoHtml = logoUrl ? `<img class="logo" src="${logoUrl}" />` : "";

  const css = `
    .stage{position:relative;width:${w}px;height:${h}px;background:${c.canvas};overflow:hidden;display:flex;flex-direction:column;}
    /* tinted gradient field in the lower frame, as per the pipeline hero look */
    .field{position:absolute;left:0;right:0;bottom:0;height:62%;background:linear-gradient(180deg, rgba(255,255,255,0) 0%, ${c.accentSoft} 38%, ${c.surfaceAlt} 100%);z-index:0;}
    .logo{position:absolute;top:${t.space(5)};right:${t.space(6)};height:78px;width:auto;z-index:5;}

    .top{position:relative;z-index:2;padding:${t.space(6)} ${t.space(6)} ${t.space(2)};display:flex;flex-direction:column;gap:${t.space(2)};}
    .eyebrow{display:flex;align-items:center;gap:12px;font-weight:${t.font.bold};font-size:18px;color:${c.inkSubtle};letter-spacing:0.08em;text-transform:uppercase;}
    .tick{width:13px;height:13px;border-radius:3px;background:${c.accent};transform:rotate(45deg);flex:none;}
    .headline{font-weight:${t.font.extrabold};font-size:${t.size.xl}px;line-height:1.1;letter-spacing:${t.font.displayTracking};color:${c.ink};max-width:26ch;}
    .support{font-weight:${t.font.regular};font-size:${t.size.sm}px;line-height:1.5;color:${c.inkMuted};max-width:44ch;}

    /* the race panel */
    .panel{position:relative;z-index:2;margin:${t.space(3)} ${t.space(6)} 0;padding:0;}
    .applicant{display:flex;align-items:center;gap:16px;background:${c.surface};border:1px solid ${c.hairline};border-radius:${t.radius.md}px;padding:18px 22px;box-shadow:0 10px 28px rgba(17,17,19,0.07);}
    .aav{width:48px;height:48px;border-radius:${t.radius.pill}px;background:${c.surfaceAlt};flex:none;}
    .aname{font-weight:${t.font.bold};font-size:22px;color:${c.ink};}
    .ameta{font-weight:${t.font.regular};font-size:16px;color:${c.inkSubtle};}
    .arrowlbl{margin:${t.space(3)} 0 ${t.space(2)};font-weight:${t.font.bold};font-size:15px;letter-spacing:0.1em;text-transform:uppercase;color:${c.inkSubtle};padding-left:2px;}

    .crow{display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:${t.radius.md}px;margin-bottom:11px;background:${c.surface};border:1px solid ${c.hairline};box-shadow:0 6px 18px rgba(17,17,19,0.05);}
    .crow.win{background:${c.surface};border:2px solid ${c.accent};box-shadow:0 10px 28px rgba(37,99,235,0.14);}
    .cdot{width:36px;height:36px;border-radius:${t.radius.pill}px;background:${c.hairline};opacity:0.6;flex:none;}
    .cicon{width:36px;height:36px;border-radius:${t.radius.pill}px;background:${c.accentSoft};flex:none;display:flex;align-items:center;justify-content:center;}
    .cicon svg{width:19px;height:19px;}
    .ctext{flex:1;min-width:0;}
    .clabel{font-weight:${t.font.medium};font-size:20px;color:${c.inkSubtle};}
    .clabel.win{font-weight:${t.font.bold};color:${c.ink};}
    .cnote{font-weight:${t.font.regular};font-size:15px;color:${c.inkFaint};}
    .cnote.win{color:${c.inkMuted};font-weight:${t.font.medium};}
    .ctime{font-weight:${t.font.bold};font-size:22px;color:${c.inkFaint};flex:none;font-feature-settings:${t.font.tabularNums};}
    .ctime.win{color:${c.accent};}

    .kicker{position:relative;z-index:2;margin:${t.space(5)} ${t.space(6)} 0;font-weight:${t.font.extrabold};font-size:${t.size.lg}px;letter-spacing:${t.font.displayTracking};color:${c.ink};}
    .cta{position:relative;z-index:2;margin:auto ${t.space(6)} ${t.space(6)};align-self:flex-start;background:${c.accent};color:${c.accentInk};font-weight:${t.font.bold};font-size:22px;padding:20px 38px;border-radius:${t.radius.pill}px;}
  `;

  const bodyHtml = `
    <div class="stage">
      <div class="field"></div>
      ${logoHtml}
      <div class="top">
        <div class="eyebrow"><span class="tick"></span>${eyebrow}</div>
        <div class="headline">${headline}</div>
        <div class="support">${support}</div>
      </div>
      <div class="panel">
        <div class="applicant">
          <div class="aav"></div>
          <div>
            <div class="aname">${applicantName}</div>
            <div class="ameta">${applicantMeta}</div>
          </div>
        </div>
        <div class="arrowlbl">Who got back to him on Monday</div>
        ${rowsHtml}
      </div>
      <div class="kicker">${kicker}</div>
      <div class="cta">${cta}</div>
    </div>`;

  return {
    html: buildDocument({ bodyHtml, css, width: w, height: h }),
    width: w,
    height: h,
  };
}

export default firstToDriver;

// Field schema. Drives the mobile app's form and keeps it in sync automatically.
export const schema = {
  key: "dt-first-to-driver",
  brand: "drivertrack",
  label: "First to the driver",
  blurb: "Speed to contact: one applicant, four DSPs, who replied first.",
  format: "square",
  fields: [
    { name: "eyebrow", label: "Eyebrow", type: "text" },
    { name: "headline", label: "Headline", type: "textarea", rows: 2 },
    { name: "support", label: "Support line", type: "textarea", rows: 3 },
    { name: "kicker", label: "Punchline", type: "text" },
    { name: "cta", label: "Button", type: "text" },
    { name: "applicantName", label: "Applicant name", type: "text" },
    { name: "applicantMeta", label: "Applicant detail", type: "text" },
  ],
};

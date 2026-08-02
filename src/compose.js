// The composer.
// Renders the locked shell (ground, logo, eyebrow with the fluent device, headline)
// and slots one or two blocks underneath. This replaces the old fixed templates:
// layout is now composed to suit the argument, but the shell and the styling of
// every block come from the brand tokens, so it cannot drift.
//
// See DESIGN-SPEC.md. The shell is not a decision the generator gets to make.

import { drivertrack as t } from "./tokens/drivertrack.js";
import { buildDocument } from "./lib/render.js";
import { BLOCKS } from "./blocks.js";

const c = t.color;
const S = t.size;
const sp = t.space;

function esc(x) {
  return String(x == null ? "" : x)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function compose(spec = {}) {
  const {
    eyebrow = "",
    headline = "",
    display = false,   // true = statement mode: headline at display size, no blocks
    blocks = [],
  } = spec;

  const w = t.shell.canvas;
  const h = t.shell.canvas;
  const m = t.shell.margin;

  // Enforce the block limit here rather than trusting the caller. Three only if
  // one is a cta, per the attention research in the spec.
  let list = Array.isArray(blocks) ? blocks.filter((b) => b && BLOCKS[b.type]) : [];
  const ctas = list.filter((b) => b.type === "cta");
  const rest = list.filter((b) => b.type !== "cta").slice(0, t.shell.maxBlocks);
  list = [...rest, ...ctas.slice(0, 1)];
  if (display) list = ctas.slice(0, 1); // statement mode carries nothing but an optional cta

  const built = list.map((b) => ({ ...BLOCKS[b.type](b), type: b.type }));
  const blockCss = built.map((b) => b.css).join("\n");
  const blockHtml = built.map((b) => `<div class="slot slot-${b.type}">${b.html}</div>`).join("");

  const headSize = display ? S.display : S.headline;
  const headMax = display ? "13ch" : "17ch";

  // The headline sits directly under the eyebrow. Rather than pushing it below the
  // logo, a floated spacer the size of the logo makes the text wrap around it, so
  // only the lines that actually reach the logo are shortened.
  const logoAspect = 1620 / 480;
  const logoW = Math.round(t.shell.logoHeight * logoAspect);
  const logoUrl = t.logo.url("accent");

  const css = `
    /* --- LOCKED SHELL --- */
    .stage{position:relative;width:${w}px;height:${h}px;background:${c.canvas};
      overflow:hidden;display:flex;flex-direction:column;}

    /* the tinted field. a distinctive asset, identical on every graphic */
    .field{position:absolute;left:0;right:0;bottom:0;height:58%;z-index:0;
      background:linear-gradient(180deg, rgba(255,255,255,0) 0%, ${c.accentSoft} 40%, ${c.surfaceAlt} 100%);}

    .logo{position:absolute;top:${m}px;right:${m}px;height:${t.shell.logoHeight}px;
      width:auto;z-index:5;}

    .head{position:relative;z-index:2;padding:${m}px ${m}px 0;display:flex;
      flex-direction:column;gap:${sp(3)};}
    /* statement mode centres the headline in the frame rather than sitting it at the top */
    .stage.statement .head{flex:1;padding-bottom:${m}px;gap:0;}
    .stage.statement .headline{margin:auto 0;}
    .eyebrow{display:flex;align-items:center;gap:${sp(2)};font-weight:${t.font.bold};
      font-size:${S.label}px;color:${c.inkSubtle};letter-spacing:0.08em;
      text-transform:uppercase;line-height:1;}
    .diamond{width:${t.shell.diamond}px;height:${t.shell.diamond}px;border-radius:4px;
      background:${c.accent};transform:rotate(45deg);flex:none;}
    .headline{font-weight:${t.font.extrabold};font-size:${headSize}px;line-height:1.06;
      letter-spacing:-0.028em;color:${c.ink};max-width:${headMax};}
    /* invisible block the size of the logo, so headline lines flow around it */
    .logospacer{float:right;width:${logoW + 40}px;height:${Math.max(0, t.shell.logoHeight - S.label - 20)}px;}

    /* --- BLOCK AREA --- */
    .blocks{position:relative;z-index:2;flex:1;min-height:0;display:flex;
      flex-direction:column;justify-content:center;gap:${sp(5)};
      padding:${sp(6)} ${m}px ${m}px;overflow:hidden;}
    .blocks.statement{flex:0 0 auto;justify-content:flex-end;padding-top:0;}
    .slot{display:block;}
    .slot-cta{margin-top:${sp(4)};}
    .slot-screenshot{flex:1;min-height:0;display:flex;align-items:center;}
    .slot-screenshot .b-shot{width:100%;height:100%;}

    ${blockCss}
  `;

  const bodyHtml = `
    <div class="stage${display ? " statement" : ""}">
      <div class="field"></div>
      ${logoUrl ? `<img class="logo" src="${logoUrl}">` : ""}
      <div class="head">
        ${eyebrow ? `<div class="eyebrow"><span class="diamond"></span>${esc(eyebrow)}</div>` : ""}
        ${headline ? `<div class="headline"><span class="logospacer"></span>${esc(headline)}</div>` : ""}
      </div>
      <div class="blocks${display ? " statement" : ""}">${blockHtml}</div>
    </div>`;

  return {
    html: buildDocument({ bodyHtml, css, width: w, height: h }),
    width: w,
    height: h,
  };
}

export default compose;

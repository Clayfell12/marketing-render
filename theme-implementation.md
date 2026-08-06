# Two-theme implementation

For Claude Code. Adds light and dark themes to the render service.

**The rule:** dark for anything showing the product, light for bold statement posts.

The approach is CSS custom properties. Blocks reference `var(--ink)` rather than a
hardcoded colour, and the composer sets the variable values per theme. That means a
block is written once and works in both themes, and changing a theme colour is one
line rather than eight files.

Three files change. Full contents given, since the changes are substantial.

---

## Why light needed rebuilding, not just inverting

The dark treatment looked more considered for three reasons, none of them darkness:

1. **Three elevation levels, not two.** Ground, panel, inset. The panel is lighter than
   the ground so it floats; the bubbles are darker than the panel so they sit inside it.
   The old light theme had ground and panel both pure white, so nothing read as elevated.
2. **Texture.** A faint grid, masked to fade toward one corner. Barely visible, but it
   stops the surface being a dead expanse.
3. **A soft radial lift** rather than a heavy blue gradient wash. The old wash was doing
   the job that depth should do.

Light now has all three. The elevation values are inverted but the relationships are
identical.

---

## 1. `src/tokens/drivertrack.js`

Replace the `color` block with a `themes` structure. Everything else in the file
(size, budget, shell, font, logo, shots, formats, voice, links) stays as it is.

### FIND the whole `color: { ... }` object and REPLACE with:

```js
  // Two themes. Blocks never read these directly: the composer emits them as CSS
  // custom properties and blocks reference var(--name). That way a block is written
  // once and renders correctly in both.
  //
  // Note the three elevation levels in each theme. On dark the panel is LIGHTER than
  // the ground and the inset is between; on light the panel is pure white and the
  // ground is tinted. Same relationship, inverted. Without it nothing reads as raised.
  themes: {
    light: {
      canvas: "#F4F6FA",      // ground, deliberately not pure white
      surfaceAlt: "#FFFFFF",  // panels, sit above the ground
      surface: "#F1F4F9",     // insets: bubbles, panel headers
      hairline: "#E4E8EF",
      ink: "#111113",
      inkMuted: "#3C3C43",
      inkSubtle: "#5A5A63",
      inkFaint: "#8A8A93",
      accent: "#2563EB",
      accentFill: "#2563EB",
      accentSoft: "#E4EDFD",
      onAccent: "#FFFFFF",
      success: "#15803D", successSoft: "#DCFCE7",
      warning: "#966405", warningSoft: "#FEF3C7",
      danger: "#B91C1C",  dangerSoft: "#FEE2E2",
      shadow: "rgba(17,25,45,0.06)",
      panelShadow: "rgba(17,25,45,0.10)",
      logo: "accent",
      field: "radial-gradient(1100px 700px at 85% 8%, #FFFFFF 0%, rgba(255,255,255,0) 60%)",
      gridOpacity: 0.5,
    },
    dark: {
      canvas: "#11151C",
      surfaceAlt: "#212833",  // panels
      surface: "#181D26",     // insets
      hairline: "#2C3441",
      ink: "#E9EDF3",
      inkMuted: "#9FA7B4",
      inkSubtle: "#88919F",
      inkFaint: "#6B7688",
      accent: "#3B82F6",      // lifted for contrast on dark
      accentFill: "#2563EB",  // button fills stay the brand blue
      accentSoft: "rgba(59,130,246,0.14)",
      onAccent: "#FFFFFF",
      success: "#4ADE80", successSoft: "rgba(74,222,128,0.14)",
      warning: "#EAB308", warningSoft: "rgba(234,179,8,0.14)",
      danger: "#F87171",  dangerSoft: "rgba(248,113,113,0.14)",
      shadow: "rgba(0,0,0,0.35)",
      panelShadow: "rgba(0,0,0,0.45)",
      logo: "white",
      field: "radial-gradient(1100px 700px at 85% 8%, #141E2E 0%, rgba(20,30,46,0) 62%)",
      gridOpacity: 0.35,
    },
  },

  // When to use which. This is a rule, not a preference: mixing them at random
  // undoes the recognition that consistent assets are supposed to build.
  themeRule: {
    dark: "Anything showing the product: screenshots, threads, screening decisions, pipelines.",
    light: "Bold statement posts: an opinion, an observation, a piece of advice with no product in it.",
  },
```

**Also update the logo block** so it can return either version:

```js
  logo: {
    base: process.env.ASSET_BASE || "",
    accent: "brand/dt-logo-mono-accent.svg.png",
    white: "brand/dt-logo-mono-white.svg.png",
    clearSpaceRatio: 1,
    url(which = "accent") {
      const path = which === "white" ? this.white : this.accent;
      return this.base ? `${this.base.replace(/\/$/, "")}/${path}` : path;
    },
  },
```

---

## 2. `src/blocks.js`

Every colour reference becomes a CSS variable. Mechanical change: `${c.ink}` becomes
`var(--ink)`, and so on.

**At the top of the file, replace:**

```js
const c = t.color;
```

**with:**

```js
// Blocks are theme-agnostic. Colours come from CSS custom properties that the
// composer sets per theme, so the same block code renders in light and dark.
const V = (name) => `var(--${name})`;
```

**Then replace every colour reference:**

| Was | Becomes |
|---|---|
| `${c.canvas}` | `var(--canvas)` |
| `${c.surface}` | `var(--surface)` |
| `${c.surfaceAlt}` | `var(--surfaceAlt)` |
| `${c.hairline}` | `var(--hairline)` |
| `${c.ink}` | `var(--ink)` |
| `${c.inkMuted}` | `var(--inkMuted)` |
| `${c.inkSubtle}` | `var(--inkSubtle)` |
| `${c.inkFaint}` | `var(--inkFaint)` |
| `${c.accent}` | `var(--accent)` |
| `${c.accentSoft}` | `var(--accentSoft)` |
| `${c.accentInk}` | `var(--onAccent)` |

**The shared card constant becomes:**

```js
const CARD = `background:var(--surfaceAlt);border:1px solid var(--hairline);
  border-radius:${t.radius.lg}px;box-shadow:0 14px 40px var(--shadow);`;
```

**The status maps become variable names rather than values**, since they are used
inline in style attributes:

```js
const statusInk = {
  pass: "var(--success)", fail: "var(--danger)", wait: "var(--warning)",
  neutral: "var(--inkSubtle)", accent: "var(--accent)", none: "var(--inkSubtle)",
};
const statusBg = {
  pass: "var(--successSoft)", fail: "var(--dangerSoft)", wait: "var(--warningSoft)",
  neutral: "var(--surface)", accent: "var(--accentSoft)", none: "var(--surface)",
};
```

**Add a new `thread` block** at the end, before `BLOCKS`. This is the SMS conversation
panel, which is the strongest product asset and currently only exists as a one-off:

```js
// thread: an SMS screening conversation, drawn natively rather than screenshotted.
// A screenshot of this shrunk into a graphic is illegible; drawn natively it reads
// at any size, stays on brand, and never goes stale when the app changes.
export function thread(d = {}) {
  const msgs = (d.messages || []).slice(0, 5);
  return {
    css: `
      .b-panel{background:var(--surfaceAlt);border:1px solid var(--hairline);
        border-radius:20px;overflow:hidden;box-shadow:0 24px 60px var(--panelShadow);}
      .b-prule{height:5px;background:var(--accent);}
      .b-phead{display:flex;align-items:center;gap:16px;padding:20px 24px;
        background:var(--surface);border-bottom:1px solid var(--hairline);}
      .b-picon{width:44px;height:44px;border-radius:10px;background:var(--accentSoft);
        display:flex;align-items:center;justify-content:center;flex:none;}
      .b-picon svg{width:24px;height:24px;stroke:var(--accent);}
      .b-ptitle{font-weight:${t.font.bold};font-size:36px;color:var(--ink);line-height:1.1;}
      .b-pmeta{font-weight:${t.font.regular};font-size:28px;color:var(--inkSubtle);margin-top:3px;}
      .b-pbody{padding:22px;display:flex;flex-direction:column;gap:14px;}
      .b-msg{font-weight:${t.font.regular};font-size:30px;line-height:1.3;
        padding:16px 20px;border-radius:16px;max-width:86%;}
      .b-msg.them{background:var(--surface);color:var(--inkMuted);
        align-self:flex-start;border-bottom-left-radius:6px;}
      .b-msg.them a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;}
      .b-msg.driver{background:var(--accentFill);color:var(--onAccent);
        align-self:flex-end;border-bottom-right-radius:6px;}
    `,
    html: `<div class="b-panel">
      <div class="b-prule"></div>
      <div class="b-phead">
        <div class="b-picon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg></div>
        <div>
          <div class="b-ptitle">${esc(d.title || "Automated screener")}</div>
          ${d.meta ? `<div class="b-pmeta">${esc(d.meta)}</div>` : ""}
        </div>
      </div>
      <div class="b-pbody">${msgs.map((m) => {
        const who = m.from === "driver" ? "driver" : "them";
        // the link is the only markup allowed through, so a URL can be styled
        const body = m.link
          ? `${esc(m.text)} <a>${esc(m.link)}</a>`
          : esc(m.text);
        return `<div class="b-msg ${who}">${body}</div>`;
      }).join("")}</div>
    </div>`,
  };
}
```

**Register it** in `BLOCKS` and add to `BLOCK_CATALOGUE`:

```js
export const BLOCKS = { body, rows, compare, stat, screenshot, points, quote, cta, thread };
```

```js
  { name: "thread",
    useWhen: "Showing a screening conversation. The strongest product asset there is: " +
      "it demonstrates rather than claims. Three to five messages, ending on the payoff " +
      "(a verdict or a booking link). Always pair with the dark theme.",
    shape: '{ "title": "Automated screener", "meta": "Dele O. · Apply form", "messages": [ { "from": "them", "text": "Q5 of 5: Can you do 9 hour routes over 5 days?" }, { "from": "driver", "text": "Yes, I can do Saturday or Sunday" }, { "from": "them", "text": "Pick an interview time that suits you:", "link": "drivertrack.co/book" } ] }' },
```

---

## 3. `src/compose.js`

The composer gains a theme, emits the variables, swaps the logo, draws the field and
grid, and supports one accent word in the headline.

### Replace the whole `compose` function with:

```js
export function compose(spec = {}) {
  const {
    theme = "light",
    eyebrow = "",
    headline = "",
    accentWord = "",   // one phrase in the headline rendered in the accent colour
    display = false,
    blocks = [],
  } = spec;

  const T = t.themes[theme] || t.themes.light;
  const w = t.shell.canvas;
  const h = t.shell.canvas;
  const m = t.shell.margin;

  // Emit every theme value as a CSS custom property. Blocks reference these, which
  // is what lets one set of block code render correctly in both themes.
  const vars = Object.entries(T)
    .filter(([k]) => !["logo", "field", "gridOpacity"].includes(k))
    .map(([k, v]) => `--${k}:${v};`)
    .join("");

  let list = Array.isArray(blocks) ? blocks.filter((b) => b && BLOCKS[b.type]) : [];
  const ctas = list.filter((b) => b.type === "cta");
  const rest = list.filter((b) => b.type !== "cta").slice(0, t.shell.maxBlocks);
  list = [...rest, ...ctas.slice(0, 1)];
  if (display) list = ctas.slice(0, 1);

  const built = list.map((b) => ({ ...BLOCKS[b.type](b), type: b.type }));
  const blockCss = built.map((b) => b.css).join("\n");
  const blockHtml = built.map((b) => `<div class="slot slot-${b.type}">${b.html}</div>`).join("");

  const headSize = display ? S.display : S.headline;
  const headMax = display ? "13ch" : "17ch";

  // One phrase in accent. Escape first, then wrap, so the markup cannot be injected.
  let headHtml = esc(headline);
  if (accentWord && headline.includes(accentWord)) {
    headHtml = headHtml.replace(esc(accentWord), `<em>${esc(accentWord)}</em>`);
  }

  const logoAspect = 1620 / 480;
  const logoW = Math.round(t.shell.logoHeight * logoAspect);
  const logoUrl = t.logo.url(T.logo);

  const css = `
    .stage{${vars}position:relative;width:${w}px;height:${h}px;background:var(--canvas);
      overflow:hidden;display:flex;flex-direction:column;}

    /* depth, not decoration: a soft lift plus a faint grid so the ground has texture */
    .field{position:absolute;inset:0;background:${T.field};}
    .grid{position:absolute;inset:0;opacity:${T.gridOpacity};
      background-image:linear-gradient(var(--hairline) 1px, transparent 1px),
                       linear-gradient(90deg, var(--hairline) 1px, transparent 1px);
      background-size:80px 80px;
      -webkit-mask-image:radial-gradient(900px 600px at 80% 10%, #000 0%, transparent 70%);}

    .logo{position:absolute;top:${m}px;right:${m}px;height:${t.shell.logoHeight}px;
      width:auto;z-index:5;}

    .head{position:relative;z-index:2;padding:${m}px ${m}px 0;display:flex;
      flex-direction:column;gap:${sp(3)};}
    .stage.statement .head{flex:1;padding-bottom:${m}px;gap:0;}
    .stage.statement .headline{margin:auto 0;}

    .eyebrow{display:flex;align-items:center;gap:${sp(2)};font-weight:${t.font.bold};
      font-size:${S.label}px;color:var(--inkSubtle);letter-spacing:0.08em;
      text-transform:uppercase;line-height:1;}
    .diamond{width:${t.shell.diamond}px;height:${t.shell.diamond}px;border-radius:4px;
      background:var(--accent);transform:rotate(45deg);flex:none;}
    .headline{font-weight:${t.font.extrabold};font-size:${headSize}px;line-height:1.06;
      letter-spacing:-0.028em;color:var(--ink);max-width:${headMax};}
    .headline em{font-style:normal;color:var(--accent);}
    .logospacer{float:right;width:${logoW + 40}px;
      height:${Math.max(0, t.shell.logoHeight - S.label - 20)}px;}

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
      <div class="grid"></div>
      ${logoUrl ? `<img class="logo" src="${logoUrl}">` : ""}
      <div class="head">
        ${eyebrow ? `<div class="eyebrow"><span class="diamond"></span>${esc(eyebrow)}</div>` : ""}
        ${headline ? `<div class="headline"><span class="logospacer"></span>${headHtml}</div>` : ""}
      </div>
      <div class="blocks${display ? " statement" : ""}">${blockHtml}</div>
    </div>`;

  return { html: buildDocument({ bodyHtml, css, width: w, height: h }), width: w, height: h };
}
```

**Note:** `compose.js` currently imports `const c = t.color;` near the top. Remove that
line, since colours now come from the theme.

---

## 4. `src/lib/planner.js`

The planner must choose the theme, and must know the rule. Two edits.

**In the JSON shape at the end of the prompt, add `theme` and `accentWord`:**

```
  {
    "theme": "dark",
    "eyebrow": "Peak hiring",
    "headline": "the main line",
    "accentWord": "one phrase from the headline to set in accent colour, or empty",
    "display": false,
    "blocks": [ ... ],
    ...
  }
```

**Add to HARD CONSTRAINTS:**

```
- Choose a theme. "dark" for anything showing the product: threads, screenshots,
  screening decisions, pipelines. "light" for bold statement posts: an opinion or a
  piece of advice with no product in it. This is a rule, not a preference. Mixing
  them at random undoes the recognition that consistent assets build.
- accentWord may pick out one short phrase from the headline, usually the payoff or
  the turn. Leave it empty rather than forcing one. Never more than one phrase.
```

**In the validation loop, carry them through:**

```js
      spec: {
        theme: p.theme === "dark" ? "dark" : "light",
        eyebrow: dashes(p.eyebrow),
        headline: dashes(p.headline),
        accentWord: dashes(p.accentWord || ""),
        display: Boolean(p.display),
        blocks,
      },
```

---

## Also worth updating

`DESIGN-SPEC.md` section 4, the locked shell, currently describes a single white
ground. It should now describe two themes and the rule. The type scale, margins,
logo size, accent discipline and block limit are all unchanged.

---

## Testing after the change

1. `GET /health` should still list templates.
2. Render one post in each theme with the same content and compare. They should feel
   like the same brand, not two brands.
3. Check the bubbles are visible on light. If they disappear, the three elevation
   levels have collapsed to two, which is the bug this whole approach exists to avoid.
4. Run a plan and confirm it picks dark for a thread post and light for a statement.

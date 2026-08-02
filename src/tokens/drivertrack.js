// DriverTrack design tokens
// Pulled from the live site at www.drivertrack.co (active theme), July 2026.
// Flat, high contrast, white ground with a single blue accent.
// These are the single source of truth. Templates never hardcode a colour or size.

export const drivertrack = {
  name: "DriverTrack",

  color: {
    // Core surfaces
    canvas: "#FFFFFF",       // dominant background, ~60%
    surface: "#FFFFFF",      // cards
    surfaceAlt: "#F5F5F6",   // tinted panels
    hairline: "#D1D5DB",     // dividers, borders
    // Ink
    ink: "#111113",          // headlines
    inkMuted: "#3C3C43",     // body
    inkSubtle: "#5A5A63",    // captions, labels
    inkFaint: "#8A8A93",     // timestamps, least important
    // Accent
    accent: "#2563EB",       // CTAs and one deliberate emphasis, ~10%
    accentSoft: "#DBEAFE",   // tint panels behind accent content
    accentInk: "#FFFFFF",    // text on accent
    // Near-black ground for the rare dark asset
    dark: "#0A0A0B",
    darkInk: "#E9EDF3",
    // Status, for pass/decline/callback screening states
    success: "#15803D",
    successSoft: "#DCFCE7",
    warning: "#966405",
    warningSoft: "#FEF3C7",
    danger: "#B91C1C",
    dangerSoft: "#FEE2E2",
  },


  // Voice and audience. Used by the copy generator so output sounds like the brand
  // rather than like generic SaaS marketing.
  // Fixed facts the copy generator must use rather than invent.
  links: {
    site: "drivertrack.co",
    demo: "drivertrack.co",
  },

  voice: {
    audience:
      "Owners and operations managers at UK Amazon Delivery Service Partners. Thin margins, " +
      "constant hiring, drivers lost to churn, judged on scorecard metrics. Time-poor and " +
      "sceptical of software sold by people who have never run a DSP.",
    register:
      "Peer to peer, operationally literate, unimpressed by hype. Use the actual language of " +
      "the job: routes, scorecard, callbacks, right to work, first day on road, peak. British " +
      "English. Plain verbs. No exclamation marks.",
    doThis: [
      "Lead with the benefit, use the feature as proof",
      "Be specific: numbers, days, times, places beat adjectives",
      "Short declarative sentences. One idea per sentence",
      "Speak to a single reader as 'you'",
    ],
    avoid: [
      "Hype words: unlock, elevate, revolutionise, seamless, game-changer, supercharge",
      "Any suggestion of Amazon endorsement or affiliation",
      "Naming or quoting a real customer",
      "Overstating the automated decision logic",
      "Em dashes and en dashes",
    ],
  },

  font: {
    family: "Inter",
    // Weights available as embedded files
    regular: 400,
    medium: 500,
    bold: 700,
    extrabold: 800,
    // Display headlines want tracking pulled in or Inter reads loose and generic
    displayTracking: "-0.02em",
    bodyTracking: "0",
    // Inter has tabular figures; use them for any stat so digits align
    tabularNums: '"tnum" 1',
  },

  // Type scale derived from ISO 9241-303 angular legibility at 350mm viewing
  // distance on a 1200px canvas. See DESIGN-SPEC.md section 2. These are FINAL
  // sizes on the canvas. There is no multiplier and no separate rendered size.
  size: {
    label: 40,      // 17.0 arc min. Tags and pills only.
    small: 46,      // 19.6 arc min.
    body: 54,       // 23.0 arc min. ISO recommended.
    subhead: 64,    // 27.3 arc min.
    headline: 92,   // 39.2 arc min. The scroll stopper.
    display: 132,   // 56.2 arc min. Statement mode.
    stat: 200,      // 85.2 arc min.
  },

  // Copy budgets. If it does not fit, cut the copy, never the type size.
  budget: {
    headline: 9,    // words
    display: 6,
    body: 18,
    small: 14,
  },

  // Locked shell geometry
  shell: {
    canvas: 1200,
    margin: 64,
    logoHeight: 100,   // 8% of canvas. Present, recognisable, subordinate.
    diamond: 20,       // the fluent device. Never moves, never resizes.
    maxBlocks: 2,      // 3 only if one is a cta. Attention limit, not taste.
  },

  space: (n) => `${n * 8}px`,

  radius: {
    sm: 8,
    md: 14,
    lg: 22,
    pill: 999,
  },

  // Logo clear space rule and asset paths.
  // ASSET_BASE is the public R2 URL base (set in Railway); logos live under it.
  logo: {
    base: process.env.ASSET_BASE || "",
    accent: "brand/dt-logo-mono-accent.svg.png", // for light backgrounds
    white: "brand/dt-logo-mono-white.svg.png",   // for dark backgrounds and photography
    clearSpaceRatio: 1, // clear space = height of the mark, all four sides
    url(which = "accent") {
      const path = which === "white" ? this.white : this.accent;
      return this.base ? `${this.base.replace(/\/$/, "")}/${path}` : path;
    },
  },

  // Product screenshots living in R2 under shots/. Framed with rounded corners and
  // a soft shadow on a transparent background, so they sit on any template ground.
  shots: {
    base: process.env.ASSET_BASE || "",
    available: ["pipeline", "conversation", "screen-pass", "screen-fail"],
    url(name) {
      return this.base ? `${this.base.replace(/\/$/, "")}/shots/${name}.png` : "";
    },
  },

  // Platform output sizes this brand renders to
  formats: {
    linkedin: { w: 1200, h: 627 },
    square: { w: 1200, h: 1200 },
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
  },
};

export default drivertrack;

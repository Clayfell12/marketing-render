// DriverTrack design tokens
// Pulled from the live site at www.drivertrack.co (active theme), July 2026.
// Flat, high contrast, a single blue accent, in a light and a dark theme.
// These are the single source of truth. Templates never hardcode a colour or size.

export const drivertrack = {
  name: "DriverTrack",

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

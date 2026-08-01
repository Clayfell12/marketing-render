// Revive! Barnsley design tokens
// From the Revive! franchise brand guidelines. These are authoritative.
// Do NOT sample colours from the website: it runs a link red (#DA2032) and greys
// (#737373, #474747) that are NOT brand colours.

export const revive = {
  name: "Revive! Barnsley",

  color: {
    // The palette is four colours. That is deliberate and it is the whole system.
    red: "#DD1133",        // Pantone 032. ACCENT ONLY, ~10%. Logo + CTA + one emphasis.
    grey: "#888888",       // Pantone 877. Captions, secondary lines, dividers.
    black: "#000000",      // Headlines and body.
    white: "#FFFFFF",      // Dominant ground, ~60%.

    // Semantic aliases so templates never reach for a raw colour name
    canvas: "#FFFFFF",
    surface: "#FFFFFF",
    ink: "#000000",
    inkMuted: "#888888",
    hairline: "#E4E4E4",   // derived tint of grey for dividers only
    accent: "#DD1133",
    accentInk: "#FFFFFF",
  },

  font: {
    family: "Fira Sans",
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    displayTracking: "-0.01em",
    bodyTracking: "0",
  },

  // Modular scale, base 16, ratio 1.25. Looser than DriverTrack because these
  // assets carry less information and need to read at a glance.
  size: {
    xs: 16,
    sm: 20,
    base: 25,
    md: 31,
    lg: 39,
    xl: 49,
    display: 61,
  },

  space: (n) => `${n * 8}px`,

  radius: {
    sm: 6,
    md: 12,
    lg: 20,
    pill: 999,
  },

  logo: {
    base: process.env.ASSET_BASE || "",
    primary: "brand/revive-logo.png",
    clearSpaceRatio: 1, // clear space = height of the mark, all four sides
    url(which = "primary") {
      const path = this.primary;
      return this.base ? `${this.base.replace(/\/$/, "")}/${path}` : path;
    },
  },

  // Revive renders portrait-first for feed, plus story and GBP
  formats: {
    portrait: { w: 1080, h: 1350 },
    square: { w: 1080, h: 1080 },
    story: { w: 1080, h: 1920 },
    gbp: { w: 1200, h: 900 },
  },

  // Design rules the templates must respect
  rules: {
    // Red does double duty as brand mark AND call to action, so it has to be
    // spent carefully. Large fields of red are off-brand and look cheap.
    accentUsage: "logo + CTA + at most one emphasis",
    // Match the livery: white van, red flashes, black text.
    ground: "white dominant, black type, red accent only",
  },
};

export default revive;

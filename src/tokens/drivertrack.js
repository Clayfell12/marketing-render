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

  // Modular scale, base 16, ratio 1.2 (tighter than Revive because B2B carries more info)
  size: {
    xs: 16,
    sm: 19,
    base: 23,
    md: 28,
    lg: 33,
    xl: 40,
    xxl: 48,
    display: 58,
  },

  // 8-point spacing system
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
    accent: "brand/dt-logo-mono-accent.svg", // for light backgrounds
    white: "brand/dt-logo-mono-white.svg",   // for dark backgrounds and photography
    clearSpaceRatio: 1, // clear space = height of the mark, all four sides
    url(which = "accent") {
      const path = which === "white" ? this.white : this.accent;
      return this.base ? `${this.base.replace(/\/$/, "")}/${path}` : path;
    },
  },

  // Platform output sizes this brand renders to
  formats: {
    linkedin: { w: 1200, h: 627 },
    square: { w: 1080, h: 1080 },
    portrait: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
  },
};

export default drivertrack;

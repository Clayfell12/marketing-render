// The brands the studio can produce work for.
// Used by the app for the brand switcher and its accent colour; the planner and
// the composer read the full token files under src/tokens/.

// Revive is deliberately absent. Its token file has no `budget` and no `themes`, so
// the planner throws and the composer would render it in DriverTrack blue regardless
// (compose.js and blocks.js both import the DriverTrack tokens directly). Offering it
// in the switcher meant the app served a brand that every path rejects. Put it back
// when src/tokens/revive.js has themes and budget, not before.
export const brands = {
  drivertrack: { label: "DriverTrack", accent: "#2563EB" },
};

export default brands;

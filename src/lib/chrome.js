// Shared chrome for DriverTrack templates.
// Keeps the visual system in one place: white ground, tinted gradient field in the
// lower frame, logo top right, accent pill CTA. Templates add their own signature
// on top of this rather than redefining the furniture each time.

export function baseCss(t, c, w, h, opts = {}) {
  const { fieldHeight = "54%", ctaPush = true } = opts;
  return `
    .stage{position:relative;width:${w}px;height:${h}px;background:${c.canvas};overflow:hidden;display:flex;flex-direction:column;}
    .field{position:absolute;left:0;right:0;bottom:0;height:${fieldHeight};z-index:0;
      background:linear-gradient(180deg, rgba(255,255,255,0) 0%, ${c.accentSoft} 38%, ${c.surfaceAlt} 100%);}
    .logo{position:absolute;top:${t.space(5)};right:${t.space(6)};height:78px;width:auto;z-index:5;}

    .top{position:relative;z-index:2;padding:${t.space(6)} ${t.space(6)} ${t.space(2)};
      display:flex;flex-direction:column;gap:${t.space(2)};}
    .eyebrow{display:flex;align-items:center;gap:12px;font-weight:${t.font.bold};font-size:18px;
      color:${c.inkSubtle};letter-spacing:0.08em;text-transform:uppercase;}
    .tick{width:13px;height:13px;border-radius:3px;background:${c.accent};transform:rotate(45deg);flex:none;}

    .cta{position:relative;z-index:2;margin:${ctaPush ? "auto" : "0"} ${t.space(6)} ${t.space(6)};align-self:flex-start;
      background:${c.accent};color:${c.accentInk};font-weight:${t.font.bold};font-size:22px;
      padding:20px 38px;border-radius:${t.radius.pill}px;}
  `;
}

export function logoTag(t) {
  const url = t.logo.url("accent");
  return url ? `<img class="logo" src="${url}" />` : "";
}

export function eyebrowTag(text) {
  return `<div class="eyebrow"><span class="tick"></span>${text}</div>`;
}

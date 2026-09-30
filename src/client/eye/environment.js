/**
 * A cold studio for the glass to reflect: a pale softbox high on one side, a
 * thin strip light low on the other, and a dark floor. Glass is mostly its
 * reflections, so these are brighter and harder-edged than an opaque rig
 * would want.
 */
export function buildEnvironment({ stage, GFX }) {
  try {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#dfe9f7'); g.addColorStop(0.4, '#4a586e');
    g.addColorStop(0.5, '#141a26'); g.addColorStop(1, '#050609');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.beginPath(); ctx.ellipse(38, 12, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,220,255,0.8)';
    ctx.fillRect(84, 26, 30, 3);
    ctx.fillStyle = 'rgba(120,170,255,0.35)';
    ctx.beginPath(); ctx.ellipse(100, 14, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    const tex = new GFX.Texture(c);
    tex.mapping = GFX.EquirectangularReflectionMapping;
    tex.colorSpace = GFX.SRGBColorSpace;
    tex.needsUpdate = true;
    const pmrem = new GFX.PMREMGenerator(stage._renderer);
    stage._scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
  } catch {
  }
}

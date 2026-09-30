/**
 * The iris, painted once onto a canvas: a blue that is pale and nearly
 * turquoise at the collarette, deepens outwards, and is ringed at the rim by
 * a dark limbal band. Radial fibres and a few crypts keep it from reading as
 * a flat disc of colour. The pupil is its own mesh, so the centre is left a
 * dark blue it can dilate over.
 *
 * `random` is injectable so the tests can paint it the same way twice.
 */
export const IRIS = Object.freeze({
  collarette: '#8fd3ff',
  mid: '#2f7fd6',
  outer: '#153f8f',
  limbus: '#071733',
  centre: '#0b1f3d',
});

/** Where the painted features sit, as fractions of the iris radius. */
export const RINGS = Object.freeze({ pupil: 0.3, collarette: 0.42, limbus: 0.86 });

export function paintIris(ctx, size, { random = Math.random } = {}) {
  const c = size / 2;
  const r = size / 2;

  ctx.clearRect(0, 0, size, size);

  const base = ctx.createRadialGradient(c, c, 0, c, c, r);
  base.addColorStop(0, IRIS.centre);
  base.addColorStop(RINGS.pupil, IRIS.centre);
  base.addColorStop(RINGS.collarette, IRIS.collarette);
  base.addColorStop(0.62, IRIS.mid);
  base.addColorStop(RINGS.limbus, IRIS.outer);
  base.addColorStop(0.95, IRIS.limbus);
  base.addColorStop(1, IRIS.limbus);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Fibres: thin spokes from the collarette out, some pale, some dark.
  const fibres = 420;
  ctx.lineCap = 'round';
  for (let i = 0; i < fibres; i++) {
    const a = (i / fibres) * Math.PI * 2 + random() * 0.02;
    const from = r * (RINGS.pupil + 0.02 + random() * 0.08);
    const to = r * (0.62 + random() * 0.26);
    const light = random() < 0.55;
    ctx.strokeStyle = light
      ? `rgba(190, 232, 255, ${0.08 + random() * 0.16})`
      : `rgba(6, 22, 60, ${0.1 + random() * 0.2})`;
    ctx.lineWidth = size * (0.0015 + random() * 0.0035);
    const bend = (random() - 0.5) * 0.08;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * from, c + Math.sin(a) * from);
    ctx.quadraticCurveTo(
      c + Math.cos(a + bend) * (from + to) / 2, c + Math.sin(a + bend) * (from + to) / 2,
      c + Math.cos(a) * to, c + Math.sin(a) * to,
    );
    ctx.stroke();
  }

  // The collarette: a ragged pale ring where the fibres gather.
  ctx.strokeStyle = 'rgba(200, 240, 255, 0.35)';
  ctx.lineWidth = size * 0.006;
  ctx.beginPath();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (RINGS.collarette + (i % 2 ? 0.018 : -0.012) + (random() - 0.5) * 0.02);
    const x = c + Math.cos(a) * rr;
    const y = c + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Crypts: small dark lozenges scattered through the mid-iris.
  for (let i = 0; i < 26; i++) {
    const a = random() * Math.PI * 2;
    const d = r * (0.47 + random() * 0.3);
    ctx.save();
    ctx.translate(c + Math.cos(a) * d, c + Math.sin(a) * d);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(5, 18, 48, ${0.25 + random() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * (0.008 + random() * 0.014), size * (0.004 + random() * 0.006), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The limbal ring, soft on its inner edge.
  const limbus = ctx.createRadialGradient(c, c, r * 0.8, c, c, r);
  limbus.addColorStop(0, 'rgba(7, 23, 51, 0)');
  limbus.addColorStop(0.7, 'rgba(7, 23, 51, 0.75)');
  limbus.addColorStop(1, 'rgba(4, 12, 28, 1)');
  ctx.fillStyle = limbus;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The painted iris as a texture, or null where there is no canvas (tests under Node). */
export function createIrisTexture(GFX, { size = 1024, random } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintIris(ctx, size, { random });
  const texture = new GFX.CanvasTexture(canvas);
  texture.colorSpace = GFX.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

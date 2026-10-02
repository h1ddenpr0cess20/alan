/**
 * What the glass reflects: a pale wash overhead fading to dark below, and
 * nothing else. Glass is mostly its reflections, so the wash is brighter than
 * an opaque rig would want — it is what gives the ball its body. There are no
 * lamps in it: up in the night there is nothing for one to be, and a softbox
 * or a strip light painted in shows on the glass as a bulb hanging in the sky.
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

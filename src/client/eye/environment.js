/** How wide the copy of the sky the glass reflects is, in texels: plenty for a ball this size. */
const WIDTH = 512;

/**
 * What the glass reflects: the night it hangs in (`sky.js`), sun and all,
 * shrunk to a size the prefilter takes in its stride. So the bottom of the
 * ball shows the cloud sea, the top the dark, and the glint high on it is the
 * sun's — the stage's key light is put where the sun is (`sunlight`), and
 * there is no lamp anywhere for the glass to show.
 *
 * `sky` is the painted canvas; without one there is nothing to reflect.
 */
export function buildEnvironment({ stage, GFX, sky }) {
  if (!sky) return;
  try {
    const c = document.createElement('canvas');
    c.width = WIDTH; c.height = WIDTH / 2;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // A sphere wraps a map round the other way to the way a reflection reads
    // one, so the copy is turned over to put everything where the backdrop has it.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sky, 0, 0, c.width, c.height);
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

/**
 * Light the eye the way the sky says it is lit: by the sun, straight
 * overhead. The stage's key is moved up there; its fill, a lamp low behind
 * with nothing in the sky to be, would only put a second glint on the glass,
 * so it goes out. The stage's soft wash stays: it puts no glint on anything.
 */
export function sunlight(stage) {
  if (stage._key) stage._key.position.set(0, stage._key.position.length(), 0);
  if (stage._fill) stage._fill.visible = false;
}

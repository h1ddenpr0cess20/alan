/**
 * The night Alan hangs in, painted once onto a canvas: stars over a sea of
 * cloud, seen from so high up that the horizon has dropped well below level.
 * The canvas is an equirectangular map — longitude across, latitude down —
 * wrapped round the inside of the backdrop sphere, so it is what is seen past
 * the eye and what the glass refracts, upside down, inside the ball.
 *
 * The clouds are noise on a level deck below, looked at in perspective: the
 * banks are big and soft underneath and crowd into a haze toward the horizon,
 * as a real cloud sea does. Through the gaps, far below, a few towns are
 * still lit, and their light warms the haze above them.
 *
 * Nothing is built out of stacked canvas gradients. The browser dithers each
 * one with the same fixed pattern, and a few hundred of them on top of one
 * another add up to a grid; the soft parts are worked out texel by texel
 * instead, and the long dark ramps are dithered with noise.
 *
 * `random` is injectable so the tests can paint it the same way twice.
 */
export const SKY = Object.freeze({
  zenith: '#010309',
  sky: '#050b18',
  low: '#0a1424',
  glow: '#1b2a40',
  haze: '#141f32',
  gap: '#05080f',
  abyss: '#020306',
  shade: '#09111e',
  lit: '#3a5072',
  milky: '#8ea5d6',
  core: '#c9c3b8',
  town: '#ffb36b',
});

/** How far the horizon has dropped below level, in radians. High enough up, the world falls away. */
export const HORIZON = -0.21;

/**
 * The angle down from the horizon, opened out so that the bottom of the sky
 * looks straight down onto the deck rather than at a ring round it.
 */
const OPEN = Math.PI / 2 / (Math.PI / 2 + HORIZON);

/** How far below the eye the clouds and the ground are, in the same units: only the ratio matters. */
const DECK = 1;
const GROUND = 5;

/** The clouds: how big the largest banks are, how much of the deck they cover, how soon they haze over. */
const BANK = 0.7;
const COVER = 0.42;
const FOG = 9;
const OCTAVES = 5;
const ROUGH = 0.56;

/** The way the moon is, round the horizon: the cloud tops facing it are the bright ones. */
const MOON = 0.9;

const STAR_COLOURS = ['#ffffff', '#ffffff', '#dfe9ff', '#c4d6ff', '#fff2dc', '#ffd9b0'];
const LAMP_COLOURS = ['#ffc47a', '#ffd9a3', '#ffb062', '#ffe6c2'];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = ([r, g, b], a) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The plain sky, horizon and dark below, from the zenith down: latitude → colour. */
const RAMP = [
  [Math.PI / 2, SKY.zenith],
  [0.7, SKY.sky],
  [HORIZON + 0.22, SKY.low],
  [HORIZON + 0.004, SKY.glow],
  [HORIZON - 0.02, SKY.haze],
  [HORIZON - 0.3, SKY.gap],
  [-Math.PI / 2, SKY.abyss],
].map(([lat, hex]) => [lat, rgb(hex)]);

/** The colour of the plain sky at a latitude, as 0–255 RGB, eased from one stop of the ramp to the next. */
export function skyColour(lat) {
  for (let i = 1; i < RAMP.length; i++) {
    const [to, low] = RAMP[i];
    if (lat < to && i < RAMP.length - 1) continue;
    const [from, high] = RAMP[i - 1];
    const t = smoothstep(to, from, lat);
    return low.map((v, c) => v + (high[c] - v) * t);
  }
  return RAMP[RAMP.length - 1][1];
}

/**
 * Smooth value noise on a 256-square lattice, from `random`. It repeats every
 * 256, so `LIFT` — a whole number of repeats — moves anything it is asked
 * about clear of zero without changing it, and the corners are found with a
 * truncation rather than a floor.
 */
const LIFT = 256 * 64;
function createNoise(random) {
  const values = new Float32Array(256);
  const perm = new Uint8Array(512);
  const order = [];
  for (let i = 0; i < 256; i++) {
    values[i] = random();
    order.push(i);
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255];
  return (x, y) => {
    x += LIFT;
    y += LIFT;
    const xi = x | 0;
    const yi = y | 0;
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const X = xi & 255;
    const Y = yi & 255;
    const a = values[perm[perm[X] + Y]];
    const b = values[perm[perm[X + 1] + Y]];
    const c = values[perm[perm[X] + Y + 1]];
    const d = values[perm[perm[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Half a level either way, for dithering: a table of it, so a texel costs a lookup rather than a draw. */
const JITTER = 4093;
function createJitter(random) {
  const table = new Float32Array(JITTER);
  for (let i = 0; i < JITTER; i++) table[i] = random() - 0.5;
  return table;
}

/** A few towns' worth of warm light on the horizon: how much, at a longitude. */
function createDomes(random) {
  const domes = Array.from({ length: 5 }, () => ({
    at: random() * Math.PI * 2,
    width: 0.12 + random() * 0.2,
    strength: 0.5 + random() * 0.5,
  }));
  return (lon) => {
    let sum = 0;
    for (const { at, width, strength } of domes) {
      const off = Math.atan2(Math.sin(lon - at), Math.cos(lon - at)) / width;
      sum += strength * Math.exp(-off * off);
    }
    return sum;
  };
}

/** The Milky Way's great circle, tilted up the sky: the pole it goes round, and two directions along it. */
function createBand(random) {
  const tilt = 0.75 + random() * 0.4;
  const spin = random() * Math.PI * 2;
  const pole = [Math.cos(tilt) * Math.cos(spin), Math.sin(tilt), Math.cos(tilt) * Math.sin(spin)];
  const flat = Math.hypot(pole[0], pole[2]);
  const a = [-pole[2] / flat, 0, pole[0] / flat];
  const b = [pole[1] * a[2] - pole[2] * a[1], pole[2] * a[0] - pole[0] * a[2], pole[0] * a[1] - pole[1] * a[0]];
  return { pole, a, b };
}

/**
 * The cloud sea as RGBA texels: `cols` round the full turn, `rows` down from
 * the horizon at `pitch` radians a row. Each texel looks down at the deck,
 * reads how much cloud is there — leaving out the detail finer than the texel
 * can hold, so the distance hazes instead of fizzing — and shades it: the
 * thick of a bank is its moonlit top, its thin edges are in shadow, the
 * further off it is the more it is haze, and nearest the horizon it takes on
 * the glow and any town's light.
 */
export function cloudTexels(data, cols, rows, { pitch, random = Math.random, domes = createDomes(random) }) {
  const noise = createNoise(random);
  const jitter = createJitter(random);
  const [sr, sg, sb] = rgb(SKY.shade);
  const [lr, lg, lb] = rgb(SKY.lit);
  const haze = rgb(SKY.haze);
  const glow = rgb(SKY.glow);
  const town = rgb(SKY.town);
  const turn = (Math.PI * 2) / cols;
  const cos = new Float32Array(cols);
  const sin = new Float32Array(cols);
  const moon = new Float32Array(cols);
  const warm = new Float32Array(cols);
  for (let i = 0; i < cols; i++) {
    const lon = (i + 0.5) * turn;
    cos[i] = Math.cos(lon);
    sin[i] = Math.sin(lon);
    moon[i] = 0.72 + 0.28 * Math.cos(lon - MOON);
    warm[i] = domes(lon);
  }
  // The octaves a row can hold, and how much each counts there.
  const freq = new Float32Array(OCTAVES);
  const weight = new Float32Array(OCTAVES);
  const shiftX = new Float32Array(OCTAVES);
  const shiftZ = new Float32Array(OCTAVES);
  let norm = 0;
  for (let o = 0, amp = 0.5; o < OCTAVES; o++, amp *= ROUGH) norm += amp;
  const samples = new Float32Array(cols + 1);

  for (let j = 0; j < rows; j++) {
    const below = (j + 0.5) * pitch;
    const d = DECK / Math.tan(Math.min(Math.PI / 2, below * OPEN));
    const footprint = Math.max(((d * d + DECK * DECK) / DECK) * pitch * OPEN, d * turn);
    let held = 0;
    let rest = 0;
    for (let o = 0, f = 1 / BANK, amp = 0.5; o < OCTAVES; o++, f *= 2.03, amp *= ROUGH) {
      const w = amp * (1 - smoothstep(0.3, 0.8, footprint * f));
      rest += (amp - w) * 0.5;
      if (w <= 0) continue;
      freq[held] = f;
      weight[held] = w / norm;
      shiftX[held] = o * 31.7;
      shiftZ[held] = -o * 17.3;
      held++;
    }
    rest /= norm;

    // What the whole row shares: how far into the haze it is, how near the
    // horizon's glow, and how much a town below would warm it.
    const fog = 1 - Math.exp(-d / FOG);
    const keep = 1 - fog * 0.92;
    const rim = Math.exp(-below / 0.05) * 0.8;
    const tint = 0.025 * Math.exp(-below / 0.08);
    const thin = Math.pow(fog, 1.6);
    const hr = haze[0] * fog * 0.92;
    const hg = haze[1] * fog * 0.92;
    const hb = haze[2] * fog * 0.92;
    // The finest octave the row holds is still several texels across, so the
    // deck is read every few columns and the rest are drawn in between.
    const step = held ? Math.max(1, Math.min(8, Math.floor(1 / (freq[held - 1] * d * turn * 3)))) : 8;
    for (let m = 0, i = 0; i < cols; m++, i += step) {
      const x = d * cos[i];
      const z = d * sin[i];
      let density = rest;
      for (let n = 0; n < held; n++) {
        density += weight[n] * noise(x * freq[n] + shiftX[n], z * freq[n] + shiftZ[n]);
      }
      samples[m] = density;
    }
    const last = Math.ceil(cols / step);
    samples[last] = samples[0];

    for (let i = 0; i < cols; i++) {
      const m = Math.floor(i / step);
      const t = (i - m * step) / step;
      const next = (m + 1) * step >= cols ? samples[last] : samples[m + 1];
      const density = samples[m] + (next - samples[m]) * t;
      const cover = smoothstep(COVER - 0.03, COVER + 0.08, density);
      const height = smoothstep(COVER, COVER + 0.22, density) * moon[i];
      const heat = warm[i] * tint;
      let r = (sr + (lr - sr) * height) * keep + hr;
      let g = (sg + (lg - sg) * height) * keep + hg;
      let b = (sb + (lb - sb) * height) * keep + hb;
      r += (glow[0] - r) * rim + town[0] * heat;
      g += (glow[1] - g) * rim + town[1] * heat;
      b += (glow[2] - b) * rim + town[2] * heat;
      const at = (j * cols + i) * 4;
      const e = jitter[(j * cols + i) % JITTER];
      data[at] = r + e;
      data[at + 1] = g + e;
      data[at + 2] = b + e;
      data[at + 3] = 255 * (cover + (1 - cover) * thin) * 0.97;
    }
  }
}

/**
 * Light added to the sky above the horizon, as RGB texels to be laid on with
 * `lighter`: the Milky Way, a band round a great circle tilted up the sky,
 * clumped and split by a dark lane; and over the towns, their glow.
 */
export function glowTexels(data, cols, rows, {
  pitch, random = Math.random, domes = createDomes(random), band: { pole } = createBand(random),
}) {
  const noise = createNoise(random);
  const jitter = createJitter(random);
  const milky = rgb(SKY.milky);
  const core = rgb(SKY.core);
  const town = rgb(SKY.town);
  const turn = (Math.PI * 2) / cols;
  const cos = new Float32Array(cols);
  const sin = new Float32Array(cols);
  const warm = new Float32Array(cols);
  for (let i = 0; i < cols; i++) {
    const lon = (i + 0.5) * turn;
    cos[i] = Math.cos(lon);
    sin[i] = Math.sin(lon);
    warm[i] = domes(lon);
  }

  for (let j = 0; j < rows; j++) {
    const lat = Math.PI / 2 - (j + 0.5) * pitch;
    const up = lat - HORIZON;
    if (up <= 0) continue;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const clear = smoothstep(0, 0.35, up);
    const dome = 6 * Math.exp(-up / 0.05);
    for (let i = 0; i < cols; i++) {
      const x = cl * cos[i];
      const z = cl * sin[i];
      // How far off the band's circle, and — for the clumps — where on the sky,
      // flattened from below so the noise has no seam.
      const off = x * pole[0] + sl * pole[1] + z * pole[2];
      const across = off / 0.15;
      const glow = Math.exp(-across * across) * clear;
      let r = 0;
      let g = 0;
      let b = 0;
      if (glow > 0.01) {
        const px = (x / (1 + sl)) * 12;
        const pz = (z / (1 + sl)) * 12;
        const clump = noise(px, pz) * 0.5 + noise(px * 2.1 + 5, pz * 2.1) * 0.3 + noise(px * 4.3, pz * 4.3 + 9) * 0.2;
        const lane = Math.exp(-(((off - (clump - 0.5) * 0.1) / 0.04) ** 2));
        const light = glow * clump * clump * (1 - 0.45 * lane) * 34 / 255;
        const heart = Math.exp(-across * across * 4);
        r = light * (milky[0] + (core[0] - milky[0]) * heart);
        g = light * (milky[1] + (core[1] - milky[1]) * heart);
        b = light * (milky[2] + (core[2] - milky[2]) * heart);
      }
      const w = (warm[i] * dome) / 255;
      const at = (j * cols + i) * 4;
      data[at + 3] = 255;
      if (glow <= 0.01 && w < 0.0005) continue;
      const e = jitter[(j * cols + i) % JITTER];
      data[at] = r + town[0] * w + e;
      data[at + 1] = g + town[1] * w + e;
      data[at + 2] = b + town[2] * w + e;
    }
  }
}

/**
 * The whole night onto `ctx`. `layer(w, h)` makes the scratch canvases the
 * soft parts are worked out on, at a fraction of the size, before they are
 * laid over the rest — and the tile of grain the whole is dithered with.
 * Without it, those are left out.
 */
export function paintSky(ctx, width, height, { random = Math.random, layer = null } = {}) {
  /** Texels per radian, up the canvas and round it at the equator alike. */
  const k = height / Math.PI;
  const yAt = (lat) => (Math.PI / 2 - lat) * k;
  const xAt = (lon) => ((((lon / (Math.PI * 2)) % 1) + 1) % 1) * width;
  const horizon = yAt(HORIZON);
  const domes = createDomes(random);
  const band = createBand(random);

  /** Work something out texel by texel on a scratch canvas, and lay it over the sky. */
  function overlay(texels, scale, top, rows, mode) {
    const canvas = layer?.(Math.round(width / scale), rows);
    const scratch = canvas?.getContext('2d');
    if (!scratch) return;
    const image = scratch.createImageData(canvas.width, canvas.height);
    texels(image.data, canvas.width, canvas.height, { pitch: scale / k, random, domes, band });
    scratch.putImageData(image, 0, 0);
    ctx.globalCompositeOperation = mode;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, top, width, canvas.height * scale);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A point of light, `rx` by `ry` texels, drawn twice where it crosses the seam. */
  function speck(x, y, rx, ry, colour, alpha) {
    ctx.fillStyle = rgba(colour, alpha);
    for (const at of x - rx < 0 ? [x, x + width] : x + rx > width ? [x, x - width] : [x]) {
      if (rx < 1.1 && ry < 1.1) {
        ctx.fillRect(at - rx, y - ry, rx * 2, ry * 2);
      } else {
        ctx.beginPath();
        ctx.ellipse(at, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // The plain sky, a row at a time: the ramp from the zenith through the glow
  // at the horizon to the dark the clouds float over.
  for (let y = 0; y < height; y++) {
    ctx.fillStyle = rgba(skyColour(Math.PI / 2 - (y + 0.5) / k), 1);
    ctx.fillRect(0, y, width, 1);
  }

  // Towns, far below the clouds: seen only through the gaps. Laid out on a
  // jittered grid, so there are some near as well as far.
  const lamps = LAMP_COLOURS.map(rgb);
  const spacing = 8;
  for (let gx = -12; gx < 12; gx++) {
    for (let gz = -12; gz < 12; gz++) {
      if (random() > 0.4) continue;
      const cx = (gx + random()) * spacing;
      const cz = (gz + random()) * spacing;
      const d = Math.hypot(cx, cz);
      if (d < 1 || d > 90) continue;
      const fade = Math.exp(-d / 40);
      const size = 0.4 + random() * 1.4;
      const count = Math.round(size * size * 10 + 4);
      for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2;
        const r = size * Math.sqrt(random());
        const lx = cx + Math.cos(a) * r;
        const lz = cz + Math.sin(a) * r;
        const s = 0.35 + random() * 0.45;
        speck(xAt(Math.atan2(lz, lx)), yAt(HORIZON - Math.atan2(GROUND, Math.hypot(lx, lz)) / OPEN), s, s,
          lamps[Math.floor(random() * lamps.length)], (0.3 + random() * 0.6) * (0.3 + 0.7 * fade));
      }
    }
  }

  // The cloud sea, at half size, over the towns; the Milky Way and the glow of
  // the towns on the horizon, at a quarter, added to the sky.
  overlay(cloudTexels, 2, horizon, Math.ceil((height - horizon) / 2), 'source-over');
  overlay(glowTexels, 4, 0, Math.ceil(horizon / 4), 'lighter');

  // The stars, thinning and dimming toward the horizon as the air thickens,
  // and crowding along the band.
  const stars = STAR_COLOURS.map(rgb);
  const star = (lat, lon) => {
    const clear = smoothstep(HORIZON, HORIZON + 0.3, lat);
    if (lat < HORIZON || random() > 0.2 + 0.8 * clear) return;
    const m = Math.pow(random(), 4);
    const r = 0.4 + m * 1.3;
    const colour = stars[Math.floor(random() * stars.length)];
    const alpha = (0.2 + 0.8 * m) * (0.3 + 0.7 * clear);
    const x = xAt(lon);
    const y = yAt(lat);
    const stretch = 1 / Math.max(0.05, Math.cos(lat));
    if (m > 0.45) speck(x, y, r * 2.6 * stretch, r * 2.6, colour, alpha * 0.12);
    speck(x, y, r * stretch, r, colour, alpha);
  };
  const lowest = Math.sin(HORIZON);
  for (let i = 0; i < 6000; i++) star(Math.asin(lowest + (1 - lowest) * random()), random() * Math.PI * 2);
  for (let i = 0; i < 4000; i++) {
    const t = random() * Math.PI * 2;
    const off = (random() + random() + random() - 1.5) * 0.09;
    const [x, y, z] = [0, 1, 2].map((c) => band.a[c] * Math.cos(t) + band.b[c] * Math.sin(t) + band.pole[c] * off);
    star(Math.asin(y / Math.hypot(x, y, z)), Math.atan2(z, x));
  }

  // A whisper of grain over all of it, so the long dark ramps dither instead
  // of stepping into bands.
  const tile = layer?.(128, 128);
  const t = tile?.getContext('2d');
  if (t) {
    const image = t.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.floor(random() * 3);
      image.data[i + 3] = 255;
    }
    t.putImageData(image, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** The painted sky as a texture, or null where there is no canvas (tests under Node). */
export function createSkyTexture(GFX, { width = 4096, random = Math.random } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = makeCanvas(width, width / 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintSky(ctx, canvas.width, canvas.height, { random, layer: makeCanvas });
  const texture = new GFX.CanvasTexture(canvas);
  texture.colorSpace = GFX.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

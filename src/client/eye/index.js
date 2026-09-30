import { createAttention } from './attention.js';
import { buildEnvironment } from './environment.js';
import { anglesOf, pointerOffset } from './gaze.js';
import { createBackdrop, createEye, RADIUS } from './model.js';
import { ENERGY_GAIN, GLOW_MAX, MOODS } from './moods.js';
import { approach, spring } from './motion.js';

/** How high it floats over its own shadow, in radii. */
export const FLOAT = 0.6;

/** How far in front of the eye the pointer's plane sits, in radii (see `pointerOffset`). */
const REACH = 2.2;

/**
 * Spring stiffness per kind of eye movement. A saccade is a jump — over in a
 * few frames, with the slightest overshoot — pursuit is following something
 * that moves, a pan is the survey's slow sweep.
 */
export const STIFFNESS = Object.freeze({ saccade: 900, roll: 420, pan: 260, pursuit: 120 });

/** A pursuit target further off than this is jumped to, not followed. */
const SACCADE_JUMP = 0.3;

/** The springs are stepped at no less than this, so a stiff one stays stable on a slow frame. */
const STEP = 1 / 120;

/**
 * How far back the camera sits, in radii over the tangent of the narrower half
 * field of view. The stage frames by the vertical one — right for a tall character,
 * but a ball on a phone held upright would fill the screen edge to edge — so
 * the eye refits whenever the shape of the view changes. On a landscape screen
 * this is the stage's own framing, to the digit.
 */
const FRAMING = Math.sqrt(3) * 1.35;

function stepSpring(s, k, dt, to, damping = 1) {
  const c = 2 * Math.sqrt(k) * damping;
  const steps = Math.max(1, Math.ceil(dt / STEP));
  for (let i = 0; i < steps; i++) spring(s, k, c, dt / steps, to);
}

function radialTexture(GFX, stops) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, alpha] of stops) grd.addColorStop(at, `rgba(255,255,255,${alpha})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new GFX.CanvasTexture(c);
  t.colorSpace = GFX.SRGBColorSpace;
  return t;
}

/**
 * Alan: a glass eye that follows the pointer, and watches the room when
 * nobody is pointing. The conversational state (`setState`) and the level of
 * whoever is talking (`setLevel`, `pulse`) drive the pupil, the glow of the
 * iris and the float; `attention.js` decides where it looks.
 *
 * `events` is where pointer movement is listened for — the window, unless a
 * test hands in something else.
 */
export function createAlan({ stage, GFX, random = Math.random, events = globalThis }) {
  buildEnvironment({ stage, GFX });

  const R = RADIUS;
  const { eye, glass, pupil, irisMaterial } = createEye(GFX, { random });

  const alan = new GFX.Group();
  alan.name = 'alan';
  const tumble = new GFX.Group();
  tumble.name = 'tumble';
  const gaze = new GFX.Group();
  gaze.name = 'gaze';
  gaze.rotation.order = 'YXZ';
  alan.add(tumble);
  tumble.add(gaze);
  gaze.add(eye);

  const attention = createAttention({ random });

  let state = 'idle';
  let mood = MOODS.idle;
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let flare = 0;

  const yaw = { p: 0, v: 0 };
  const pitch = { p: 0, v: 0 };
  const iris = { p: MOODS.idle.pupil, v: 0 };
  const jolt = { p: 0, v: 0 };

  let t = 0;
  let lastMove = -Infinity;
  let halo = null;
  let fitted = null;
  const timer = new GFX.Timer();

  /** The pointer, in client pixels. `moved` is picked up by the next frame. */
  const pointer = { x: 0, y: 0, moved: false, seen: false, inside: false };
  const onMove = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.moved = true;
    pointer.seen = true;
    pointer.inside = true;
  };
  const onOut = (e) => {
    if (!e.relatedTarget) pointer.inside = false;
  };
  events.addEventListener?.('pointermove', onMove, { passive: true });
  events.addEventListener?.('pointerdown', onMove, { passive: true });
  events.addEventListener?.('pointerout', onOut, { passive: true });

  const ray = new GFX.Raycaster();
  const ndc = new GFX.Vector2();
  const toCamera = new GFX.Vector3();
  const axis = new GFX.Vector3();
  const side = new GFX.Vector3();
  const up = new GFX.Vector3(0, 1, 0);

  function pointerGaze(camera) {
    if (!pointer.seen || !pointer.inside) return null;
    const canvas = stage._renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return null;
    ndc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return pointerOffset({ ray: ray.ray, eye: alan.position, toCamera, reach: REACH * R });
  }

  /** Back the camera off, along the way it already faces, until the eye fits across as well as up. */
  function refit(camera) {
    const target = stage._controls?.target ?? new GFX.Vector3();
    const half = (camera.fov * Math.PI) / 360;
    const narrower = Math.min(half, Math.atan(Math.tan(half) * camera.aspect));
    const distance = (FRAMING * R) / Math.tan(narrower);
    const away = camera.position.clone().sub(target);
    if (away.lengthSq() === 0) away.set(0, 0, 1);
    camera.position.copy(target).add(away.normalize().multiplyScalar(distance));
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
  }

  function frame(dt) {
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    energy = approach(energy, Math.min(1, sustain + impulse), 6, dt);
    flare = approach(flare, 0, 4, dt);
    for (const k in m) m[k] = approach(m[k], mood[k], 3, dt);

    const camera = stage._camera;
    if (camera && camera.aspect !== fitted) {
      fitted = camera.aspect;
      refit(camera);
    }
    if (camera) toCamera.copy(camera.position).sub(alan.position).normalize();
    else toCamera.set(0, 0, 1);
    const home = anglesOf(toCamera);

    if (pointer.moved) {
      pointer.moved = false;
      lastMove = t;
    }
    const look = attention.update(dt, {
      state,
      pointer: camera ? pointerGaze(camera) : null,
      pointerAge: t - lastMove,
    });

    let k = STIFFNESS[look.speed] ?? STIFFNESS.pursuit;
    if (look.speed === 'pursuit'
      && (Math.abs(look.yaw - yaw.p) > SACCADE_JUMP || Math.abs(look.pitch - pitch.p) > SACCADE_JUMP)) {
      k = STIFFNESS.saccade;
    }
    stepSpring(yaw, k, dt, look.yaw, 0.92);
    stepSpring(pitch, k, dt, look.pitch, 0.92);

    // The tremor every eye has, and a touch more while talking.
    const tremor = 0.0025 + energy * 0.004;
    gaze.rotation.set(
      -(home.pitch + pitch.p) + (random() - 0.5) * tremor,
      home.yaw + yaw.p + (random() - 0.5) * tremor,
      0,
    );

    // A tumble turns the whole ball over in the air, drifting a little sideways as it goes.
    let driftX = 0;
    let driftZ = 0;
    if (look.gesture?.kind === 'tumble') {
      axis.set(look.gesture.axis.x, look.gesture.axis.y, look.gesture.axis.z);
      tumble.quaternion.setFromAxisAngle(axis, look.gesture.angle);
      side.crossVectors(axis, up).normalize().multiplyScalar(0.35 * R * look.gesture.drift);
      driftX = side.x;
      driftZ = side.z;
    } else {
      tumble.quaternion.set(0, 0, 0, 1);
    }

    stepSpring(jolt, 160, dt, 0, 0.5);
    const bob = Math.sin(t * 1.15) * (m.bob + energy * ENERGY_GAIN.bob) + jolt.p;
    const lean = m.lean * R;
    alan.position.set(
      Math.sin(t * 0.37) * m.drift * R + toCamera.x * lean + driftX,
      (m.hover + bob) * R,
      Math.sin(t * 0.29 + 1.3) * m.drift * R * 0.6 + toCamera.z * lean + driftZ,
    );

    // The pupil: the mood's size, the slow unrest a living one has (hippus),
    // and a kick on each burst of speech.
    const hippus = Math.sin(t * 1.7) * 0.01 + Math.sin(t * 0.63) * 0.008;
    stepSpring(iris, 70, dt, m.pupil + hippus + energy * ENERGY_GAIN.pupil, 0.8);
    pupil.scale.setScalar(Math.max(0.12, Math.min(0.6, iris.p)));

    const thinking = state === 'thinking' ? 0.08 * (0.5 + 0.5 * Math.sin(t * 6.5)) : 0;
    const glow = m.glow + energy * ENERGY_GAIN.glow + flare + thinking;
    irisMaterial.emissiveIntensity = Math.min(GLOW_MAX, glow);
    if (halo) halo.material.opacity = Math.min(0.9, 0.08 + glow * 0.9);
  }

  glass.onBeforeRender = () => {
    timer.update();
    frame(Math.min(timer.getDelta(), 0.05));
  };

  stage.setObject(alan);

  // Everything below is added after the stage has framed the eye, so none of
  // it counts toward the framing: the float, the room, the aura.
  if (stage._ground) stage._ground.position.y = -R * (1 + FLOAT);
  if (stage._scene?.add) {
    stage._scene.add(createBackdrop(GFX));
    const map = radialTexture(GFX, [[0, 0], [0.34, 0], [0.4, 0.5], [0.55, 0.16], [0.8, 0.03], [1, 0]]);
    if (map) {
      halo = new GFX.Sprite(new GFX.SpriteMaterial({
        map, color: new GFX.Color('#4aa8ff'), transparent: true, blending: GFX.AdditiveBlending,
        depthWrite: false, opacity: 0.1,
      }));
      halo.name = 'aura';
      halo.scale.setScalar(R * 3.6);
      alan.add(halo);
    }
  }

  return {
    get state() { return state; },
    get mode() { return attention.mode; },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      mood = MOODS[next];
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    pulse(weight = 0.3) {
      const w = Math.min(1, Math.max(0, weight));
      impulse = Math.min(1, impulse + w);
      flare = Math.min(0.4, flare + w * 0.2);
      iris.v -= w * 0.8;
      jolt.v += w * 0.25;
    },

    /** Roll the eye, or tumble over — the idle gestures, on demand. */
    perform(kind) {
      if (kind === 'roll' || kind === 'tumble') attention.perform(kind);
    },

    /** Run the rig forward without a renderer: for tests, and nothing else. */
    step(dt) { frame(dt); },

    dispose() {
      events.removeEventListener?.('pointermove', onMove);
      events.removeEventListener?.('pointerdown', onMove);
      events.removeEventListener?.('pointerout', onOut);
    },
  };
}

/**
 * Where Alan is looking, decided a frame at a time. It hands back a gaze
 * offset from the viewer (see `gaze.js`), how fast to get there, and any
 * whole-body gesture in progress; the rig does the moving.
 *
 *   track   the pointer moved recently: follow it
 *   survey  idle and nobody pointing: sweep the room like a security camera —
 *           slow pans with a pause at each end, a dart at something now and
 *           then, a look back at you
 *   regard  listening or speaking with no pointer: hold the viewer, with the
 *           small jumps a real eye makes between two points on a face
 *   scan    thinking: rapid looks all round, as if reading everything at once
 *
 * Every so often, idle or thinking, it rolls its eye (the gaze traces a full
 * circle) or tumbles (the whole ball turns over once in the air).
 *
 * `random` is injectable, so a test can run the same afternoon twice.
 */

/** How long a pointer that has stopped keeps the eye on it, in seconds. */
export const TRACK_HOLD = 3;

/** The widest it turns from the viewer, in radians. */
export const LIMIT = Object.freeze({ yaw: 1.1, pitch: 0.7 });

/** A survey pan's speed, in radians a second — a security camera's, not an eye's. */
export const PAN_SPEED = 0.55;

export const ROLL = Object.freeze({ radius: 0.72, duration: 1.5 });
export const TUMBLE = Object.freeze({ duration: 1.9 });

/** Seconds between gestures while idle, and while thinking. */
export const IDLE_GESTURES = Object.freeze([14, 30]);
export const THINK_GESTURES = Object.freeze([3, 6]);

export const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export function modeFor(state, tracking) {
  if (state === 'thinking') return 'scan';
  if (tracking) return 'track';
  return state === 'idle' ? 'survey' : 'regard';
}

export function createAttention({ random = Math.random } = {}) {
  const between = (a, b) => a + (b - a) * random();

  let t = 0;
  let mode = null;
  let look = { yaw: 0, pitch: 0 };
  let speed = 'saccade';
  let next = 0;
  let side = random() < 0.5 ? -1 : 1;
  let pan = null;
  let gesture = null;
  let gestureAt = between(...IDLE_GESTURES) * 0.5;

  const anywhere = () => ({
    yaw: between(-LIMIT.yaw, LIMIT.yaw),
    pitch: between(-LIMIT.pitch * 0.7, LIMIT.pitch),
  });

  function begin(kind) {
    gesture = {
      kind,
      start: t,
      duration: kind === 'roll' ? ROLL.duration : TUMBLE.duration,
      dir: random() < 0.5 ? -1 : 1,
      // Tumbles turn about a mostly horizontal axis, so the ball goes over
      // rather than spinning like a top.
      axis: (() => {
        const a = random() * Math.PI * 2;
        const x = Math.cos(a), z = Math.sin(a), y = (random() - 0.5) * 0.4;
        const n = Math.hypot(x, y, z);
        return { x: x / n, y: y / n, z: z / n };
      })(),
    };
  }

  function gestureFrame() {
    const p = Math.min(1, (t - gesture.start) / gesture.duration);
    if (gesture.kind === 'roll') {
      const envelope = Math.min(1, p / 0.12, (1 - p) / 0.12);
      const theta = Math.PI / 2 + gesture.dir * Math.PI * 2 * easeInOut(p);
      const r = ROLL.radius * Math.max(0, envelope);
      return {
        yaw: r * Math.cos(theta), pitch: r * Math.sin(theta), speed: 'roll', mode,
        gesture: { kind: 'roll', progress: p },
      };
    }
    return {
      yaw: look.yaw, pitch: look.pitch, speed: 'pursuit', mode,
      gesture: {
        kind: 'tumble', progress: p, axis: gesture.axis,
        angle: gesture.dir * Math.PI * 2 * easeInOut(p),
        drift: Math.sin(Math.PI * p),
      },
    };
  }

  function survey(dt) {
    if (pan) {
      const step = PAN_SPEED * dt;
      const dy = pan.yaw - look.yaw;
      const dp = pan.pitch - look.pitch;
      look = {
        yaw: look.yaw + Math.max(-step, Math.min(step, dy)),
        pitch: look.pitch + Math.max(-step * 0.6, Math.min(step * 0.6, dp)),
      };
      speed = 'pan';
      if (Math.abs(pan.yaw - look.yaw) < 1e-4 && Math.abs(pan.pitch - look.pitch) < 1e-4) {
        pan = null;
        next = t + between(0.8, 2.2);
      }
      return;
    }
    if (t < next) return;
    const r = random();
    if (r < 0.18) {
      // Something moved over there.
      look = anywhere();
      speed = 'saccade';
      next = t + between(0.35, 0.9);
    } else if (r < 0.32) {
      // And back to you. It always comes back to you.
      look = { yaw: 0, pitch: 0 };
      speed = 'saccade';
      next = t + between(1, 2.2);
    } else {
      side = -side;
      pan = { yaw: side * between(0.5, LIMIT.yaw), pitch: between(-0.28, 0.32) };
    }
  }

  function regard(state) {
    if (t < next) return;
    const r = state === 'speaking' ? 0.09 : 0.05;
    speed = 'saccade';
    if (state === 'speaking' && random() < 0.12) {
      // A god looks away when pronouncing, now and then.
      look = { yaw: between(-0.6, 0.6), pitch: between(0.05, 0.4) };
      next = t + between(0.5, 1);
      return;
    }
    look = { yaw: between(-r, r), pitch: between(-r * 0.6, r * 0.6) };
    next = t + between(0.5, 1.6);
  }

  function scan() {
    if (t < next) return;
    look = anywhere();
    speed = 'saccade';
    next = t + between(0.16, 0.42);
  }

  return {
    get mode() { return mode; },
    get gesture() { return gesture?.kind ?? null; },

    /** Start a gesture now, whatever else is going on: 'roll' or 'tumble'. */
    perform(kind) { begin(kind); },

    /**
     * One frame. `pointer` is the pointer's gaze offset, or null when there
     * is none; `pointerAge` is seconds since it last moved.
     */
    update(dt, { state = 'idle', pointer = null, pointerAge = Infinity } = {}) {
      t += dt;

      if (gesture) {
        if (t - gesture.start < gesture.duration) return gestureFrame();
        gesture = null;
        next = t;
      }

      const tracking = pointer !== null && pointerAge < TRACK_HOLD && state !== 'thinking';
      const now = modeFor(state, tracking);
      if (now !== mode) {
        mode = now;
        pan = null;
        next = t;
        if (mode === 'scan') gestureAt = t + between(...THINK_GESTURES);
        if (mode === 'survey') gestureAt = Math.max(gestureAt, t + between(...IDLE_GESTURES) * 0.5);
      }

      if (mode === 'track') {
        look = {
          yaw: Math.max(-LIMIT.yaw, Math.min(LIMIT.yaw, pointer.yaw)),
          pitch: Math.max(-LIMIT.pitch, Math.min(LIMIT.pitch, pointer.pitch)),
        };
        speed = 'pursuit';
      } else if (mode === 'survey') {
        survey(dt);
      } else if (mode === 'regard') {
        regard(state);
      } else {
        scan();
      }

      if ((mode === 'survey' || mode === 'scan') && t >= gestureAt) {
        const range = mode === 'scan' ? THINK_GESTURES : IDLE_GESTURES;
        gestureAt = t + between(...range);
        if (mode === 'survey' || random() < 0.5) {
          begin(random() < 0.6 ? 'roll' : 'tumble');
          return gestureFrame();
        }
      }

      return { yaw: look.yaw, pitch: look.pitch, speed, mode, gesture: null };
    },
  };
}

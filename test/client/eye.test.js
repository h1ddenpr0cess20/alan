import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as GFX from '../../src/client/vendor/gfx/index.js';

import {
  IDLE_GESTURES, LIMIT, PAN_SPEED, ROLL, TRACK_HOLD, TUMBLE, createAttention, easeInOut, modeFor,
} from '../../src/client/eye/attention.js';
import { anglesOf, clampOffset, offsetFrom, pointerOffset, wrap } from '../../src/client/eye/gaze.js';
import { PAN, SKY_DRIFT, ZOOM, createAlan } from '../../src/client/eye/index.js';
import { IRIS, RINGS, paintIris } from '../../src/client/eye/iris.js';
import { IRIS_DEPTH, IRIS_RADIUS, RADIUS } from '../../src/client/eye/model.js';
import { ENERGY_GAIN, GLOW_MAX, MOODS } from '../../src/client/eye/moods.js';
import { HORIZON, SKY, cloudTexels, glowTexels, paintSky, skyColour } from '../../src/client/eye/sky.js';

/** A seeded generator, so a behaviour test runs the same way every time. */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const DT = 1 / 60;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('MOODS', () => {
  const CHANNELS = ['bob', 'drift', 'glow', 'hover', 'lean', 'pupil'];

  it('covers the four conversational states, with every channel', () => {
    assert.deepEqual(Object.keys(MOODS).sort(), ['idle', 'listening', 'speaking', 'thinking']);
    for (const [name, mood] of Object.entries(MOODS)) {
      assert.deepEqual(Object.keys(mood).sort(), CHANNELS, `${name} is missing a channel`);
      for (const value of Object.values(mood)) assert.ok(Number.isFinite(value));
    }
  });

  it('dilates to listen and narrows to think', () => {
    assert.ok(MOODS.listening.pupil > MOODS.idle.pupil);
    assert.ok(MOODS.thinking.pupil < MOODS.idle.pupil);
  });

  it('keeps the pupil inside the painted iris, even at its widest', () => {
    const widest = Math.max(...Object.values(MOODS).map((m) => m.pupil)) + ENERGY_GAIN.pupil;
    assert.ok(widest < RINGS.limbus, 'the pupil would cover the limbal ring');
  });

  it('comes toward you to listen, and draws back to think', () => {
    assert.ok(MOODS.listening.lean > 0);
    assert.ok(MOODS.thinking.lean < 0);
  });

  it('caps the glow below what washes the iris flat', () => {
    assert.ok(GLOW_MAX < 1);
    for (const mood of Object.values(MOODS)) assert.ok(mood.glow < GLOW_MAX);
  });
});

describe('gaze', () => {
  it('reads yaw and pitch off a direction', () => {
    assert.deepEqual(anglesOf({ x: 0, y: 0, z: 1 }), { yaw: 0, pitch: 0 });
    assert.ok(close(anglesOf({ x: 1, y: 0, z: 0 }).yaw, Math.PI / 2));
    assert.ok(close(anglesOf({ x: 0, y: 1, z: 1 }).pitch, Math.PI / 4));
  });

  it('wraps an angle into one turn, so a look across the seam is short', () => {
    assert.ok(close(wrap(3 * Math.PI / 2), -Math.PI / 2));
    assert.ok(close(wrap(-3 * Math.PI / 2), Math.PI / 2));
    const across = offsetFrom({ yaw: Math.PI - 0.1, pitch: 0 }, { yaw: -Math.PI + 0.1, pitch: 0 });
    assert.ok(close(across.yaw, 0.2, 1e-12));
  });

  it('clamps an offset to the widest the eye turns', () => {
    assert.deepEqual(clampOffset({ yaw: 9, pitch: -9 }, LIMIT), { yaw: LIMIT.yaw, pitch: -LIMIT.pitch });
  });

  describe('pointerOffset', () => {
    const eye = { x: 0, y: 0, z: 0 };
    const toCamera = { x: 0, y: 0, z: 1 };
    const origin = { x: 0, y: 0, z: 5 };
    const toward = (x, y) => {
      const d = { x: x - origin.x, y: y - origin.y, z: 1 - origin.z };
      const n = Math.hypot(d.x, d.y, d.z);
      return { origin, direction: { x: d.x / n, y: d.y / n, z: d.z / n } };
    };

    it('is straight ahead when the pointer is on the eye', () => {
      const o = pointerOffset({ ray: toward(0, 0), eye, toCamera, reach: 1 });
      assert.ok(close(o.yaw, 0) && close(o.pitch, 0));
    });

    it('turns toward the side the pointer is on', () => {
      const right = pointerOffset({ ray: toward(0.5, 0), eye, toCamera, reach: 1 });
      const up = pointerOffset({ ray: toward(0, 0.5), eye, toCamera, reach: 1 });
      assert.ok(right.yaw > 0 && close(right.pitch, 0));
      assert.ok(up.pitch > 0 && close(up.yaw, 0));
    });

    it('turns further the nearer the plane is to the eye', () => {
      const near = pointerOffset({ ray: toward(0.5, 0), eye, toCamera, reach: 1 });
      const far = pointerOffset({ ray: toward(0.5, 0), eye, toCamera, reach: 3 });
      assert.ok(near.yaw > far.yaw && far.yaw > 0);
    });

    it('gives up on a ray that never reaches the plane', () => {
      const away = { origin, direction: { x: 0, y: 0, z: 1 } };
      assert.equal(pointerOffset({ ray: away, eye, toCamera, reach: 1 }), null);
      const parallel = { origin, direction: { x: 1, y: 0, z: 0 } };
      assert.equal(pointerOffset({ ray: parallel, eye, toCamera, reach: 1 }), null);
    });
  });
});

describe('attention', () => {
  it('picks its mode from the state and the pointer', () => {
    assert.equal(modeFor('idle', true), 'track');
    assert.equal(modeFor('speaking', true), 'track');
    assert.equal(modeFor('thinking', true), 'scan', 'thinking looks everywhere, pointer or not');
    assert.equal(modeFor('idle', false), 'survey');
    assert.equal(modeFor('listening', false), 'regard');
    assert.equal(modeFor('speaking', false), 'regard');
  });

  it('follows a pointer that is moving, clamped to how far it turns', () => {
    const attention = createAttention({ random: seeded(3) });
    let out = attention.update(DT, { pointer: { yaw: 0.3, pitch: -0.2 }, pointerAge: 0 });
    assert.equal(out.mode, 'track');
    assert.deepEqual([out.yaw, out.pitch], [0.3, -0.2]);
    out = attention.update(DT, { pointer: { yaw: 5, pitch: 5 }, pointerAge: 0 });
    assert.deepEqual([out.yaw, out.pitch], [LIMIT.yaw, LIMIT.pitch]);
  });

  it('lets a still pointer go after a while, and starts watching the room', () => {
    const attention = createAttention({ random: seeded(4) });
    const pointer = { yaw: 0.2, pitch: 0 };
    assert.equal(attention.update(DT, { pointer, pointerAge: TRACK_HOLD - 0.1 }).mode, 'track');
    assert.equal(attention.update(DT, { pointer, pointerAge: TRACK_HOLD + 0.1 }).mode, 'survey');
  });

  it('surveys like a camera: slow pans, both ways, within its limits', () => {
    const attention = createAttention({ random: seeded(5) });
    let previous = null;
    let fastest = 0;
    const sides = new Set();
    for (let t = 0; t < 12; t += DT) {
      const out = attention.update(DT, { state: 'idle' });
      if (out.gesture) { previous = null; continue; }
      assert.ok(Math.abs(out.yaw) <= LIMIT.yaw + 1e-9 && Math.abs(out.pitch) <= LIMIT.pitch + 1e-9);
      if (out.speed === 'pan') {
        if (previous) fastest = Math.max(fastest, Math.abs(out.yaw - previous.yaw) / DT);
        if (Math.abs(out.yaw) > 0.3) sides.add(Math.sign(out.yaw));
        previous = out;
      } else {
        previous = null;
      }
    }
    assert.ok(fastest > 0, 'it never panned');
    assert.ok(fastest <= PAN_SPEED + 1e-6, `panned at ${fastest} rad/s`);
    assert.equal(sides.size, 2, 'it only ever looked one way');
  });

  it('holds the viewer while listening, with only small jumps', () => {
    const attention = createAttention({ random: seeded(6) });
    for (let t = 0; t < 10; t += DT) {
      const out = attention.update(DT, { state: 'listening' });
      assert.equal(out.mode, 'regard');
      assert.ok(Math.abs(out.yaw) < 0.1 && Math.abs(out.pitch) < 0.1);
    }
  });

  it('looks all round while thinking, many times a second', () => {
    const attention = createAttention({ random: seeded(7) });
    const seen = new Set();
    let spread = 0;
    for (let t = 0; t < 3; t += DT) {
      const out = attention.update(DT, { state: 'thinking' });
      if (out.gesture) continue;
      seen.add(`${out.yaw.toFixed(6)},${out.pitch.toFixed(6)}`);
      spread = Math.max(spread, Math.abs(out.yaw));
    }
    assert.ok(seen.size >= 8, `only ${seen.size} places in three seconds`);
    assert.ok(spread > 0.5, 'it never looked far');
  });

  it('rolls its eye: a full circle that starts and ends looking straight on', () => {
    const attention = createAttention({ random: seeded(8) });
    attention.update(DT, { state: 'listening' });
    attention.perform('roll');
    const points = [];
    for (let t = 0; t < ROLL.duration; t += DT) {
      const out = attention.update(DT, { state: 'listening' });
      if (out.gesture?.kind !== 'roll') break;
      points.push(out);
    }
    const angles = points.map((p) => Math.atan2(p.pitch, p.yaw));
    let swept = 0;
    for (let i = 1; i < angles.length; i++) swept += wrap(angles[i] - angles[i - 1]);
    assert.ok(Math.abs(Math.abs(swept) - 2 * Math.PI) < 0.35, `swept ${swept} radians`);
    const widest = Math.max(...points.map((p) => Math.hypot(p.yaw, p.pitch)));
    assert.ok(close(widest, ROLL.radius, 0.02));
    assert.ok(Math.hypot(points.at(-1).yaw, points.at(-1).pitch) < 0.1, 'it did not come back');
  });

  it('tumbles over once, and drifts out and back while it does', () => {
    const attention = createAttention({ random: seeded(9) });
    attention.update(DT, { state: 'idle' });
    attention.perform('tumble');
    let last = null;
    let drift = 0;
    for (let t = 0; t < TUMBLE.duration; t += DT) {
      const out = attention.update(DT, { state: 'idle' });
      if (out.gesture?.kind !== 'tumble') break;
      last = out.gesture;
      drift = Math.max(drift, out.gesture.drift);
      const { x, y, z } = out.gesture.axis;
      assert.ok(close(Math.hypot(x, y, z), 1, 1e-9));
      assert.ok(Math.abs(y) < 0.25, 'it spun like a top instead of going over');
    }
    assert.ok(Math.abs(Math.abs(last.angle) - 2 * Math.PI) < 0.05);
    assert.ok(close(drift, 1, 0.01));
    assert.equal(attention.update(DT, { state: 'idle' }).gesture, null, 'the tumble never ended');
  });

  it('rolls or tumbles on its own when left alone', () => {
    const attention = createAttention({ random: seeded(10) });
    const kinds = new Set();
    for (let t = 0; t < IDLE_GESTURES[1] * 6; t += DT) {
      const out = attention.update(DT, { state: 'idle' });
      if (out.gesture) kinds.add(out.gesture.kind);
    }
    assert.deepEqual([...kinds].sort(), ['roll', 'tumble']);
  });

  it('eases a gesture in and out', () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    assert.equal(easeInOut(0.5), 0.5);
    assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9);
  });
});

describe('the iris', () => {
  it('rings the pupil, then the collarette, then the limbus, inside out', () => {
    assert.ok(RINGS.pupil < RINGS.collarette && RINGS.collarette < RINGS.limbus && RINGS.limbus < 1);
  });

  it('is blue', () => {
    for (const hex of [IRIS.collarette, IRIS.mid, IRIS.outer]) {
      const c = new GFX.Color(hex);
      assert.ok(c.b > c.r && c.b > c.g, `${hex} is not blue`);
    }
  });

  it('paints the same iris from the same seed', () => {
    const record = () => {
      const calls = [];
      const gradient = { addColorStop: (...a) => calls.push(['stop', ...a]) };
      const ctx = new Proxy({}, {
        get: (_, name) => (name === 'createRadialGradient' ? () => gradient
          : (...args) => calls.push([name, ...args])),
        set: (_, name, value) => { calls.push(['set', name, typeof value === 'object' ? 'gradient' : value]); return true; },
      });
      paintIris(ctx, 256, { random: seeded(11) });
      return calls;
    };
    const once = record();
    assert.ok(once.length > 400);
    assert.deepEqual(record(), once);
  });

  it('sits inside the glass, however far the pupil opens', () => {
    const rim = Math.sqrt(1 - IRIS_DEPTH * IRIS_DEPTH);
    assert.ok(IRIS_RADIUS < rim, 'the iris would poke through the glass');
  });
});

describe('the sky', () => {
  const luminance = (hex) => {
    const c = new GFX.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };

  it('keeps the night darker than the iris, so the eye is the brightest thing in it', () => {
    for (const [name, hex] of Object.entries(SKY)) {
      if (['milky', 'core', 'town'].includes(name)) continue;
      assert.ok(luminance(hex) < luminance(IRIS.mid) / 2, `${name} is too bright`);
    }
  });

  it('is darkest overhead and underneath, and glows at the horizon', () => {
    const level = (lat) => skyColour(lat).reduce((a, b) => a + b, 0);
    assert.ok(level(HORIZON) > level(Math.PI / 2));
    assert.ok(level(HORIZON) > level(-Math.PI / 2));
    assert.ok(level(HORIZON) > level(HORIZON + 0.4) && level(HORIZON) > level(HORIZON - 0.4));
    for (let lat = -Math.PI / 2; lat < Math.PI / 2; lat += 0.001) {
      const step = skyColour(lat + 0.001).map((v, i) => Math.abs(v - skyColour(lat)[i]));
      assert.ok(Math.max(...step) < 2, `the ramp jumps at ${lat.toFixed(3)}`);
    }
  });

  it('lays a cloud sea under the horizon: solid haze far off, banks and gaps nearer', () => {
    const cols = 512;
    const rows = 160;
    const pitch = (Math.PI / 2 + HORIZON) / rows;
    const data = new Uint8ClampedArray(cols * rows * 4);
    cloudTexels(data, cols, rows, { pitch, random: seeded(5) });
    const alpha = (j) => Array.from({ length: cols }, (_, i) => data[(j * cols + i) * 4 + 3]);
    assert.ok(Math.min(...alpha(0)) > 230, 'the horizon has holes in it');
    const near = alpha(Math.round(rows * 0.3));
    assert.ok(near.some((a) => a < 40), 'the clouds have no gaps');
    assert.ok(near.some((a) => a > 220), 'there are no clouds');
    for (let i = 0; i < data.length; i += 4) {
      assert.ok(data[i + 2] >= data[i], 'a cloud is not blue');
    }
  });

  it('wraps the clouds round without a seam', () => {
    const cols = 512;
    const rows = 64;
    const data = new Uint8ClampedArray(cols * rows * 4);
    cloudTexels(data, cols, rows, { pitch: 0.01, random: seeded(6) });
    for (let j = 0; j < rows; j++) {
      const alpha = (i) => data[(j * cols + i) * 4 + 3];
      let steepest = 0;
      for (let i = 1; i < cols; i++) steepest = Math.max(steepest, Math.abs(alpha(i) - alpha(i - 1)));
      assert.ok(Math.abs(alpha(0) - alpha(cols - 1)) <= steepest + 1, `row ${j} is torn where it meets itself`);
    }
  });

  it('adds the Milky Way as a band, and nothing below the horizon', () => {
    const cols = 256;
    const rows = 128;
    const pitch = Math.PI / 2 / rows * 2;
    const data = new Uint8ClampedArray(cols * rows * 4);
    glowTexels(data, cols, rows, { pitch, random: seeded(7) });
    let lit = 0;
    for (let j = 0; j < rows; j++) {
      const lat = Math.PI / 2 - (j + 0.5) * pitch;
      for (let i = 0; i < cols; i++) {
        const v = data[(j * cols + i) * 4 + 2];
        if (lat < HORIZON) assert.equal(v, 0, 'light under the horizon');
        else if (v > 3) lit++;
      }
    }
    assert.ok(lit > 0, 'no Milky Way');
    assert.ok(lit < cols * rows * 0.4, 'the band is the whole sky');
  });

  it('paints the same night from the same seed', () => {
    const record = () => {
      const calls = [];
      const images = [];
      const ctx = () => new Proxy({}, {
        get: (_, name) => {
          if (name === 'createImageData') {
            return (w, h) => {
              const image = { data: new Uint8ClampedArray(w * h * 4) };
              images.push(image.data);
              return image;
            };
          }
          if (name === 'createPattern') return () => 'pattern';
          return (...args) => calls.push([name, ...args.map((a) => (typeof a === 'object' ? 'canvas' : a))]);
        },
        set: (_, name, value) => { calls.push(['set', name, value]); return true; },
      });
      const layer = (width, height) => ({ width, height, getContext: ctx });
      paintSky(ctx(), 512, 256, { random: seeded(13), layer });
      return { calls, images };
    };
    const once = record();
    assert.ok(once.calls.length > 1000, 'too little painted');
    assert.equal(once.images.length, 3, 'clouds, glow and grain');
    const twice = record();
    assert.deepEqual(twice.calls, once.calls);
    assert.deepEqual(twice.images, once.images);
  });

  it('paints only what needs no canvas of its own, given none', () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, name) => () => calls.push(name),
      set: () => true,
    });
    assert.doesNotThrow(() => paintSky(ctx, 256, 128, { random: seeded(14) }));
    assert.ok(!calls.includes('drawImage'));
  });
});

describe('createAlan', () => {
  function stageWithCamera() {
    const scene = new GFX.Scene();
    const camera = new GFX.PerspectiveCamera(45, 4 / 3, 0.01, 500);
    const ground = new GFX.Mesh(new GFX.PlaneGeometry(10, 10), new GFX.ShadowMaterial());
    const stage = {
      _scene: scene,
      _camera: camera,
      _ground: ground,
      _renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } },
      object: null,
      setObject(o) { this.object = o; scene.add(o); ground.position.y = -RADIUS; },
    };
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return stage;
  }

  function events() {
    const listeners = {};
    return {
      listeners,
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
      removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); },
      fire: (type, e) => (listeners[type] ?? []).forEach((fn) => fn(e)),
    };
  }

  /** Which way the iris is facing, in world space. */
  function facing(stage) {
    stage.object.updateMatrixWorld(true);
    const iris = stage.object.getObjectByName('iris');
    const at = new GFX.Vector3().setFromMatrixPosition(iris.matrixWorld);
    const centre = new GFX.Vector3().setFromMatrixPosition(stage.object.getObjectByName('glass').matrixWorld);
    return at.sub(centre).normalize();
  }

  it('builds a named glass eye, and hangs it in the sky with no floor under it', () => {
    const stage = stageWithCamera();
    createAlan({ stage, GFX, random: seeded(1), events: events() });
    const names = [];
    stage.object.traverse((o) => { if (o.isMesh) names.push(o.name); });
    assert.deepEqual(names.sort(), ['glass', 'iris', 'pupil']);
    const glass = stage.object.getObjectByName('glass');
    assert.equal(glass.material.transmission, 1);
    assert.ok(glass.material.roughness < 0.1, 'the glass is frosted');
    assert.equal(stage._ground.visible, false, 'a shadow hangs in the air under it');
    assert.ok(stage._scene.getObjectByName('backdrop'), 'nothing behind the glass to refract');
  });

  it('lets the sky go by, slowly', () => {
    const stage = stageWithCamera();
    const alan = createAlan({ stage, GFX, random: seeded(12), events: events() });
    const backdrop = stage._scene.getObjectByName('backdrop');
    for (let i = 0; i < 600; i++) alan.step(0.05);
    assert.ok(close(backdrop.rotation.y, 30 * SKY_DRIFT, 1e-9));
    assert.ok((Math.PI * 2) / SKY_DRIFT > 20 * 60, 'the sky goes round faster than anyone could watch it');
  });

  it('looks at the viewer when nothing else is going on', () => {
    const stage = stageWithCamera();
    const alan = createAlan({ stage, GFX, random: seeded(2), events: events() });
    alan.setState('listening');
    for (let i = 0; i < 120; i++) alan.step(DT);
    assert.ok(facing(stage).z > 0.98, 'it is not looking at the camera');
  });

  it('follows the pointer to the right, and up', () => {
    const stage = stageWithCamera();
    const ev = events();
    const alan = createAlan({ stage, GFX, random: seeded(3), events: ev });
    ev.fire('pointermove', { clientX: 780, clientY: 300 });
    for (let i = 0; i < 60; i++) alan.step(DT);
    assert.equal(alan.mode, 'track');
    assert.ok(facing(stage).x > 0.3, 'it did not look right');

    ev.fire('pointermove', { clientX: 400, clientY: 20 });
    for (let i = 0; i < 60; i++) alan.step(DT);
    const up = facing(stage);
    assert.ok(up.y > 0.3 && Math.abs(up.x) < 0.1, 'it did not look up');
  });

  it('lets go of a pointer that has left the window', () => {
    const stage = stageWithCamera();
    const ev = events();
    const alan = createAlan({ stage, GFX, random: seeded(4), events: ev });
    ev.fire('pointermove', { clientX: 780, clientY: 300 });
    alan.step(DT);
    assert.equal(alan.mode, 'track');
    ev.fire('pointerout', { relatedTarget: null });
    alan.step(DT);
    assert.equal(alan.mode, 'survey');
  });

  it('opens the pupil to listen, narrows it to think, and glows while it talks', () => {
    const stage = stageWithCamera();
    const alan = createAlan({ stage, GFX, random: seeded(5), events: events() });
    const pupil = stage.object.getObjectByName('pupil');
    const iris = stage.object.getObjectByName('iris').material[1];
    const settle = (state, level = 0) => {
      alan.setState(state);
      for (let i = 0; i < 240; i++) { alan.setLevel(level); alan.step(DT); }
    };
    settle('listening');
    const listening = pupil.scale.x;
    settle('thinking');
    const thinking = pupil.scale.x;
    assert.ok(listening > thinking + 0.1, `${listening} vs ${thinking}`);
    settle('idle');
    const quiet = iris.emissiveIntensity;
    settle('speaking', 0.9);
    assert.ok(iris.emissiveIntensity > quiet + 0.1);
    assert.ok(iris.emissiveIntensity <= GLOW_MAX);
  });

  it('backs the camera off on a portrait screen, so the ball fits across as well as up', () => {
    const distanceAt = (aspect) => {
      const stage = stageWithCamera();
      stage._camera.aspect = aspect;
      stage._camera.updateProjectionMatrix();
      const alan = createAlan({ stage, GFX, random: seeded(7), events: events() });
      alan.step(DT);
      return stage._camera.position.length();
    };
    const landscape = distanceAt(16 / 9);
    const square = distanceAt(1);
    const portrait = distanceAt(9 / 19.5);
    assert.ok(close(landscape, square, 1e-9), 'a wide screen should keep the stage framing');
    assert.ok(portrait > landscape * 1.8, `${portrait} is not far enough back from ${landscape}`);
  });

  it('lets the view zoom in close, but not into the glass, and out only so far', () => {
    const limitsAt = (aspect) => {
      const stage = stageWithCamera();
      stage._controls = { target: new GFX.Vector3(), minDistance: 0, maxDistance: Infinity };
      stage._camera.aspect = aspect;
      stage._camera.updateProjectionMatrix();
      const alan = createAlan({ stage, GFX, random: seeded(15), events: events() });
      alan.step(DT);
      return { ...stage._controls, framed: stage._camera.position.length() };
    };
    const reach = Math.max(...Object.values(MOODS).map((m) => m.lean + m.drift + m.hover + m.bob))
      + ENERGY_GAIN.bob + 0.35;
    for (const aspect of [16 / 9, 9 / 19.5]) {
      const { minDistance, maxDistance, framed } = limitsAt(aspect);
      assert.ok(minDistance > RADIUS * (1 + reach), 'the camera can be zoomed into the glass');
      assert.ok(minDistance < framed && framed < maxDistance, 'the framing is outside the limits');
      assert.ok(close(minDistance, framed * ZOOM.in, 1e-9));
      assert.ok(close(maxDistance, framed * ZOOM.out, 1e-9));
    }
    assert.ok(limitsAt(9 / 19.5).maxDistance > limitsAt(16 / 9).maxDistance, 'a phone held upright cannot zoom out as far');
  });

  it('keeps the sky round the camera, wherever the camera goes', () => {
    const stage = stageWithCamera();
    createAlan({ stage, GFX, random: seeded(16), events: events() });
    const backdrop = stage._scene.getObjectByName('backdrop');
    stage._camera.position.set(40, 25, -90);
    backdrop.onBeforeRender(null, stage._scene, stage._camera);
    const at = new GFX.Vector3().setFromMatrixPosition(backdrop.matrixWorld);
    assert.ok(at.distanceTo(stage._camera.position) < 1e-9, 'the camera has left the sky');
  });

  it('lets the view be panned a little, but never off the eye', () => {
    const stage = stageWithCamera();
    const listeners = {};
    stage._controls = {
      target: new GFX.Vector3(),
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
      removeEventListener: (type, fn) => { listeners[type] = listeners[type].filter((f) => f !== fn); },
    };
    const alan = createAlan({ stage, GFX, random: seeded(17), events: events() });
    alan.step(DT);
    const { target } = stage._controls;
    const camera = stage._camera;
    const away = camera.position.clone().sub(target);
    const reach = PAN * Math.tan((camera.fov * Math.PI) / 360) * away.length();

    const nudge = new GFX.Vector3(reach / 2, 0, 0);
    target.add(nudge);
    camera.position.add(nudge);
    listeners.change.forEach((fn) => fn());
    assert.ok(close(target.x, reach / 2), 'a small pan was undone');

    const shove = new GFX.Vector3(0, 50, 0);
    target.add(shove);
    camera.position.add(shove);
    listeners.change.forEach((fn) => fn());
    assert.ok(target.length() <= reach + 1e-9, 'the view was panned off the eye');
    assert.ok(camera.position.clone().sub(target).distanceTo(away) < 1e-9, 'pulling it back turned the view');

    alan.dispose();
    assert.equal(listeners.change.length, 0);
  });

  it('ignores a state it does not know, and stops listening when disposed', () => {
    const stage = stageWithCamera();
    const ev = events();
    const alan = createAlan({ stage, GFX, random: seeded(6), events: ev });
    alan.setState('dancing');
    assert.equal(alan.state, 'idle');
    alan.dispose();
    assert.equal(ev.listeners.pointermove.length, 0);
  });
});

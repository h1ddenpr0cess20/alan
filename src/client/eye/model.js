import { createIrisTexture, RINGS } from './iris.js';
import { createSkyTexture, skyColour } from './sky.js';

/** The eye, in metres of nothing in particular: the stage frames whatever size it is. */
export const RADIUS = 0.8;

/** The sky round the scene: far enough off that the eye's own drift doesn't move it. */
const BACKDROP_RADIUS = 60;

/**
 * Where the iris sits inside the glass, as fractions of the radius. A real
 * iris is a few millimetres behind the cornea; this one is set back far enough
 * that the ball in front of it magnifies it a little, like a marble.
 */
export const IRIS_DEPTH = 0.56;
export const IRIS_RADIUS = 0.44;
const IRIS_THICKNESS = 0.035;

/**
 * A sphere of clear glass with an iris suspended inside it, looking down +z.
 *
 * The glass is a transmissive physical material, so what it shows is the
 * scene behind it refracted — the iris and pupil are opaque for exactly that
 * reason, and the backdrop (`createBackdrop`) is what the rest of the ball
 * refracts. The iris is a thin disc: painted on the front, dark blue behind,
 * so an orbit round the back still finds an eye.
 */
export function createEye(GFX, { random } = {}) {
  const R = RADIUS;

  const glass = new GFX.Mesh(
    new GFX.SphereGeometry(R, 128, 96),
    new GFX.MeshPhysicalMaterial({
      name: 'glass',
      color: new GFX.Color('#ffffff'),
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: 0.4,
      ior: 1.5,
      attenuationColor: new GFX.Color('#e4f2ff'),
      attenuationDistance: 5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.02,
      specularIntensity: 1,
    }),
  );
  glass.name = 'glass';

  const map = createIrisTexture(GFX, { random });
  const front = new GFX.MeshStandardMaterial({
    name: 'iris',
    color: new GFX.Color(map ? '#ffffff' : '#2f7fd6'),
    map,
    roughness: 0.5,
    metalness: 0,
    emissive: new GFX.Color('#3d9dff'),
    emissiveIntensity: 0,
  });
  const back = new GFX.MeshStandardMaterial({
    name: 'iris_back',
    color: new GFX.Color('#0a1a36'),
    roughness: 0.7,
    metalness: 0,
  });

  // A cylinder's groups are its side, its top cap and its bottom cap; turned
  // so the top faces down the gaze, the top is the painted face.
  const irisGeometry = new GFX.CylinderGeometry(R * IRIS_RADIUS, R * IRIS_RADIUS, R * IRIS_THICKNESS, 96, 1);
  irisGeometry.rotateX(Math.PI / 2);
  const iris = new GFX.Mesh(irisGeometry, [back, front, back]);
  iris.name = 'iris';
  iris.position.z = R * IRIS_DEPTH;

  const pupil = new GFX.Mesh(
    new GFX.CircleGeometry(R * IRIS_RADIUS, 72),
    new GFX.MeshBasicMaterial({ name: 'pupil', color: new GFX.Color('#000000') }),
  );
  pupil.name = 'pupil';
  pupil.position.z = R * (IRIS_DEPTH + IRIS_THICKNESS / 2) + 0.002;
  pupil.scale.setScalar(RINGS.pupil);

  const eye = new GFX.Group();
  eye.name = 'eye';
  eye.add(iris, pupil, glass);

  return { eye, glass, iris, pupil, irisMaterial: front };
}

/**
 * What the glass has to refract. Left to itself a transmissive surface over a
 * transparent canvas shows a flat half-white — the renderer's stand-in for
 * "nothing behind" — and clear glass comes out milky. A night sky round the
 * whole of the scene (`sky.js`) gives it something true to bend instead.
 * Where there is no canvas to paint that on, just its plain ramp, horizon and all.
 */
export function createBackdrop(GFX, { random } = {}) {
  const geometry = new GFX.SphereGeometry(BACKDROP_RADIUS, 128, 64);
  const map = createSkyTexture(GFX, { random });
  if (!map) {
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const c = new GFX.Color();
    for (let i = 0; i < position.count; i++) {
      const up = Math.max(-1, Math.min(1, position.getY(i) / BACKDROP_RADIUS));
      const [r, g, b] = skyColour(Math.asin(up)).map(Math.round);
      c.setHex((r << 16) | (g << 8) | b);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geometry.setAttribute('color', new GFX.BufferAttribute(colors, 3));
  }
  const mesh = new GFX.Mesh(geometry, new GFX.MeshBasicMaterial({
    name: 'backdrop', map, vertexColors: !map, side: GFX.BackSide, depthWrite: false,
  }));
  mesh.name = 'backdrop';
  mesh.renderOrder = -1;
  // As good as infinitely far off: wherever the camera is, the sky is round
  // it. Set as it is drawn, so it holds however the camera got there.
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

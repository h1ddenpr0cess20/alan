/**
 * Gaze as two angles: `yaw` about the vertical, from +z toward +x, and `pitch`
 * up from the horizontal. Offsets are measured from "home" — straight at the
 * viewer — so every behaviour can be written without knowing where the camera
 * has been orbited to.
 */

export const wrap = (a) => {
  const w = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return w === -Math.PI ? Math.PI : w;
};

export function anglesOf(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { yaw: Math.atan2(v.x, v.z), pitch: Math.asin(Math.max(-1, Math.min(1, v.y / len))) };
}

/** `dir` relative to `home`, both as angles. */
export function offsetFrom(home, dir) {
  return { yaw: wrap(dir.yaw - home.yaw), pitch: dir.pitch - home.pitch };
}

/** Kept inside the widest the eye will turn from the viewer. */
export function clampOffset(o, limit) {
  return {
    yaw: Math.max(-limit.yaw, Math.min(limit.yaw, o.yaw)),
    pitch: Math.max(-limit.pitch, Math.min(limit.pitch, o.pitch)),
  };
}

/**
 * Where the pointer is, as a gaze offset. The ray through the pointer meets a
 * plane facing the camera a little in front of the eye (`reach` from its
 * centre), and the eye looks at that point — near enough that the pointer at
 * the edge of the screen turns it well round, far enough that it never looks
 * cross-eyed at the glass.
 *
 * `ray` is { origin, direction } in world space; `eye` and `toCamera` (unit)
 * too. Returns null when the ray runs parallel to the plane or away from it.
 */
export function pointerOffset({ ray, eye, toCamera, reach }) {
  const px = eye.x + toCamera.x * reach;
  const py = eye.y + toCamera.y * reach;
  const pz = eye.z + toCamera.z * reach;
  const denom = ray.direction.x * toCamera.x + ray.direction.y * toCamera.y + ray.direction.z * toCamera.z;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((px - ray.origin.x) * toCamera.x + (py - ray.origin.y) * toCamera.y + (pz - ray.origin.z) * toCamera.z) / denom;
  if (t <= 0) return null;
  const hit = {
    x: ray.origin.x + ray.direction.x * t - eye.x,
    y: ray.origin.y + ray.direction.y * t - eye.y,
    z: ray.origin.z + ray.direction.z * t - eye.z,
  };
  return offsetFrom(anglesOf(toCamera), anglesOf(hit));
}

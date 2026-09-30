/**
 * What each conversational state does to the body — the gaze itself is
 * `attention.js`'s. `pupil` is the pupil's radius as a fraction of the iris;
 * `glow` the iris's own light; `hover`, `bob` and `drift` the float; `lean`
 * how far it comes toward the viewer.
 */
export const MOODS = {
  idle:      { pupil: 0.34, glow: 0.03, hover: 0.00, bob: 0.035, drift: 0.07, lean:  0.00 },
  listening: { pupil: 0.44, glow: 0.08, hover: 0.04, bob: 0.020, drift: 0.03, lean:  0.14 },
  thinking:  { pupil: 0.24, glow: 0.18, hover: 0.08, bob: 0.015, drift: 0.02, lean: -0.05 },
  speaking:  { pupil: 0.32, glow: 0.10, hover: 0.04, bob: 0.030, drift: 0.04, lean:  0.08 },
};

/** How far a loud moment pushes past the mood: a brighter iris, a wider pupil, a harder bob. */
export const ENERGY_GAIN = { glow: 0.35, pupil: 0.1, bob: 0.05 };

/** The brightest the iris gets: past this the painted fibres wash out to a flat blue. */
export const GLOW_MAX = 0.5;

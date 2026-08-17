// Honest WebGL anti-aliasing. The browser's `gl.antialias` flag is a boolean
// with no sample-count picker (no 2x/4x/8x/16x MSAA). These four modes are
// the real options: two post-process shaders and one 2x supersample. 4x
// supersample is ~16x the pixel cost and is not offered.
export const AA_MODES = [
  { id: 'off', label: 'Off', blurb: 'No extra GPU cost. Hardware AA (if on) is the only smoothing.' },
  { id: 'fxaa', label: 'FXAA', blurb: 'Fast edge-smoothing shader. Cheapest option; softens fine detail slightly.' },
  { id: 'smaa', label: 'SMAA', blurb: 'Sharper edge-smoothing than FXAA for a similar cost. A good default upgrade.' },
  {
    id: 'supersample2x',
    label: 'Supersample 2x',
    blurb: 'Renders at double resolution internally for the cleanest edges. Roughly 4× the pixel cost.',
  },
];

export const AA_MODE_IDS = AA_MODES.map((mode) => mode.id);

export function aaModeInfo(id) {
  return AA_MODES.find((mode) => mode.id === id) ?? AA_MODES[0];
}

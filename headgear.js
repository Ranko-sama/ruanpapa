import { SplineCurve, Vector2 } from './assets/three.module.min.js';

// This is the same meridian used to build the visible jelly surface.
export const BODY_DEPTH = 0.809;
export const bodyRings = new SplineCurve(
  [
    [0, 0.27],
    [0.22, 0.275],
    [0.42, 0.32],
    [0.57, 0.44],
    [0.66, 0.63],
    [0.709, 0.89],
    [0.714, 1.15],
    [0.694, 1.35],
    [0.642, 1.55],
    [0.543, 1.72],
    [0.414, 1.838],
    [0.254, 1.91],
    [0.105, 1.946],
    [0, 1.949],
  ].map(([r, y]) => new Vector2(r, y)),
).getPoints(52);
const widest = bodyRings.reduce((i, p, j) => (p.x > bodyRings[i].x ? j : i), 0);
const crown = bodyRings.slice(widest);
const radii = new Float64Array(crown.length);

export function crownRadius(y) {
  for (let i = 1; i < crown.length; i++) {
    const a = crown[i - 1],
      b = crown[i];
    if (y <= b.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return 0;
}

// Inner horizontal sections of each rigid shell, measured in mesh bind space.
// The brim seats on a wide, squashed head; on a tall, narrow head the crown seats first.
const caps = {
  knight: {
    center: 1.68,
    seats: [
      [0.644, 1.552],
      [0.642, 1.68],
      [0.603, 1.79],
      [0.51, 1.904],
      [0.37, 1.986],
      [0.19, 2.032],
      [0, 2.049],
    ],
  },
  cowboy: {
    center: 1.755,
    seats: [
      [0.525, 1.728],
      [0.488, 1.831],
      [0.395, 1.984],
      [0.265, 2.055],
      [0.12, 2.071],
      [0, 2.071],
    ],
  },
};
export const SOLE_PIVOT = 0.25;

function seatHeight(cap, height, width, lean) {
  for (let i = 0; i < crown.length; i++) {
    const p = crown[i];
    radii[i] = p.x * width + Math.abs(p.y - cap.center) * lean;
  }
  let lift = -Infinity;
  for (const [opening, level] of cap.seats) {
    // Highest crossing of this opening. Interpolate between rings to keep the
    // mount continuous as weight transfers from the rim to the dome.
    for (let i = crown.length - 1; i >= 0; i--) {
      if (radii[i] < opening) continue;
      let y = crown[i].y;
      if (i + 1 < crown.length)
        y += ((crown[i + 1].y - y) * (radii[i] - opening)) / (radii[i] - radii[i + 1]);
      lift = Math.max(lift, SOLE_PIVOT + (y - SOLE_PIVOT) * height - level);
      break;
    }
  }
  return lift;
}
for (const cap of Object.values(caps)) cap.rest = seatHeight(cap, 1, 1, 0);

export function seatHeadgear(kind, head, torso, height, width, leanX, leanZ) {
  if (kind === 'spark') {
    // Elastic headband, its enamel mark, and the two gel ears share one skin transform.
    head.matrix.copy(torso.matrix);
    head.matrixWorldNeedsUpdate = true;
    return;
  }
  if (kind === 'hammer') {
    // Keep both goggles rigid and align their bridge to the changing forehead tangent.
    const y = 1.668,
      z = 0.485;
    const pitch = Math.atan(0.5) - Math.atan((0.5 * width - leanZ) / height);
    head.rotation.x = pitch;
    head.position.set(
      leanX * (y - SOLE_PIVOT),
      SOLE_PIVOT + height * (y - SOLE_PIVOT) - (Math.cos(pitch) * y - Math.sin(pitch) * z),
      width * z + leanZ * (y - SOLE_PIVOT) - (Math.sin(pitch) * y + Math.cos(pitch) * z),
    );
    return;
  }
  const cap = caps[kind],
    arm = cap.center - SOLE_PIVOT;
  // In the circularized cross section this bounds the movement of the centreline
  // in every azimuth, including diagonal knockbacks.
  const lean = Math.hypot(leanX, leanZ / BODY_DEPTH);
  head.position.set(arm * leanX, seatHeight(cap, height, width, lean) - cap.rest, arm * leanZ);
}

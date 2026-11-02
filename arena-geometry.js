// Layout travels with the match so old recordings retain their physical landmarks.
const classic = {
  rotor: true,
  version: 1,
  scale: 1,
  radius: 7.84,
  flagX: 5.3,
  cartEnd: 5,
  zoneRadius: 2.7,
  glass: [
    [-4, 3],
    [4, -3],
  ],
};
export const ARENA = {
  rotor: true,
  version: 2,
  scale: 2,
  radius: classic.radius * 2,
  flagX: 10.6,
  cartEnd: 10,
  zoneRadius: 3.7,
  glass: [
    [-6.8, 4.6],
    [6.8, -4.6],
  ],
};
export const DECK_RADIUS = ARENA.radius;
export const GLASS = ARENA.glass;
const rectangle = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const bridgeCenters = [-9, 0, 9];
const quay = [
  [3.6, -12],
  [14.8, -12],
  [17, -9.8],
  [17, 9.8],
  [14.8, 12],
  [3.6, 12],
];
export const DOCK = {
  version: 2,
  scale: 2.15,
  radius: 20.4,
  flagX: 13,
  cartEnd: 12,
  zoneRadius: 3.4,
  decks: [
    quay,
    quay.map(([x, z]) => [-x, z]).reverse(),
    ...bridgeCenters.map((z) => {
      const half = z === 0 ? 3.65 : 1.65;
      return rectangle(-3.6, z - half, 3.6, z + half);
    }),
  ],
  glass: [
    [-12.6, -8.9],
    [12.6, 8.9],
  ],
  belts: [
    { x: -8.5, z: 0, halfX: 1.55, halfZ: 7, direction: 1 },
    { x: 8.5, z: 0, halfX: 1.55, halfZ: 7, direction: -1 },
  ],
  spawns: [
    [-12, 4.8],
    [12, -4.8],
    [-6.4, -8.9],
    [6.4, 8.9],
    [-14, -3.5],
    [14, 3.5],
  ],
  crates: [
    [-8.5, -4.8],
    [8.5, 4.8],
    [12, -8.8],
  ],
  waypoints: [-13.5, -5.4, 5.4, 13.5].flatMap((x) => bridgeCenters.map((z) => [x, z])),
};
export const PINBALL = {
  version: 2,
  scale: 2.2,
  radius: 20.6,
  flagX: 11.7,
  cartEnd: 10.5,
  zoneRadius: 3.5,
  decks: [
    [
      [-11, -15],
      [11, -15],
      [16.6, -10.4],
      [16.6, -2],
      [14.2, 1.3],
      [14.2, 9.1],
      [9.6, 13.5],
      [3.2, 15],
      [1.65, 9.6],
      [-1.65, 9.6],
      [-3.2, 15],
      [-9.6, 13.5],
      [-14.2, 9.1],
      [-14.2, 1.3],
      [-16.6, -2],
      [-16.6, -10.4],
    ],
  ],
  glass: [
    [-11.3, -8.9],
    [11.3, -8.9],
  ],
  bumpers: [
    [-5.8, -4.8],
    [5.8, -4.8],
    [-7, 5.2],
    [7, 5.2],
    [0, -9.6],
  ],
  spawns: [
    [-10.6, 5.5],
    [10.6, -5.5],
    [-3.7, -11.4],
    [3.7, 10.4],
    [-10.8, -3.6],
    [10.6, 5.5],
  ],
  crates: [
    [-3.2, -5.4],
    [3.2, 4.6],
    [0, 6.4],
  ],
  waypoints: [
    [-12, -5],
    [12, -5],
    [-8.5, -11.5],
    [8.5, -11.5],
    [0, -13],
    [0, -6.6],
    [-10.5, 1],
    [10.5, 1],
    [0, 0],
    [-3.9, 5.8],
    [3.9, 5.8],
    [0, 7.8],
    [-6.1, 10],
    [6.1, 10],
  ],
};
// The mushroom's visible rubber cushions and their solid ellipsoids use the same profile.
export const BUMPER_LOBES = [
  [0.15, 0.16, 1.03],
  [0.58, 0.52, 0.71],
  [1.02, 0.43, 1.27],
];
export const BELT_SPEED = 3.5;
export const BELT_PITCH = 2;
export const beltOffset = (t) => (t * BELT_SPEED) % BELT_PITCH;
export const layoutFor = (config) => {
  if (config.map === 'dock') return DOCK;
  if (config.map === 'pinball') return PINBALL;
  return config.arenaVersion === ARENA.version ? ARENA : classic;
};
export const GLASS_HALF = 1.02;
export const GLASS_WARNING = 1.35;
export const GLASS_REPAIR = 4;
export const GLASS_CRACKS = [
  [
    [-0.97, -0.76],
    [-0.48, -0.57],
    [-0.55, -0.26],
    [-0.08, 0.02],
    [0.18, 0.41],
    [0.62, 0.53],
    [0.9, 0.98],
  ],
  [
    [-0.08, 0.02],
    [0.28, -0.27],
    [0.53, -0.22],
    [0.94, -0.62],
  ],
  [
    [-0.08, 0.02],
    [-0.38, 0.39],
    [-0.76, 0.48],
    [-0.95, 0.83],
  ],
];
// Each drawn slab has exactly this footprint. Adjacent bridge and quay edges meet at y=0.
export function inPolygon(points, x, z, pad = 0) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j],
      [bx, bz] = points[i];
    const dx = bx - ax,
      dz = bz - az;
    if (az > z !== bz > z && x < ax + (dx * (z - az)) / dz) inside = !inside;
    if (
      x + pad < Math.min(ax, bx) ||
      x - pad > Math.max(ax, bx) ||
      z + pad < Math.min(az, bz) ||
      z - pad > Math.max(az, bz)
    )
      continue;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if ((x - ax - u * dx) ** 2 + (z - az - u * dz) ** 2 <= pad * pad + 1e-12) return true;
  }
  return inside;
}
export function onDeck(layout, x, z, pad = 0) {
  if (layout.decks) return layout.decks.some((poly) => inPolygon(poly, x, z, pad));
  return x * x + z * z <= (layout.radius + pad) ** 2;
}
export function hasFloorAt(layout, glass, x, z, pad = 0) {
  if (!onDeck(layout, x, z, pad)) return false;
  return !layout.glass.some(
    ([gx, gz], i) =>
      glass[i].down > 0 && Math.abs(x - gx) < GLASS_HALF - pad && Math.abs(z - gz) < GLASS_HALF - pad,
  );
}
export const BLOCK = { width: 0.94, height: 0.92, depth: 0.92, mass: 0.68 };
export const SWEEPER_HEIGHT = 0.54;
export const SWEEPER_TIP = 4.32;
// The first band ends where the thicker bumper starts.
export const SWEEPER_BANDS = [
  [0.63, 3.93, 0.204],
  [3.93, SWEEPER_TIP, 0.29],
];

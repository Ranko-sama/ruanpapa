import { BELT_PITCH, BUMPER_LOBES, GLASS_HALF } from '../arena-geometry.js';

// A small shared model for the two toy arenas. Canvas and WebGL paint the same
// route markings, moving treads, cabinets and bumpers at the same world positions.
const cream = '#fff1c8',
  navy = '#294760',
  yellow = '#ffbc49',
  coral = '#f47758';
const aqua = '#55e8dc',
  pink = '#ff79bc',
  violet = '#7762c4',
  night = '#332e60';
export const courseColors = (layout) =>
  layout.belts
    ? { top: '#eeb47e', bridge: '#91b8b3', hull: '#378598', base: '#224f69' }
    : { top: '#454579', hull: '#9a67b3', base: '#403968' };
const rectangle = (x, z, w, d) => [
  [x - w / 2, z - d / 2],
  [x + w / 2, z - d / 2],
  [x + w / 2, z + d / 2],
  [x - w / 2, z + d / 2],
];
function stripe(p, ax, az, bx, bz, width, color, y = 0.014) {
  const d = Math.hypot(bx - ax, bz - az),
    nx = ((az - bz) * width) / (2 * d),
    nz = ((bx - ax) * width) / (2 * d);
  p.paint(
    [
      [ax + nx, az + nz],
      [bx + nx, bz + nz],
      [bx - nx, bz - nz],
      [ax - nx, az - nz],
    ],
    y,
    color,
  );
}
function star(p, x, z, r, y, color) {
  p.paint(
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4,
        s = i % 2 ? r * 0.29 : r;
      return [x + Math.cos(a) * s, z + Math.sin(a) * s];
    }),
    y,
    color,
  );
}
function dockBackdrop(p) {
  // The sea sits below the knockout height. Foam streaks and floats identify the open channel.
  p.paint(
    [
      [-22, -13],
      [-17, -17],
      [17, -17],
      [22, -12],
      [22, 12],
      [17, 16],
      [-17, 16],
      [-22, 12],
    ],
    -3.8,
    '#45bbce',
  );
  // Shallow ribbons and paired white crests read as water even with the close camera.
  for (let row = 0; row < 8; row++) {
    const z = -13.8 + row * 3.85;
    const bank = Array.from({ length: 17 }, (_, i) => [
      -18.8 + i * 2.35,
      z + 0.42 * Math.sin(i * 1.18 + row * 1.4),
    ]);
    p.paint(
      [...bank, ...bank.map(([x, v], i) => [x, v + 0.26 + 0.11 * Math.cos(i + row)]).reverse()],
      -3.77,
      '#6ad2d6',
    );
    for (const x of [-18.3, -2.35, 0.8, 15.9]) {
      const cz = z + 0.41 * Math.sin(row + x);
      p.pipe([x, -3.69, cz], [x + 0.46, -3.69, cz + 0.12], 0.046, '#cefff2');
      p.pipe([x + 0.46, -3.69, cz + 0.12], [x + 1.07, -3.69, cz - 0.09], 0.046, '#cefff2');
    }
  }
  for (let i = 0; i < 32; i++) {
    const x = ((i * 7.13) % 38) - 19,
      z = ((i * 5.31) % 28) - 14;
    p.pipe([x, -3.75, z], [x + 0.8 + (i % 3) * 0.45, -3.75, z - 0.16], 0.055, '#d3ffec');
  }
  for (const [x, z] of [
    [-1.8, 5.9],
    [1.9, -5.9],
    [-13, 14.1],
    [12.5, 14.4],
    [20, -6],
  ]) {
    p.ring(x, z, 0.93, 0.98, -3.68, '#c1f9e9');
    p.ball([x, -3.55, z], [0.48, 0.38, 0.48], coral);
    p.ball([x, -3.25, z], [0.31, 0.32, 0.31], cream);
    p.pipe([x, -3.24, z], [x, -2.57, z], 0.075, navy);
    p.ball([x, -2.57, z], [0.17, 0.15, 0.17], yellow);
  }
  // Harbour cranes stand beyond the back edge. Their striped booms stay over the water.
  for (const side of [-1, 1]) {
    const x = side * 12.5,
      z = -13.7;
    p.box([x, -1.7, z], [4.5, 1.25, 2.15], navy);
    for (const dx of [-1.35, 1.35]) {
      p.pipe([x + dx, -2.8, z], [x + dx * 0.65, 4.35, z], 0.22, yellow);
      p.pipe([x + dx, -0.9, z], [x - dx * 0.65, 3.8, z], 0.1, coral);
    }
    p.box([x, 4.25, z], [2.7, 0.46, 1.45], coral);
    p.box([x + side * 0.66, 4.97, z], [1.18, 1.04, 1.24], yellow);
    p.box([x + side * 0.66, 5.03, z + 0.63], [0.91, 0.59, 0.055], '#326881');
    const end = x - side * 5.7;
    p.pipe([x + side * 1.55, 4.85, z], [end, 6.5, z], 0.19, yellow);
    p.pipe([x + side * 1.5, 5.65, z], [end, 7.15, z], 0.14, cream);
    for (let i = 0; i < 6; i++) {
      const t = i / 6,
        bx = x + side * 1.5 - side * 7.2 * t;
      p.pipe([bx, 4.94 + 1.65 * t, z], [bx - side * 1.12, 5.83 + 1.55 * t, z], 0.08, coral);
    }
    p.pipe([end, 6.8, z], [end, 2.6, z], 0.065, navy);
    p.box([end, 2.45, z], [0.59, 0.4, 0.4], yellow);
    p.pipe([end, 2.45, z], [end, 1.91, z], 0.11, navy);
    p.pipe([end, 1.91, z], [end + 0.37, 2.06, z], 0.11, navy);
    // Port and starboard shipping containers on pontoons outside the play area.
    const tx = side * 18.3,
      tz = side * 4;
    p.box([tx, -2.66, tz], [2.2, 0.55, 7.15], navy);
    for (let j = 0; j < 2; j++) {
      const cz = tz - 1.65 + j * 3.3,
        c = j === 0 ? coral : '#52bda9';
      p.box([tx, -1.74, cz], [1.7, 1.38, 2.95], c);
      p.box([tx, -1.02, cz], [1.78, 0.14, 3.03], cream);
      for (let k = -2; k <= 2; k++)
        p.box([tx + side * 0.86, -1.75, cz + k * 0.49], [0.065, 1.13, 0.065], cream);
    }
    for (const cz of [-6, 0, 6]) {
      p.ball([side * 16.95, -0.65, cz], [0.25, 0.46, 0.63], navy);
      p.box([side * 16.96, -0.58, cz], [0.42, 0.16, 0.8], yellow);
    }
  }
}
function pinballBackdrop(p) {
  const z = -15.85;
  for (const x of [-5, 5]) p.box([x, 0.42, z], [0.7, 4.25, 0.6], violet);
  p.box([0, 3.55, z], [15, 3.65, 0.94], pink);
  p.box([0, 3.65, z + 0.12], [14.5, 3.23, 0.89], night);
  p.box([0, 3.72, z + 0.58], [8.5, 2.33, 0.07], '#222944');
  // JELLY in a five-character dot-matrix marquee.
  const letters = [
    '001001001101111',
    '111100110100111',
    '100100100100111',
    '100100100100111',
    '101101010010010',
  ];
  letters.forEach((digit, j) => {
    for (let i = 0; i < 15; i++) {
      const x = (j - 2) * 1.52 + ((i % 3) - 1) * 0.31,
        y = 3.7 + (2 - Math.floor(i / 3)) * 0.34;
      p.ball([x, y, z + 0.66], [0.12, 0.12, 0.055], digit[i] === '1' ? '#ffdf87' : '#45425a');
    }
  });
  for (const side of [-1, 1]) {
    p.ball([side * 5.9, 3.68, z + 0.48], [0.82, 0.82, 0.19], aqua);
    p.ball([side * 5.9, 3.68, z + 0.59], [0.53, 0.53, 0.13], violet);
    for (let i = 0; i < 3; i++)
      p.ball([side * (3.4 + i * 0.56), 5.52, z], [0.18, 0.17, 0.18], i % 2 ? pink : yellow);
    // Cabinet legs and corner caps below the playing surface.
    for (const cz of [-8, 8]) {
      p.pipe([side * 12.2, -0.7, cz], [side * 12.7, -3.15, cz + 0.45], 0.31, '#78729c');
      p.ball([side * 12.7, -3.18, cz + 0.45], [0.5, 0.22, 0.5], night);
    }
  }
}
export function courseBackdrop(layout, p) {
  if (layout.belts) dockBackdrop(p);
  else pinballBackdrop(p);
}
function dockInk(layout, p) {
  for (const side of [-1, 1]) {
    // Plank seams stop at the rim of each glass hatch.
    for (let i = -10; i <= 10; i++) {
      const z = i * 1.08,
        outer = Math.min(16.9, 16.9 - Math.max(0, Math.abs(z) - 9.7));
      const [gx, gz] = layout.glass.find(([x]) => Math.sign(x) === side);
      const spans =
        Math.abs(z - gz) < GLASS_HALF + 0.16
          ? [
              [3.71, Math.abs(gx) - 1.18],
              [Math.abs(gx) + 1.18, outer],
            ]
          : [[3.71, outer]];
      for (const [a, b] of spans) stripe(p, side * a, z, side * b, z, 0.039, '#bd895f', 0.012);
      if (i % 2 === 0) stripe(p, side * 15.1, z + 0.42, side * 15.8, z + 0.42, 0.065, '#ffdcaa');
    }
    for (const z of [-6.4, -4.5, 4.5, 6.4])
      stripe(p, side * 3.82, z - 0.38, side * 3.82, z + 0.38, 0.21, cream);
    // Painted loading bays and compact mooring stripes.
    for (const z of [-7.9, 7.9]) {
      if (Math.sign(z) === side) continue;
      for (const dx of [-1.4, 1.4])
        stripe(p, side * 12.3 + dx, z - 1.25, side * 12.3 + dx, z + 1.25, 0.1, cream);
      for (const dz of [-1.25, 1.25])
        stripe(p, side * 12.3 - 1.4, z + dz, side * 12.3 + 1.4, z + dz, 0.1, cream);
    }
  }
  layout.decks.slice(2).forEach((poly, i) => {
    const [x, z] = poly[0],
      [, , end] = poly,
      middle = i === 1;
    for (let cx = x + 0.25; cx < end[0]; cx += 0.7)
      stripe(p, cx, z + 0.1, cx, end[1] - 0.1, middle ? 0.055 : 0.075, middle ? '#66918e' : '#ab764f');
    for (const edge of [z + 0.17, end[1] - 0.17]) {
      stripe(p, x, edge, end[0], edge, 0.2, navy, 0.023);
      for (let cx = x + 0.4; cx < end[0]; cx += 1.06)
        stripe(p, cx - 0.19, edge, cx + 0.19, edge, 0.195, yellow, 0.025);
    }
  });
  for (const b of layout.belts) {
    const { x, z, halfX: w, halfZ: h } = b;
    p.paint(rectangle(x, z, w * 2 + 0.52, h * 2 + 0.32), 0.026, navy);
    p.paint(rectangle(x, z, w * 2, h * 2), 0.031, '#3e7880');
    for (let j = -6; j <= 6; j += 2)
      for (const side of [-1, 1]) p.paint(rectangle(x + side * (w + 0.12), z + j, 0.13, 0.59), 0.037, yellow);
  }
}
function pinballInk(layout, p) {
  const outline = layout.decks[0];
  for (const [scale, width, c] of [
    [0.972, 0.17, aqua],
    [0.935, 0.068, '#a58cda'],
  ]) {
    const points = outline.map(([x, z]) => [x * scale, z * scale]);
    // The drain opens toward the player. Offset its two inside edges toward solid deck.
    for (const i of [7, 8, 9, 10]) {
      points[i][0] = outline[i][0] + Math.sign(outline[i][0]) * (1 - scale) * 9;
      points[i][1] = outline[i][1] - (1 - scale) * 10;
    }
    for (let i = 0; i < points.length; i++)
      stripe(p, ...points[i], ...points[(i + 1) % points.length], width, c);
  }
  for (const side of [-1, 1]) {
    const mirror = (pts) => pts.map(([x, z]) => [side * x, z]);
    // Flat flipper inlays direct the eye toward the open drain.
    p.paint(
      mirror([
        [3.45, 9.95],
        [8.8, 8.25],
        [10, 8.6],
        [10.2, 9.65],
        [9.4, 10.65],
        [3.67, 10.68],
      ]),
      0.018,
      pink,
    );
    stripe(p, side * 4.1, 10.2, side * 8.9, 9.12, 0.17, cream, 0.023);
    for (let i = 0; i < 3; i++) {
      const x = side * (12.38 - i * 0.45),
        z = 2.5 + i * 1.25;
      p.paint(
        [
          [x - 0.38, z - 0.35],
          [x + 0.38, z - 0.35],
          [x, z + 0.48],
        ],
        0.02,
        yellow,
      );
    }
    for (let i = 0; i < 4; i++)
      star(
        p,
        side * (7.6 + i * 1.25),
        -12.3 + (i % 2) * 0.68,
        i % 2 ? 0.24 : 0.38,
        0.021,
        i % 2 ? pink : aqua,
      );
  }
  // An enamel shooting star and speed trails at centre field.
  const bolt = [
    [-0.15, -2.8],
    [2.15, -2.8],
    [0.72, -0.73],
    [2.22, -0.73],
    [-1.9, 3.18],
    [-0.58, 0.64],
    [-2.04, 0.64],
  ];
  p.paint(
    bolt.map(([x, z]) => [x + 0.21, z + 0.18]),
    0.014,
    '#29294e',
  );
  p.paint(bolt, 0.019, yellow);
  for (const [x, z, s] of [
    [-2.9, -2.1, 0.62],
    [2.9, 1.8, 0.47],
    [-3.2, 2.5, 0.31],
    [3.3, -3.5, 0.28],
  ])
    star(p, x, z, s, 0.019, aqua);
  for (const [x, z] of layout.bumpers) {
    p.ring(x, z, 1.49, 1.59, 0.021, '#b794e3');
    p.ring(x, z, 1.84, 1.89, 0.019, '#7472ad');
  }
}
export function courseInk(layout, p) {
  if (layout.belts) dockInk(layout, p);
  else pinballInk(layout, p);
}
export const beltChevron = [
  [-1.08, -0.33],
  [0, 0.23],
  [1.08, -0.33],
  [1.08, 0.02],
  [0, 0.59],
  [-1.08, 0.02],
];
export function beltTreads(b, offset, mark) {
  const length = 2 * b.halfZ;
  for (let i = 0; i < length / BELT_PITCH; i++) {
    const dz = b.direction * (((i * BELT_PITCH + 1 + offset) % length) - b.halfZ);
    // The tread tips fold under the roller rather than painting outside the belt.
    mark(i, b.z + dz, Math.min(1, (b.halfZ - Math.abs(dz)) / 0.62));
  }
}
export function beltEndCaps(b, p) {
  for (const side of [-1, 1]) {
    p.paint(rectangle(b.x, b.z + side * b.halfZ, 2 * b.halfX + 0.32, 0.36), 0.052, '#375967');
    stripe(p, b.x - b.halfX, b.z + side * b.halfZ, b.x + b.halfX, b.z + side * b.halfZ, 0.095, yellow, 0.057);
  }
}
export function bumperModel(p, x, z, index) {
  const color = [pink, aqua, yellow, pink, aqua][index];
  for (const [i, [y, h, r]] of BUMPER_LOBES.entries())
    p.ball([x, y, z], [r, h, r], [violet, '#d6e3f5', color][i]);
  p.ring(x, z, 0.81, 1.06, 1.27, cream);
  p.ball([x, 1.39, z], [0.58, 0.075, 0.58], night);
  star(p, x, z, 0.4, 1.468, cream);
}

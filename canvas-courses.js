import { beltOffset } from './arena-geometry.js';
import {
  courseColors,
  courseBackdrop,
  courseInk,
  beltChevron,
  beltTreads,
  beltEndCaps,
  bumperModel,
} from './assets/courses.js';

const cache = new WeakMap();
const tint = (color, k) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.min(255, Math.round(parseInt(color.slice(i, i + 2), 16) * k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
function capture(build) {
  const shapes = [];
  const face = (pts, c) => {
    const at = pts.reduce((sum, v) => sum.map((n, i) => n + v[i]), [0, 0, 0]).map((n) => n / pts.length);
    shapes.push({ at, pts, c });
  };
  const pen = {
    paint: (pts, y, c) =>
      face(
        pts.map(([x, z]) => [x, y, z]),
        c,
      ),
    pipe: (a, b, r, c) => shapes.push({ at: a.map((v, i) => (v + b[i]) / 2), a, b, r, c }),
    ball: (at, r, c) => shapes.push({ at, r, c }),
    box([x, y, z], [w, h, d], c) {
      const corners = Array.from({ length: 8 }, (_, i) => [
        x + (i & 1 ? 0.5 : -0.5) * w,
        y + (i & 2 ? 0.5 : -0.5) * h,
        z + (i & 4 ? 0.5 : -0.5) * d,
      ]);
      [
        [0, 1, 5, 4],
        [0, 2, 3, 1],
        [4, 5, 7, 6],
        [0, 4, 6, 2],
        [1, 3, 7, 5],
        [2, 6, 7, 3],
      ].forEach((side, i) =>
        face(
          side.map((j) => corners[j]),
          tint(c, [0.65, 0.8, 0.91, 0.76, 0.86, 1.05][i]),
        ),
      );
    },
    ring(x, z, inner, outer, y, c) {
      const at = (a, r) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
      for (let i = 0; i < 28; i++) {
        const a = (i * Math.PI) / 14,
          b = ((i + 1) * Math.PI) / 14;
        face([at(a, inner), at(a, outer), at(b, outer), at(b, inner)], c);
      }
    },
  };
  build(pen);
  return shapes;
}
function model(layout) {
  if (cache.has(layout)) return cache.get(layout);
  const colors = courseColors(layout);
  const backdrop = capture((p) => courseBackdrop(layout, p));
  const sides = [],
    tops = [];
  layout.decks.forEach((poly, i) => {
    const top = poly.map(([x, z]) => [x, 0, z]),
      depth = i < 2 ? 1.12 : 0.52;
    for (let j = 0; j < poly.length; j++) {
      const a = top[j],
        b = top[(j + 1) % poly.length];
      const low = (v) => [v[0], -depth, v[2]];
      sides.push({
        at: a.map((v, k) => (v + b[k]) / 2),
        pts: [a, b, low(b), low(a)],
        c: j % 2 ? colors.hull : colors.base,
      });
    }
    tops.push({ pts: top, c: layout.belts && i >= 2 ? (i === 3 ? colors.bridge : '#d5a375') : colors.top });
  });
  const m = {
    water: backdrop.filter((o) => o.at[1] < -3.7),
    scenery: backdrop.filter((o) => o.at[1] >= -3.7),
    sides,
    tops,
    ink: capture((p) => courseInk(layout, p)),
    caps: capture((p) => layout.belts?.forEach((b) => beltEndCaps(b, p))),
    bumpers: (layout.bumpers || []).map(([x, z], i) => capture((p) => bumperModel(p, x, z, i))),
  };
  cache.set(layout, m);
  return m;
}
export function drawCanvasCourse(layout, t, { face, line, ball, depth, queue }) {
  const draw = (o) => (o.pts ? face(o.pts, o.c) : o.a ? line(o.a, o.b, o.c, o.r * 2) : ball(o.at, o.r, o.c));
  const sorted = (list) =>
    list
      .map((o) => [o, depth(o.at)])
      .sort((a, b) => b[1] - a[1])
      .forEach(([o]) => draw(o));
  const m = model(layout);
  m.water.forEach(draw);
  sorted(m.scenery);
  sorted(m.sides);
  m.tops.forEach(draw);
  m.ink.forEach(draw);
  for (const b of layout.belts || [])
    beltTreads(b, beltOffset(t), (_, z, scale) => {
      face(
        beltChevron.map(([dx, dz]) => [b.x + dx, 0.043, z + dz * b.direction * scale]),
        '#a2ffdc',
      );
    });
  m.caps.forEach(draw);
  layout.bumpers?.forEach(([x, z], i) => queue([x, 0.8, z], () => m.bumpers[i].forEach(draw)));
}

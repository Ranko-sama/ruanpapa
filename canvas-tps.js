import { GLASS_HALF, GLASS_CRACKS, hasFloorAt } from './arena-geometry.js';
import { jellyShape } from './jelly.js';
import { drawCanvasCourse } from './canvas-courses.js';

const TAU = 2 * Math.PI;
const dye = {
  cloud: ['#69dbda', '#e05f92', '#ffe276', '#459bad'],
  soda: ['#ffa5b2', '#38a899', '#fff1ba', '#d97892'],
  orbit: ['#b7a9ea', '#6574bb', '#8bead9', '#867bc3'],
};
const circle = (x, y, z, r, n = 48) =>
  Array.from({ length: n }, (_, i) => [x + Math.cos((i * TAU) / n) * r, y, z + Math.sin((i * TAU) / n) * r]);
const square = (x, y, z, half) => [
  [x - half, y, z - half],
  [x + half, y, z - half],
  [x + half, y, z + half],
  [x - half, y, z + half],
];

// Cut a real aperture out of the stage paint. Clip the shaft walls to its mouth so
// both the top-down and the close camera see the same opening as the simulation.
export function drawFlatGlass(d, x, z, tile, face, line) {
  const mouth = square(x, 0.024, z, GLASS_HALF);
  face(square(x, 0.02, z, GLASS_HALF + 0.1), '#384c69');
  if (tile.down > 0) {
    d.save();
    d.globalCompositeOperation = 'destination-out';
    const visible = face(mouth, '#000');
    d.restore();
    if (visible) {
      d.save();
      d.clip();
      const deep = square(x, -1.8, z, GLASS_HALF);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        face([mouth[i], mouth[j], deep[j], deep[i]], ['#344368', '#263956', '#53677e', '#43536c'][i]);
      }
      d.restore();
    }
  } else {
    face(mouth, tile.warn > 0 ? (Math.cos(tile.warn * 12) > 0 ? '#ffc252' : '#ff9165') : '#a7e7f1');
    if (tile.warn > 0) {
      for (const points of GLASS_CRACKS)
        for (let i = 1; i < points.length; i++) {
          const [ax, az] = points[i - 1],
            [bx, bz] = points[i];
          line([x + ax, 0.033, z + az], [x + bx, 0.033, z + bz], '#642843', 0.045);
        }
    } else line([x - 0.6, 0.035, z + 0.43], [x + 0.04, 0.035, z - 0.54], '#e8ffff', 0.075);
  }
  const edge = GLASS_HALF + 0.05;
  for (const sign of [-1, 1])
    for (const along of [-0.72, 0, 0.72]) {
      line(
        [x + along - 0.1, 0.036, z + sign * edge],
        [x + along + 0.1, 0.036, z + sign * edge],
        '#ffda66',
        0.068,
      );
      line(
        [x + sign * edge, 0.036, z + along - 0.1],
        [x + sign * edge, 0.036, z + along + 0.1],
        '#ffda66',
        0.068,
      );
    }
}

// The no-WebGL path uses the live camera matrix too. Clip deck polygons in eye space
// before projecting, since the camera can be directly above or inside their footprint.
export function drawPerspectiveArena(flat, camera, f, config, effects) {
  const { d, w, h, layout } = flat,
    m = camera.matrixWorldInverse.elements;
  const ortho = camera.isOrthographicCamera,
    focal = ortho ? h / (camera.top - camera.bottom) : (0.5 * h) / Math.tan((camera.fov * Math.PI) / 360),
    near = camera.near;
  const [deck, hull, trim, mark] = dye[config.map] || [];
  const eye = ([x, y, z]) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    -(m[2] * x + m[6] * y + m[10] * z + m[14]),
  ];
  const scaleAt = (z) => (ortho ? focal : focal / z);
  const screen = ([x, y, z]) => [w / 2 + x * scaleAt(z), h / 2 - y * scaleAt(z)];
  function nearPoint(a, b) {
    const t = (near - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near];
  }
  function face(coords, color) {
    const vertices = coords.map(eye),
      clipped = [];
    let prev = vertices.at(-1);
    for (const p of vertices) {
      if (prev[2] >= near !== p[2] >= near) clipped.push(nearPoint(prev, p));
      if (p[2] >= near) clipped.push(p);
      prev = p;
    }
    if (clipped.length < 3) return false;
    d.fillStyle = color;
    d.beginPath();
    clipped.forEach((p, i) => {
      const [x, y] = screen(p);
      if (i === 0) d.moveTo(x, y);
      else d.lineTo(x, y);
    });
    d.closePath();
    d.fill();
    return true;
  }
  function line(a, b, color, width) {
    let p = eye(a),
      q = eye(b);
    if (p[2] < near && q[2] < near) return;
    if (p[2] < near) p = nearPoint(p, q);
    else if (q[2] < near) q = nearPoint(p, q);
    d.strokeStyle = color;
    d.lineCap = 'round';
    d.lineWidth = Math.min(h, width * scaleAt((p[2] + q[2]) * 0.5));
    d.beginPath();
    d.moveTo(...screen(p));
    d.lineTo(...screen(q));
    d.stroke();
  }
  function band(x, y, z, r, thickness, color) {
    const outer = circle(x, y, z, r),
      inner = circle(x, y, z, r - thickness);
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      face([outer[i], outer[j], inner[j], inner[i]], color);
    }
  }
  d.clearRect(0, 0, w, h);
  const jobs = [];
  const queue = (pos, draw) => {
    const p = eye(pos);
    if (p[2] > near) jobs.push({ p, draw });
  };
  if (layout.decks) {
    const ball = (at, [rx, ry, rz], color) => {
      const p = eye(at);
      if (p[2] <= near) return;
      const [x, y] = screen(p),
        u = scaleAt(p[2]);
      const a = Math.hypot(m[0] * rx, m[4] * ry, m[8] * rz) * u,
        b = Math.hypot(m[1] * rx, m[5] * ry, m[9] * rz) * u;
      if (x + a < 0 || x - a > w || y + b < 0 || y - b > h) return;
      d.fillStyle = color;
      d.beginPath();
      d.ellipse(x, y, a, b, 0, 0, TAU);
      d.fill();
    };
    drawCanvasCourse(layout, f.t, { face, line, ball, queue, depth: (v) => eye(v)[2] });
  } else {
    const scale = layout.scale,
      rim = circle(0, 0, 0, layout.radius),
      bottom = circle(0, -1.05, 0, 7.95 * scale);
    const sides = rim.map((v, i) => ({ i, depth: eye(v)[2] })).sort((a, b) => b.depth - a.depth);
    for (const { i } of sides) {
      const j = (i + 1) % rim.length;
      face([bottom[i], bottom[j], rim[j], rim[i]], hull);
    }
    face(rim, deck);
    const inside = circle(0, 0, 0, 7.45 * scale);
    for (let i = 0; i < rim.length; i++) {
      const j = (i + 1) % rim.length;
      face([inside[i], rim[i], rim[j], inside[j]], i % 4 < 2 ? trim : '#fff7dc');
    }
    band(0, 0.012, 0, 6.95 * scale, 0.035 * scale, '#fff4d2');
    band(0, 0.013, 0, 4.92, 0.045, mark);
    if (scale > 1) band(0, 0.013, 0, 5.96 * scale, 0.045 * scale, mark);
    for (let i = 0; i < 24; i++) {
      const a = (i * TAU) / 24,
        x = Math.cos(a),
        z = Math.sin(a);
      line(
        [7.25 * scale * x, 0.015, 7.25 * scale * z],
        [7.48 * scale * x, 0.015, 7.48 * scale * z],
        '#fff8d9',
        0.065,
      );
    }
  }
  layout.glass.forEach(([x, z], i) => drawFlatGlass(d, x, z, f.glass[i], face, line));
  if (config.mode === 'zone')
    band(0, 0.03, 0, layout.zoneRadius, 0.12, ['#4ce8ef', '#ff8ea9'][f.obj.zone] || '#ffed8d');
  if (config.mode === 'flag')
    for (let i = 0; i < 2; i++)
      band(i ? layout.flagX : -layout.flagX, 0.03, 0, 1.12, 0.14, i ? '#ff86ae' : '#45ddef');
  if (config.mode === 'cart')
    line([-layout.cartEnd - 0.2, 0.04, 1], [layout.cartEnd + 0.2, 0.04, 1], '#fff3ad', 0.15);
  for (const a of f.actors) {
    if (a.dead > 0 || (a.y < -0.9 && hasFloorAt(layout, f.glass, a.x, a.z))) continue;
    if (a.y >= 0 && hasFloorAt(layout, f.glass, a.x, a.z)) {
      face(circle(a.x, 0.035, a.z, 0.69, 16), '#53506c38');
      if (a.human) band(a.x, 0.045, a.z, 0.82, 0.075, a.id === 0 ? '#f4ff65' : '#ffabd9');
    }
    queue([a.x, a.y + 1.16, a.z], (x, y, u) => {
      const angle = (ortho ? 0 : Math.atan2(camera.position.x - a.x, camera.position.z - a.z)) - a.yaw;
      d.save();
      const t = f.t + a.id * 0.6,
        shape = jellyShape(a, t),
        footPivot = (1.16 - 0.25) * u;
      const cameraRight = camera.matrixWorld.elements;
      const lean = shape.leanX * cameraRight[0] + shape.leanZ * cameraRight[2];
      flat.bendBackground(
        x + lean * footPivot,
        y + footPivot * (1 - shape.height),
        0.59 * u * shape.width,
        0.73 * u * shape.height,
      );
      d.translate(x, y + footPivot - Math.abs(Math.sin(t * 12)) * a.speed * u * 0.06);
      d.rotate(Math.sin(f.t * 9) * a.tumble * 0.19);
      d.transform(shape.width, 0, -lean, shape.height, 0, 0);
      d.translate(0, -footPivot);
      flat.drawFighter(a, angle, u);
      d.restore();
    });
  }
  for (const p of f.props)
    if (p.dead <= 0)
      queue([p.x, p.y + 0.46, p.z], () => flat.drawBlock(p, f.t, face, (point) => eye(point)[2]));
  if (layout.rotor) {
    const bx = Math.cos(f.angle),
      bz = Math.sin(f.angle);
    for (let i = 0; i < 18; i++) {
      const a = -4.6 + (i * 9.2) / 18,
        b = a + 9.2 / 18;
      queue([((a + b) / 2) * bx, 0.52, ((a + b) / 2) * bz], () =>
        line([a * bx, 0.52, a * bz], [b * bx, 0.52, b * bz], i % 3 === 0 ? trim : '#f77c98', 0.4),
      );
    }
    queue([0, 0.38, 0], () => {
      face(circle(0, 0.41, 0, 0.55, 24), trim);
    });
  }
  function token(x, y, z, s) {
    queue([x, y, z], (sx, sy, u) => {
      d.textAlign = 'center';
      d.font = Math.min(h, 1.05 * u) + 'px sans-serif';
      d.fillText(s, sx, sy);
    });
  }
  if (config.mode === 'cart') token(f.obj.cart, 1.1, 1, '🛒');
  if (config.mode === 'flag')
    f.obj.flags.forEach((p) =>
      token(p.x, p.carrier >= 0 ? f.actors[p.carrier].y + 2.6 : 1.55, p.z, p.team ? '🚩' : '🏳️'),
    );
  if (config.mode === 'king') {
    const p = f.obj.crown;
    token(p.x, p.carrier >= 0 ? f.actors[p.carrier].y + 2.85 : 0.85, p.z, '👑');
  }
  for (const p of [...f.shots, ...effects])
    queue([p.x, p.y, p.z], (sx, sy, u) => {
      d.fillStyle = '#fff28d';
      d.beginPath();
      d.arc(sx, sy, Math.min(h, 0.12 * u), 0, TAU);
      d.fill();
    });
  jobs.sort((a, b) => b.p[2] - a.p[2]);
  for (const { p, draw } of jobs) draw(...screen(p), scaleAt(p[2]));
}

import * as THREE from './three.module.min.js';
import {
  ARENA,
  layoutFor,
  inPolygon,
  beltOffset,
  GLASS_HALF,
  GLASS_CRACKS,
  SWEEPER_HEIGHT,
  SWEEPER_TIP,
} from '../arena-geometry.js';
import {
  courseColors,
  courseBackdrop,
  courseInk,
  beltChevron,
  beltTreads,
  beltEndCaps,
  bumperModel,
} from './courses.js';

const TAU = Math.PI * 2;
const ORIGIN = [0, 0, 0];
const UNIT = [1, 1, 1];
const BOX = new THREE.BoxGeometry();
const BALL = new THREE.SphereGeometry(1, 16, 10);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 24);
const UP = new THREE.Vector3(0, 1, 0);
const glassAmber = new THREE.Color('#ffbf4d'),
  glassCoral = new THREE.Color('#ff875c');

const THEMES = {
  cloud: {
    mat: '#54d9db',
    lane: '#31bac8',
    ink: '#e3ffeb',
    line: '#9bf1de',
    rubber: '#f56699',
    piping: '#c65081',
    belt: '#5563ad',
    bottom: '#39447e',
    rimA: '#ffd14c',
    rimB: '#fff5d8',
    seam: '#ce954f',
    lamp: '#94f4df',
    post: '#278eaf',
    arm: '#ff6f8a',
    wrap: '#ffdb5b',
    glass: '#8ce9f0',
    well: '#225376',
    numeral: 1,
  },
  soda: {
    mat: '#ff9faa',
    lane: '#ec778a',
    ink: '#fff4da',
    line: '#ffc6bb',
    rubber: '#42c9bb',
    piping: '#258f98',
    belt: '#e44c74',
    bottom: '#9a4277',
    rimA: '#ff596d',
    rimB: '#fff1d1',
    seam: '#b94d64',
    lamp: '#ffde68',
    post: '#bc4671',
    arm: '#28bdb9',
    wrap: '#fff3a4',
    glass: '#9ce4de',
    well: '#74526a',
    numeral: 2,
  },
  orbit: {
    mat: '#afa6ec',
    lane: '#9081d6',
    ink: '#f7f0ff',
    line: '#d0c9f5',
    rubber: '#6976cc',
    piping: '#4b5099',
    belt: '#39497f',
    bottom: '#293963',
    rimA: '#7ee4d3',
    rimB: '#e2d9ff',
    seam: '#716fb5',
    lamp: '#8affde',
    post: '#5b579c',
    arm: '#fc966b',
    wrap: '#ffe58d',
    glass: '#98dded',
    well: '#463f73',
    numeral: 3,
  },
};

// All fixed parts share one indexed mesh. Moving assemblies each get their own batch.
class Batch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
    this.matrix = new THREE.Matrix4();
    this.normalMatrix = new THREE.Matrix3();
    this.pos = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.vertex = new THREE.Vector3();
    this.tint = new THREE.Color();
  }

  add(geometry, color, center = ORIGIN, size = UNIT, rotation) {
    this.q.identity();
    if (Array.isArray(rotation)) this.q.setFromEuler(this.euler.set(...rotation));
    else if (rotation) this.q.copy(rotation);
    this.matrix.compose(this.pos.fromArray(center), this.q, this.scale.fromArray(size));
    this.normalMatrix.getNormalMatrix(this.matrix);
    this.tint.set(color);
    const offset = this.positions.length / 3;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      this.vertex.fromBufferAttribute(position, i).applyMatrix4(this.matrix);
      this.positions.push(this.vertex.x, this.vertex.y, this.vertex.z);
      this.vertex.fromBufferAttribute(normal, i).applyNormalMatrix(this.normalMatrix);
      this.normals.push(this.vertex.x, this.vertex.y, this.vertex.z);
      this.colors.push(this.tint.r, this.tint.g, this.tint.b);
    }
    const index = geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) this.indices.push(offset + index.getX(i));
    } else {
      for (let i = 0; i < position.count; i++) this.indices.push(offset + i);
    }
  }

  mesh(name, surface) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

function box(batch, center, size, color, rotation) {
  batch.add(BOX, color, center, size, rotation);
}

function ball(batch, center, radius, color) {
  batch.add(BALL, color, center, Array.isArray(radius) ? radius : [radius, radius, radius]);
}

function drum(batch, x, y, z, radius, height, color) {
  batch.add(CYLINDER, color, [x, y, z], [radius, height, radius]);
}

function pipe(batch, a, b, radius, color) {
  const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = direction.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
  const center = a.map((p, i) => (p + b[i]) / 2);
  batch.add(CYLINDER, color, center, [radius, length, radius], q);
}

function tyre(batch, radius, tube, y, yScale, color, angle = 0, arc = TAU) {
  const geometry = new THREE.TorusGeometry(radius, tube, 10, Math.max(4, Math.ceil((100 * arc) / TAU)), arc);
  geometry.rotateX(Math.PI / 2).rotateY(-angle);
  batch.add(geometry, color, [0, y, 0], [1, yScale, 1]);
}

function ring(batch, inner, outer, y, color, start = 0, arc = TAU, x = 0, z = 0) {
  const geometry = new THREE.RingGeometry(
    inner,
    outer,
    Math.max(6, Math.ceil((100 * arc) / TAU)),
    1,
    -start - arc,
    arc,
  );
  geometry.rotateX(-Math.PI / 2);
  batch.add(geometry, color, [x, y, z]);
}

function shell(batch, profile, color) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    96,
  );
  batch.add(geometry, color);
}

function cutHatches(floor, glass) {
  for (const [x, z] of glass) {
    const hole = new THREE.Path();
    hole.moveTo(x - GLASS_HALF, -z - GLASS_HALF);
    hole.lineTo(x - GLASS_HALF, -z + GLASS_HALF);
    hole.lineTo(x + GLASS_HALF, -z + GLASS_HALF);
    hole.lineTo(x + GLASS_HALF, -z - GLASS_HALF);
    hole.closePath();
    floor.holes.push(hole);
  }
  return floor;
}
function panelGeometry(layout, radius) {
  const floor = new THREE.Shape();
  floor.absarc(0, 0, radius, 0, TAU, false);
  cutHatches(floor, layout.glass);
  return new THREE.ShapeGeometry(floor, 50).rotateX(-Math.PI / 2);
}

function chevron(batch, angle, distance, width, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.2);
  shape.lineTo(0, 0.19);
  shape.lineTo(0.5, -0.2);
  shape.lineTo(0.5, -0.02);
  shape.lineTo(0, 0.38);
  shape.lineTo(-0.5, -0.02);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  batch.add(
    geometry,
    color,
    [Math.cos(angle) * distance, 0.017, Math.sin(angle) * distance],
    [width, 1, width],
    [0, Math.PI / 2 - angle, 0],
  );
}

function deck(batch, t, layout) {
  const s = layout.scale;
  batch.add(panelGeometry(layout, 7.61 * s), t.mat);
  const underside = panelGeometry(layout, 6.65 * s);
  const ix = underside.index.array;
  for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
  underside.computeVertexNormals();
  batch.add(underside, t.bottom, [0, -1.82, 0]);
  ring(batch, 6.9 * s, 7.2 * s, 0.007, t.line);
  ring(batch, 6.77 * s, 6.81 * s, 0.009, t.lane);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    ring(batch, 5.94 * s, 5.98 * s, 0.007, t.line, a + 0.12, 0.54);
    if (i % 2) continue;
    for (let j = -2; j <= 2; j++) {
      const angle = a + j * 0.058;
      ring(batch, (j === 0 ? 6.29 : 6.47) * s, 6.64 * s, 0.014, t.ink, angle - 0.009, 0.018);
    }
    chevron(batch, a, 5.53 * s, 0.74, t.line);
    chevron(batch, a, 5.23 * s, 0.74, t.line);
  }
  ring(batch, 1.23, 1.29, 0.01, t.ink);
  ring(batch, 1.46, 1.49, 0.009, t.line);
  for (let i = 0; i < 6; i++) ring(batch, 2.62, 2.66, 0.009, t.line, (i * TAU) / 6 + 0.08, 0.72);
  if (s > 1) for (let i = 0; i < 24; i++) ring(batch, 4.96, 5.02, 0.012, t.line, (i * TAU) / 24, 0.15);
}

// The number plate is moulded into the visible front lip.
function serialPlate(batch, t) {
  const z = 7.83;
  box(batch, [0, -0.96, z], [1.58, 0.43, 0.11], t.bottom);
  for (const side of [-1, 1]) {
    ball(batch, [side * 0.76, -0.96, z], [0.13, 0.215, 0.06], t.bottom);
    ball(batch, [side * 0.65, -0.96, z + 0.068], [0.044, 0.044, 0.015], t.lamp);
  }
  const bars = [
    [0, 0.123, 0.166, 0.033],
    [0.085, 0.064, 0.034, 0.115],
    [0.085, -0.066, 0.034, 0.115],
    [0, -0.126, 0.166, 0.033],
    [-0.085, -0.066, 0.034, 0.115],
    [-0.085, 0.064, 0.034, 0.115],
    [0, 0, 0.156, 0.032],
  ];
  const digits = [
    [0, 1, 2, 3, 4, 5],
    [
      [1, 2],
      [0, 1, 6, 4, 3],
      [0, 1, 2, 3, 6],
    ][t.numeral - 1],
  ];
  digits.forEach((segments, i) => {
    for (const s of segments) {
      const [dx, dy, w, h] = bars[s];
      box(batch, [(i - 0.5) * 0.28 + dx, -0.96 + dy, z + 0.063], [w, h, 0.017], t.ink);
    }
  });
}

function hull(batch, t) {
  shell(
    batch,
    [
      [6.65, -1.82],
      [7.26, -1.55],
      [7.53, -1.32],
    ],
    t.bottom,
  );
  tyre(batch, 7.17, 0.32, -1.43, 0.72, t.belt);
  shell(
    batch,
    [
      [6.82, -1.52],
      [7.28, -1.46],
      [7.65, -1.29],
      [7.82, -1.04],
      [7.84, -0.84],
      [7.7, -0.56],
      [7.4, -0.4],
      [7.13, -0.35],
    ],
    t.rubber,
  );
  tyre(batch, 7.61, 0.075, -1.27, 0.7, t.piping);
  tyre(batch, 7.66, 0.13, -0.57, 0.7, t.piping);
  tyre(batch, 7.62, 0.405, -0.31, 0.81, t.seam);
  const pieces = 20;
  for (let i = 0; i < pieces; i++) {
    const start = (i * TAU) / pieces;
    tyre(batch, 7.62, 0.427, -0.3, 0.82, i % 2 === 0 ? t.rimA : t.rimB, start + 0.0035, TAU / pieces - 0.007);
  }
  tyre(batch, 7.18, 0.042, 0.003, 0.64, t.ink);

  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) * TAU) / 12;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    const rotation = [0, Math.PI / 2 - a, 0];
    box(batch, [7.82 * ca, -0.88, 7.82 * sa], [0.59, 0.14, 0.055], t.piping, rotation);
    box(batch, [7.858 * ca, -0.866, 7.858 * sa], [0.38, 0.052, 0.026], t.rimB, rotation);
    if (i % 2 === 0) {
      box(batch, [7.0 * ca, -1.68, 7.0 * sa], [0.62, 0.18, 0.15], t.belt, rotation);
      box(batch, [7.09 * ca, -1.66, 7.09 * sa], [0.37, 0.061, 0.04], t.lamp, rotation);
    }
  }
  serialPlate(batch, t);
}

function tileWell(batch, x, z, t) {
  const edge = GLASS_HALF + 0.045,
    span = 2 * edge + 0.09;
  for (const s of [-1, 1]) {
    box(batch, [x, -0.9, z + s * edge], [span, 1.8, 0.09], t.well);
    box(batch, [x + s * edge, -0.9, z], [0.09, 1.8, span], t.post);
    box(batch, [x, 0.009, z + s * edge], [span, 0.025, 0.09], t.post);
    box(batch, [x + s * edge, 0.009, z], [0.09, 0.025, span], t.post);
    for (let i = -2; i <= 2; i++) {
      box(batch, [x + i * 0.4, 0.024, z + s * edge], [0.17, 0.012, 0.09], '#ffd659');
      box(batch, [x + s * edge, 0.024, z + i * 0.4], [0.09, 0.012, 0.17], '#ffd659');
    }
  }
}

function glassTile(x, z, t) {
  const b = new Batch();
  box(b, [0, -0.045, 0], [2 * GLASS_HALF, 0.09, 2 * GLASS_HALF], t.glass);
  for (const s of [-1, 1]) {
    box(b, [0, -0.003, s * 0.944], [1.88, 0.022, 0.028], t.ink);
    box(b, [s * 0.944, -0.003, 0], [0.028, 0.022, 1.88], t.ink);
    for (const j of [-1, 1]) drum(b, s * 0.84, 0.008, j * 0.84, 0.038, 0.023, t.post);
  }
  box(b, [-0.24, 0.005, 0.03], [0.11, 0.014, 1.3], t.ink, [0, -0.63, 0]);
  box(b, [0.03, 0.005, 0.08], [0.05, 0.014, 0.84], t.ink, [0, -0.63, 0]);
  const mesh = b.mesh(
    'Breakaway glass',
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28 }),
  );
  mesh.position.set(x, 0, z);
  const lines = new Batch();
  for (const points of GLASS_CRACKS)
    for (let i = 1; i < points.length; i++) {
      const [x0, z0] = points[i - 1],
        [x1, z1] = points[i];
      pipe(lines, [x0, 0.026, z0], [x1, 0.026, z1], 0.024, '#642843');
    }
  const cracks = lines.mesh('Glass warning cracks', new THREE.MeshBasicMaterial({ vertexColors: true }));
  cracks.castShadow = false;
  cracks.visible = false;
  mesh.add(cracks);
  mesh.userData.cracks = cracks;
  mesh.userData.intactMaterial = mesh.material;
  mesh.userData.warningMaterial = new THREE.MeshBasicMaterial();
  return mesh;
}

function sweepArm(t, surface) {
  const b = new Batch();
  drum(b, 0, 0.55, 0, 0.62, 0.45, t.post);
  drum(b, 0, 0.77, 0, 0.66, 0.14, t.wrap);
  ball(b, [0, 0.819, 0], [0.55, 0.15, 0.55], t.arm);
  drum(b, 0, 0.968, 0, 0.09, 0.024, t.ink);
  for (const side of [-1, 1]) {
    const at = (x) => [side * x, SWEEPER_HEIGHT, 0];
    pipe(b, at(0.35), at(4.43), 0.195, t.arm);
    for (const x of [0.73, 1.55, 2.4, 3.25]) {
      pipe(b, at(x), at(x + 0.25), x === 0.73 ? 0.25 : 0.206, t.wrap);
    }
    pipe(b, at(3.9), at(4.3), 0.29, t.arm);
    pipe(b, at(4.16), at(4.3), 0.297, t.wrap);
    ball(b, at(SWEEPER_TIP), [0.28, 0.285, 0.285], t.arm);
    ball(b, at(4.5), [0.112, 0.19, 0.19], t.ink);
  }
  return b.mesh('Soft sweep bar', surface);
}

function cloud(batch, x, y, z, s) {
  const puffs = [
    [-0.78, 0, 0.03, 0.75, 0.46, 0.47],
    [-0.17, 0.26, -0.1, 0.76, 0.67, 0.57],
    [0.42, 0.1, 0.06, 0.78, 0.52, 0.53],
    [0.99, -0.02, 0.07, 0.46, 0.36, 0.4],
  ];
  for (const [dx, dy, dz, rx, ry, rz] of puffs) {
    ball(batch, [x + dx * s, y + dy * s, z + dz * s], [rx * s, ry * s, rz * s], '#fff8ec');
  }
}

function flag(batch, x, z, dir, t) {
  drum(batch, x, -0.06, z, 0.16, 0.24, t.post);
  drum(batch, x, 0.92, z, 0.057, 2.02, t.rimB);
  ball(batch, [x, 2.0, z], 0.104, t.rimA);
  // A tapered, wavy chequered flag with separately wound front and back faces.
  const columns = 5,
    rows = 3;
  const point = (u, v) => [
    x + dir * u * 1.46,
    1.86 - 0.67 * v * (1 - 0.23 * u) + 0.06 * Math.sin(u * 6),
    z + 0.16 * Math.sin(u * 5.4),
  ];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) {
      const a = point(i / columns, j / rows),
        c = point((i + 1) / columns, (j + 1) / rows);
      const d = point(i / columns, (j + 1) / rows),
        b = point((i + 1) / columns, j / rows);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [...a, ...b, ...d, ...b, ...c, ...d, ...a, ...d, ...b, ...b, ...d, ...c],
          3,
        ),
      );
      geo.computeVertexNormals();
      batch.add(geo, (i + j) % 2 ? t.ink : t.post);
    }
}

function cloudDetails(b, t, s) {
  flag(b, -5.7 * s, -5.0 * s, -1, t);
  flag(b, 6.1 * s, -4.55 * s, 1, t);
  cloud(b, -7.95 * s, -1.7, -2.4 * s, 1.02);
  cloud(b, 6.7 * s, -1.95, -4.75 * s, 1.13);
  cloud(b, 2.95 * s, -2.48, 5.6 * s, 0.78);
}

function sodaDetails(b, t, s) {
  for (const [px, pz, dir, height] of [
    [-5.95, -4.74, -1, 1.44],
    [5.96, -4.9, 1, 2.0],
  ]) {
    const x = px * s,
      z = pz * s;
    drum(b, x, 0.03, z, 0.31, 0.16, t.bottom);
    pipe(b, [x, 0.1, z], [x, height, z], 0.15, t.rimB);
    for (let y = 0.21; y < height - 0.12; y += 0.43) {
      pipe(b, [x, y, z], [x, y + 0.16, z], 0.155, t.rimA);
    }
    const end = [x + dir * 0.68, height + 0.42, z - 0.08];
    ball(b, [x, height, z], 0.155, t.rimA);
    pipe(b, [x, height, z], end, 0.15, t.rimB);
    pipe(
      b,
      [x + dir * 0.39, height + 0.24, z - 0.046],
      [x + dir * 0.54, height + 0.334, z - 0.064],
      0.154,
      t.rimA,
    );
    pipe(b, end, [end[0] + dir * 0.009, end[1] + 0.005, end[2] - 0.001], 0.092, t.well);
  }
  for (const [px, y, pz, r] of [
    [-7.2, 0.52, -3.7, 0.26],
    [-7.55, 1.11, -3.87, 0.16],
    [6.75, 0.82, -4.13, 0.24],
    [7.12, 1.42, -4.15, 0.13],
  ]) {
    const x = px * s,
      z = pz * s;
    ball(b, [x, y, z], r, t.lamp);
    ball(b, [x - r * 0.36, y + r * 0.43, z + r * 0.71], r * 0.21, t.ink);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i * TAU) / 18;
    ball(b, [7.08 * s * Math.cos(a), -1.48, 7.08 * s * Math.sin(a)], [0.27, 0.24, 0.27], t.belt);
  }
}

function orbitDetails(b, t, s) {
  const x = -5.95 * s,
    z = -4.8 * s;
  drum(b, x, 0.045, z, 0.32, 0.19, t.post);
  pipe(b, [x, 0.12, z], [x - 0.28, 1.25, z], 0.087, t.post);
  ball(b, [x - 0.36, 1.58, z], 0.42, '#ffb285');
  const planetRing = new THREE.TorusGeometry(0.58, 0.052, 8, 36);
  b.add(planetRing, t.ink, [x - 0.36, 1.58, z], [1.22, 1, 1], [1.15, 0.12, -0.45]);
  const x2 = 6.15 * s,
    z2 = -4.48 * s;
  drum(b, x2, 0.04, z2, 0.25, 0.17, t.bottom);
  pipe(b, [x2, 0.11, z2], [x2, 1.72, z2], 0.055, t.ink);
  ball(b, [x2, 1.77, z2], 0.21, t.lamp);
  for (const y of [0.45, 0.7, 0.95]) drum(b, x2, y, z2, 0.13, 0.073, t.post);
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + 0.25;
    const px = Math.cos(a) * 5.06 * s,
      pz = Math.sin(a) * 5.06 * s;
    drum(b, px, -1.95, pz, 0.59, 0.42, t.belt);
    drum(b, px, -2.16, pz, 0.42, 0.11, t.lamp);
    ball(b, [px, -2.2, pz], [0.29, 0.16, 0.29], t.ink);
  }
}

const outline = (points) => new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
function courseTools(batch) {
  return {
    paint(points, y, color) {
      batch.add(new THREE.ShapeGeometry(outline(points)).rotateX(-Math.PI / 2), color, [0, y, 0]);
    },
    ring: (x, z, inner, outer, y, color) => ring(batch, inner, outer, y, color, 0, TAU, x, z),
    ball: (...args) => ball(batch, ...args),
    box: (...args) => box(batch, ...args),
    pipe: (...args) => pipe(batch, ...args),
  };
}
function shapedDeck(batch, layout) {
  const colors = courseColors(layout);
  for (const [i, points] of layout.decks.entries()) {
    const shape = cutHatches(
      outline(points),
      layout.glass.filter(([x, z]) => inPolygon(points, x, z)),
    );
    const depth = i < 2 ? 1.12 : 0.52;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
    batch.add(geometry, colors.hull, [0, -depth, 0]);
    const face = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    batch.add(
      face,
      layout.belts && i >= 2 ? (i === 3 ? colors.bridge : '#d5a375') : colors.top,
      [0, 0.002, 0],
    );
    for (let j = 0; j < points.length; j++) {
      const [ax, az] = points[j],
        [bx, bz] = points[(j + 1) % points.length];
      // The steel edging and lamps are below shoe height, including on a bridge seam.
      pipe(batch, [ax, -0.2, az], [bx, -0.2, bz], 0.068, layout.belts ? '#ffcf77' : '#f79edc');
      pipe(batch, [ax, -depth + 0.08, az], [bx, -depth + 0.08, bz], 0.1, colors.base);
      const n = Math.floor(Math.hypot(bx - ax, bz - az) / 2);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n,
          x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        ball(batch, [x, -depth * 0.58, z], [0.14, 0.105, 0.14], layout.belts ? '#ffe8b0' : '#8affeb');
      }
    }
  }
}
export function makeStage(map = 'cloud', layout = layoutFor({ map, arenaVersion: ARENA.version })) {
  const t = Object.hasOwn(THEMES, map) ? THEMES[map] : layout.bumpers ? THEMES.orbit : THEMES.cloud;
  const stage = new THREE.Group();
  stage.name = `Arena · ${map}`;
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.57, metalness: 0.025 });
  const fixed = new Batch();
  let rotor = null;
  const treads = [];
  if (layout.decks) {
    shapedDeck(fixed, layout);
    const p = courseTools(fixed);
    courseBackdrop(layout, p);
    courseInk(layout, p);
    if (layout.belts) {
      const arrow = new Batch();
      courseTools(arrow).paint(beltChevron, 0.043, '#a2ffdc');
      const tread = arrow.mesh('Moving belt arrow', surface);
      tread.castShadow = false;
      for (const belt of layout.belts) {
        beltEndCaps(belt, p);
        const marks = [];
        beltTreads(belt, 0, (i, z, scale) => {
          const m = tread.clone();
          m.rotation.y = belt.direction < 0 ? Math.PI : 0;
          m.position.set(belt.x, 0, z);
          m.scale.z = scale;
          marks.push(m);
          stage.add(m);
        });
        treads.push({ belt, marks });
      }
    }
    layout.bumpers?.forEach(([x, z], i) => bumperModel(p, x, z, i));
  } else {
    const rim = new Batch();
    hull(rim, t);
    const bumper = rim.mesh('Outer bumper', surface);
    bumper.scale.set(layout.scale, 1, layout.scale);
    stage.add(bumper);
    deck(fixed, t, layout);
    drum(fixed, 0, 0.08, 0, 0.82, 0.16, t.lane);
    drum(fixed, 0, 0.21, 0, 0.7, 0.17, t.ink);
    drum(fixed, 0, 0.32, 0, 0.52, 0.21, t.post);
    if (map === 'soda') sodaDetails(fixed, t, layout.scale);
    else if (map === 'orbit') orbitDetails(fixed, t, layout.scale);
    else cloudDetails(fixed, t, layout.scale);
    rotor = sweepArm(t, surface);
    stage.add(rotor);
  }
  for (const [x, z] of layout.glass) tileWell(fixed, x, z, t);
  const tiles = layout.glass.map(([x, z]) => glassTile(x, z, t));
  stage.add(fixed.mesh('Arena deck', surface), ...tiles);
  stage.userData.stage = { rotor, tiles, treads };
  return stage;
}

export function updateStage(group, state = {}) {
  const { rotor, tiles, treads } = group.userData.stage;
  if (rotor) rotor.rotation.y = -(state.angle ?? 0);
  for (const { belt, marks } of treads)
    beltTreads(belt, beltOffset(state.t || 0), (i, z, scale) => {
      marks[i].position.z = z;
      marks[i].scale.z = scale;
    });
  tiles.forEach((tile, i) => {
    const glass = state.glass?.[i];
    tile.visible = !(glass?.down > 0);
    const warn = glass?.warn ?? 0;
    tile.userData.cracks.visible = warn > 0;
    tile.material = warn > 0 ? tile.userData.warningMaterial : tile.userData.intactMaterial;
    if (warn > 0) tile.material.color.lerpColors(glassCoral, glassAmber, 0.5 + 0.5 * Math.cos(warn * 12));
  });
}

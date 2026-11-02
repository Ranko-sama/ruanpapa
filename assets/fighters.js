import * as THREE from './three.module.min.js';
import { makeFighterRig } from '../fighter-rig.js';
import { bodyRings, BODY_DEPTH, crownRadius } from '../headgear.js';
export { poseFighter } from '../fighter-rig.js';
import { createJellyMaterial } from './fruit-jelly.js';

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.43, metalness: 0.035 });
const studioJelly = createJellyMaterial();
const cutoutDepth = new THREE.MeshBasicMaterial({ colorWrite: false });
const skipCutout = new THREE.MeshBasicMaterial({ visible: false });
const ball = new THREE.SphereGeometry(1, 22, 15);
const bead = new THREE.SphereGeometry(1, 14, 10);
const barrel = new THREE.CylinderGeometry(1, 1, 1, 26);
const Y = new THREE.Vector3(0, 1, 0);
const ink = '#26243d',
  white = '#fff9ed',
  blush = '#ff838f';
const cache = new Map();

const palettes = {
  hammer: [
    ['#ff789c', '#ffbec0', '#ee427f', '#813365', '#fff06c', '#66ebdc'],
    ['#a29aff', '#dcd6ff', '#7953d7', '#523880', '#ffdb79', '#83f3e1'],
    ['#70dfb3', '#c7f5ce', '#25a993', '#246879', '#ffbb76', '#ed87b7'],
  ],
  knight: [
    ['#69d5e8', '#bef5ea', '#47aee8', '#39599b', '#ffe672', '#ff7396'],
    ['#bd9ff4', '#f3dafa', '#9d78e2', '#544392', '#a6f5db', '#ffae74'],
    ['#ffad77', '#ffe5bd', '#f48868', '#984759', '#ffe566', '#64dcd6'],
  ],
  cowboy: [
    ['#ffad57', '#ffe3a7', '#df9956', '#7c4653', '#ffdb72', '#29babc'],
    ['#a5de77', '#e4f6b0', '#a88a62', '#4c6852', '#ffe17c', '#f18b85'],
    ['#f596b2', '#ffe2ca', '#9c7484', '#603d63', '#ffd979', '#69dce1'],
  ],
  spark: [
    ['#75e6c4', '#c6f9d8', '#946ee9', '#513f91', '#ffeb72', '#ff92c8'],
    ['#ffb3d6', '#ffe2e4', '#708edc', '#444b91', '#fff394', '#72e9da'],
    ['#92caff', '#d7eaff', '#db77ae', '#753c79', '#ffde76', '#8ff1d1'],
  ],
};

const v = (a) => new THREE.Vector3(...a);
const profile = (points, segments = 32) =>
  new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
const matrix = (pos, size, rotation) => {
  const q = rotation.isQuaternion
    ? rotation
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  return new THREE.Matrix4().compose(v(pos), q, v(size));
};

class Batch {
  constructor(skin, face) {
    this.skin = skin;
    this.face = face;
    this.base = new THREE.Matrix4();
    this.xyz = [];
    this.normals = [];
    this.rgb = [];
    this.indices = [];
    this.gelIndices = [];
    this.volumes = [];
  }
  at(pos, rot, fn) {
    const previous = this.base;
    this.base = previous.clone().multiply(matrix(pos, [1, 1, 1], rot));
    fn();
    this.base = previous;
  }
  add(geometry, colour, pos = [0, 0, 0], size = [1, 1, 1], rot = [0, 0, 0]) {
    const world = this.base.clone().multiply(matrix(pos, size, rot));
    const normals = new THREE.Matrix3().getNormalMatrix(world);
    const tint = new THREE.Color(colour),
      point = new THREE.Vector3();
    const attr = geometry.attributes,
      offset = this.xyz.length / 3;
    if (colour === this.skin) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const radii = geometry.boundingBox
        .clone()
        .applyMatrix4(world)
        .getSize(new THREE.Vector3())
        .multiplyScalar(0.5);
      this.volumes.push({ offset, count: attr.position.count, radii, face: attr.faceBlend });
    }
    const cream = attr.faceBlend && new THREE.Color(this.face);
    const mixed = new THREE.Color();
    for (let i = 0; i < attr.position.count; i++) {
      point.fromBufferAttribute(attr.position, i).applyMatrix4(world);
      this.xyz.push(point.x, point.y, point.z);
      point.fromBufferAttribute(attr.normal, i).applyNormalMatrix(normals);
      this.normals.push(point.x, point.y, point.z);
      const color = cream ? mixed.copy(tint).lerp(cream, attr.faceBlend.getX(i)) : tint;
      this.rgb.push(color.r, color.g, color.b);
    }
    const indices = geometry.index;
    const output = colour === this.skin ? this.gelIndices : this.indices;
    for (let i = 0; i < (indices ? indices.count : attr.position.count); i++)
      output.push(offset + (indices ? indices.getX(i) : i));
  }
  oval(colour, pos, size, rot = [0, 0, 0]) {
    this.add(Math.max(...size) > 0.23 ? ball : bead, colour, pos, size, rot);
  }
  tube(colour, a, b, radius, soft = false) {
    const delta = v(b).sub(v(a)),
      length = delta.length();
    if (!length) return;
    const q = new THREE.Quaternion().setFromUnitVectors(Y, delta.normalize());
    const middle = v(a).lerp(v(b), 0.5).toArray();
    this.add(
      soft ? ball : barrel,
      colour,
      middle,
      [radius, soft ? length / 2 + radius * 0.4 : length, radius],
      q,
    );
  }
  line(colour, points, radius) {
    const path = new THREE.CatmullRomCurve3(points.map(v));
    this.add(new THREE.TubeGeometry(path, Math.max(9, points.length * 3), radius, 7, false), colour);
    this.oval(colour, points[0], [radius, radius, radius]);
    this.oval(colour, points.at(-1), [radius, radius, radius]);
  }
  finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.xyz, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.rgb, 3));
    if (this.gelIndices.length) {
      g.setIndex(this.indices.concat(this.gelIndices));
      if (this.indices.length) g.addGroup(0, this.indices.length, 0);
      g.addGroup(this.indices.length, this.gelIndices.length, 1);
      const optics = new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4);
      for (const { offset, count, radii, face } of this.volumes) {
        for (let i = 0; i < count; i++)
          optics.setXYZW(offset + i, radii.x, radii.y, radii.z, face ? face.getX(i) : -1);
      }
      g.setAttribute('gelOptics', optics);
    } else g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

function extruded(draw, depth = 0.08, bevel = 0.025) {
  const shape = new THREE.Shape();
  draw(shape);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 6,
  });
}

const star = extruded(
  (s) => {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? 0.49 : 1;
      s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
  },
  0.12,
  0.06,
);
const bolt = extruded(
  (s) => {
    s.moveTo(0.12, 1);
    s.lineTo(-0.73, -0.09);
    s.lineTo(-0.1, -0.02);
    s.lineTo(-0.26, -1);
    s.lineTo(0.76, 0.22);
    s.lineTo(0.14, 0.16);
  },
  0.13,
  0.045,
);
function jellyBody() {
  const rings = bodyRings;
  const geometry = new THREE.LatheGeometry(rings, 72);
  const pos = geometry.attributes.position,
    blend = new Float32Array(pos.count);
  // Mold the cheek patch into the same continuous surface as the belly.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i) * BODY_DEPTH;
    const radius = Math.hypot(x / 0.545, (y - 1.24) / 0.415);
    if (z <= 0 || radius >= 1) continue;
    const cheek = 0.391 + 0.216 * Math.sqrt(1 - radius * radius);
    const join = Math.max(0.032 - Math.abs(z - cheek), 0);
    blend[i] = 1 - THREE.MathUtils.smoothstep(radius, 0.8, 1);
    pos.setZ(i, (z + blend[i] * (Math.max(0, cheek - z) + (join * join) / 0.128)) / BODY_DEPTH);
  }
  geometry.setAttribute('faceBlend', new THREE.BufferAttribute(blend, 1));
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal,
    n = new THREE.Vector3(),
    seam = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    const end = pos.count - rings.length + i;
    n.fromBufferAttribute(normals, i).add(seam.fromBufferAttribute(normals, end)).normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
    normals.setXYZ(end, n.x, n.y, n.z);
  }
  return geometry;
}
const body = jellyBody();

function belt(b, colour, radius, height, width = 0.075, depth = 0.804) {
  b.add(
    profile([
      [radius - 0.021, -width / 2],
      [radius - 0.004, -width / 2],
      [radius + 0.009, -width * 0.28],
      [radius + 0.009, width * 0.27],
      [radius, width / 2],
      [radius - 0.023, width / 2],
    ]),
    colour,
    [0, height, 0],
    [1, 1, depth],
  );
}

function badge(b, symbol, colour, pos, radius, tilt = 0) {
  b.add(symbol, colour, pos, [radius, radius, radius], [0, 0, tilt]);
}

function addFace(b, kind) {
  for (const s of [-1, 1]) {
    const eyeX = s * 0.213,
      eyeY = 1.326 + (kind === 'cowboy' && s > 0 ? 0.016 : 0);
    b.oval(ink, [eyeX, eyeY, 0.582], [0.074, 0.102, 0.037], [-0.03, s * 0.21, -s * 0.045]);
    b.oval(white, [eyeX - 0.018, eyeY + 0.035, 0.615], [0.021, 0.025, 0.012]);
    b.oval(
      kind === 'spark' ? '#ff9bc1' : blush,
      [s * 0.375, 1.166, 0.538],
      [0.088, 0.041, 0.022],
      [0, s * 0.45, s * 0.08],
    );
    if (kind === 'cowboy') {
      b.oval('#ad6a56', [s * 0.341, 1.175, 0.553], [0.012, 0.012, 0.01]);
      b.oval('#ad6a56', [s * 0.401, 1.171, 0.54], [0.013, 0.013, 0.009]);
    }
  }
  b.line(
    ink,
    [
      [-0.081, 1.177, 0.604],
      [-0.042, 1.139, 0.607],
      [0.005, 1.129, 0.61],
      [0.053, 1.145, 0.606],
      [0.079, 1.168, 0.602],
    ],
    0.013,
  );
  if (kind === 'spark') b.oval('#ab6db2', [0, 1.205, 0.61], [0.037, 0.024, 0.014]);
}

function shorts(b, p) {
  b.add(
    profile([
      [0.11, 0.266],
      [0.32, 0.29],
      [0.47, 0.344],
      [0.58, 0.437],
      [0.648, 0.572],
      [0.675, 0.686],
      [0.663, 0.712],
    ]),
    p.accent,
    [0, 0, 0],
    [1, 1, 0.829],
  );
  belt(b, p.deep, 0.676, 0.69, 0.09, 0.839);
  b.oval(p.trim, [0, 0.694, 0.569], [0.115, 0.064, 0.023]);
}

function addHammerCostume(b, p, torso) {
  // The lenses sit on the brow so the little athlete's eyes remain legible.
  torso.add(
    profile([
      [0.563, 1.661],
      [0.61, 1.626],
      [0.64, 1.596],
      [0.655, 1.587],
      [0.63, 1.66],
      [0.577, 1.72],
      [0.552, 1.733],
    ]),
    p.deep,
    [0, 0, 0],
    [1, 1, 0.837],
  );
  b.oval(p.trim, [0, 1.67, 0.502], [0.104, 0.048, 0.046]);
  for (const s of [-1, 1]) {
    const a = [0, s * 0.32, s * 0.12];
    b.oval(p.deep, [s * 0.237, 1.662, 0.428], [0.263, 0.162, 0.109], a);
    b.oval(p.trim, [s * 0.237, 1.675, 0.469], [0.238, 0.143, 0.099], a);
    b.oval('#297f98', [s * 0.238, 1.68, 0.507], [0.196, 0.108, 0.082], a);
    b.oval(p.extra, [s * 0.233, 1.698, 0.538], [0.166, 0.082, 0.056], a);
    b.oval(white, [s * 0.222 - 0.041, 1.724, 0.581], [0.043, 0.014, 0.014], [0, s * 0.32, 0.45]);
  }
  torso.oval(p.accent, [-0.07, 1.928, -0.02], [0.211, 0.112, 0.177], [0, 0, -0.4]);
  torso.oval(p.extra, [0.1, 1.988, -0.018], [0.133, 0.068, 0.071], [0, 0, 0.53]);
  for (const s of [-1, 1])
    torso.line(
      white,
      [
        [s * 0.38, 0.6, 0.43],
        [s * 0.45, 0.573, 0.378],
        [s * 0.497, 0.584, 0.338],
      ],
      0.02,
    );
}

const shieldShape = extruded(
  (s) => {
    s.moveTo(0, 0.48);
    s.quadraticCurveTo(0.22, 0.455, 0.35, 0.38);
    s.quadraticCurveTo(0.41, 0.36, 0.397, 0.266);
    s.lineTo(0.361, -0.075);
    s.quadraticCurveTo(0.327, -0.318, 0.025, -0.514);
    s.quadraticCurveTo(0, -0.528, -0.025, -0.514);
    s.quadraticCurveTo(-0.327, -0.318, -0.361, -0.075);
    s.lineTo(-0.397, 0.266);
    s.quadraticCurveTo(-0.41, 0.36, -0.35, 0.38);
    s.quadraticCurveTo(-0.22, 0.455, 0, 0.48);
  },
  0.055,
  0.032,
);
const swordBlade = extruded(
  (s) => {
    s.moveTo(-0.098, 0);
    s.quadraticCurveTo(-0.126, 0.36, -0.105, 0.69);
    s.quadraticCurveTo(-0.089, 0.77, -0.033, 0.833);
    s.quadraticCurveTo(0, 0.871, 0.033, 0.833);
    s.quadraticCurveTo(0.089, 0.77, 0.105, 0.69);
    s.quadraticCurveTo(0.126, 0.36, 0.098, 0);
  },
  0.051,
  0.018,
);

function addKnightCostume(b, p, torso) {
  // The cheek guards and rolled rim frame the face opening.
  b.add(
    profile(
      [
        [0.555, 1.541],
        [0.643, 1.55],
        [0.688, 1.585],
        [0.687, 1.68],
        [0.647, 1.8],
        [0.552, 1.923],
        [0.412, 2.005],
        [0.238, 2.058],
        [0, 2.071],
      ],
      38,
    ),
    p.accent,
    [0, 0, -0.018],
    [1, 1, 0.873],
  );
  belt(b, p.deep, 0.685, 1.59, 0.064, 0.895);
  belt(b, '#b8f2ff', 0.688, 1.62, 0.023, 0.891);
  for (const s of [-1, 1]) {
    b.oval(p.deep, [s * 0.588, 1.408, 0.05], [0.138, 0.248, 0.319], [s * 0.06, 0, -s * 0.12]);
    b.oval(p.accent, [s * 0.615, 1.449, 0.074], [0.143, 0.218, 0.302], [s * 0.06, 0, -s * 0.12]);
    b.oval(p.trim, [s * 0.667, 1.438, 0.312], [0.067, 0.076, 0.047]);
    torso.oval(p.deep, [s * 0.469, 0.761, 0.379], [0.172, 0.109, 0.056], [0, s * 0.51, s * 0.44]);
  }
  b.line(
    '#bdf6ff',
    [
      [0.009, 1.651, 0.589],
      [0.008, 1.732, 0.573],
      [0.009, 1.8, 0.554],
      [0.008, 1.863, 0.515],
      [0.009, 1.923, 0.471],
      [0.008, 1.968, 0.407],
      [0.008, 2.005, 0.348],
      [0.008, 2.045, 0.231],
    ],
    0.029,
  );
  b.oval(p.trim, [-0.017, 2.06, -0.044], [0.172, 0.071, 0.166]);
  b.oval(p.extra, [-0.13, 2.189, -0.087], [0.132, 0.238, 0.105], [-0.32, 0.2, 0.7]);
  b.oval(p.extra, [-0.312, 2.232, -0.141], [0.192, 0.105, 0.08], [-0.14, -0.1, -0.22]);
  b.oval('#fff0cb', [-0.207, 2.247, -0.071], [0.121, 0.026, 0.023], [0, 0.15, 0.2]);
  badge(torso, star, p.extra, [0, 0.727, 0.602], 0.112);
}

function addShield(b, p) {
  b.at([-0.284, -0.201, 0.365], [0, -0.17, -0.125], () => {
    b.add(shieldShape, p.deep, [0, 0, -0.035], [1.05, 1.05, 1]);
    b.add(shieldShape, p.trim, [0, 0.01, 0.026]);
    b.add(shieldShape, p.accent, [0, 0.024, 0.08], [0.83, 0.82, 0.6]);
    b.line(
      '#b7f6ff',
      [
        [-0.229, 0.244, 0.145],
        [0, 0.178, 0.147],
        [0.229, 0.244, 0.145],
      ],
      0.018,
    );
    b.line(
      p.deep,
      [
        [-0.237, -0.042, 0.142],
        [0, -0.135, 0.142],
        [0.237, -0.042, 0.142],
      ],
      0.032,
    );
    badge(b, star, p.trim, [0, 0.073, 0.148], 0.158);
  });
}

function addSword(b, p) {
  b.at([0.292, -0.234, 0.224], [0.075, -0.09, -0.286], () => {
    b.tube(p.deep, [0, -0.14, 0], [0, 0.2, 0], 0.064);
    b.oval(p.trim, [0, -0.167, 0], [0.097, 0.073, 0.089]);
    b.add(swordBlade, '#baf4ff', [0, 0.205, -0.027]);
    b.line(
      '#f7fffd',
      [
        [-0.018, 0.296, 0.044],
        [-0.02, 0.7, 0.046],
        [0, 0.936, 0.044],
      ],
      0.013,
    );
    b.oval(p.trim, [0, 0.211, 0.016], [0.252, 0.061, 0.084]);
    for (const s of [-1, 1]) b.oval(p.trim, [s * 0.216, 0.246, 0.015], [0.065, 0.079, 0.075]);
    b.oval(p.extra, [0, 0.217, 0.09], [0.064, 0.061, 0.035]);
  });
}

// A shaped saddle brim turns up at the sides. The hat crown has a shallow dip.
const hatBrim = profile(
  [
    [0.3, -0.043],
    [0.65, -0.04],
    [0.89, -0.036],
    [0.97, -0.031],
    [1, -0.012],
    [1.007, 0.012],
    [0.984, 0.035],
    [0.95, 0.04],
    [0.69, 0.029],
    [0.34, 0.037],
  ],
  56,
);
const hatCrown = profile(
  [
    [0.497, 0],
    [0.527, 0.044],
    [0.505, 0.14],
    [0.446, 0.31],
    [0.407, 0.409],
    [0.347, 0.448],
    [0.239, 0.463],
    [0.11, 0.468],
    [0, 0.465],
  ],
  40,
);
for (const [g, brim] of [
  [hatBrim, true],
  [hatCrown, false],
]) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    if (brim) pos.setY(i, y + 0.177 * x * x - 0.102 * z * z + 0.026 * x);
    else pos.setY(i, y - 0.08 * Math.max(0, (y - 0.29) / 0.18) * Math.max(0, 1 - Math.abs(x) / 0.3));
  }
  g.computeVertexNormals();
}

const hatAnchor = [0, 1.716, -0.024],
  hatTilt = [0.034, 0, -0.069];
function addCowboyCostume(head, p, b) {
  head.at(hatAnchor, hatTilt, () => {
    head.add(hatBrim, p.accent, [0, 0, 0], [0.939, 1, 0.703]);
    head.add(hatCrown, p.accent, [0, 0, 0], [1.069, 1, 0.875]);
    head.add(
      profile(
        [
          [0.519, 0.046],
          [0.538, 0.049],
          [0.535, 0.077],
          [0.52, 0.131],
          [0.51, 0.135],
        ],
        40,
      ),
      p.deep,
      [0, 0, 0],
      [1.069, 1, 0.884],
    );
    badge(head, star, p.trim, [0, 0.106, 0.466], 0.091, 0.12);
  });
  const scarf = '#f05e6c';
  belt(b, scarf, 0.71, 0.928, 0.103, 0.817);
  b.add(
    extruded(
      (s) => {
        s.moveTo(-0.279, 0.061);
        s.quadraticCurveTo(0.069, 0.133, 0.284, 0.072);
        s.quadraticCurveTo(0.217, -0.024, 0.042, -0.193);
        s.quadraticCurveTo(0.005, -0.228, -0.032, -0.186);
      },
      0.027,
      0.024,
    ),
    scarf,
    [0, 0.936, 0.548],
    [1, 1, 1],
    [0, 0, -0.06],
  );
  b.oval(scarf, [-0.517, 0.88, 0.363], [0.089, 0.092, 0.078]);
  b.oval(scarf, [-0.594, 0.822, 0.351], [0.095, 0.042, 0.06], [0, -0.132, 0.515]);
  for (const [x, y] of [
    [-0.085, 0.943],
    [0.031, 0.888],
    [0.112, 0.976],
  ])
    b.oval(white, [x, y, 0.584], [0.015, 0.014, 0.01]);
}

function addBlaster(b, p) {
  b.at([0.285, -0.198, 0.238], [-0.05, -0.48, 0.095], () => {
    b.tube(p.deep, [-0.051, -0.123, 0], [0.048, 0.176, 0], 0.081, true);
    b.oval(p.extra, [0.186, 0.17, 0], [0.302, 0.178, 0.129]);
    b.tube(p.extra, [0.215, 0.187, 0], [0.544, 0.187, 0], 0.125);
    b.tube(p.trim, [0.48, 0.187, 0], [0.563, 0.187, 0], 0.158);
    b.tube(p.deep, [0.559, 0.187, 0], [0.576, 0.187, 0], 0.098);
    b.tube('#7ef7ec', [0.575, 0.187, 0], [0.586, 0.187, 0], 0.064);
    b.oval(p.trim, [-0.037, 0.162, 0], [0.084, 0.128, 0.132]);
    b.oval('#7ae5ff', [0.152, 0.321, -0.006], [0.138, 0.165, 0.136]);
    b.oval(white, [0.108, 0.377, 0.093], [0.033, 0.046, 0.027]);
    b.tube(p.deep, [0.152, 0.273, -0.006], [0.152, 0.295, -0.006], 0.131);
    for (const x of [0.178, 0.242, 0.306])
      b.oval('#acfff3', [x, 0.178, 0.117], [0.017, 0.055, 0.019], [0, 0, -0.31]);
  });
}

function addMallet(b, p) {
  b.at([0.276, -0.235, 0.227], [0.1, -0.12, -0.46], () => {
    b.tube(p.deep, [0, -0.21, 0], [0, 0.93, 0], 0.075);
    b.tube(p.trim, [0, 0.11, 0], [0, 0.78, 0], 0.062);
    for (const y of [-0.178, -0.059, 0.055, 0.705]) b.tube(p.extra, [0, y, 0], [0, y + 0.032, 0], 0.081);
    b.oval(p.extra, [0, -0.203, 0], [0.091, 0.064, 0.091]);
    b.at([0, 0.911, 0], [0, -0.22, 0.135], () => {
      // A plush dumbbell-shaped mallet, with ribbed bumpers on both striking faces.
      b.add(
        profile(
          [
            [0, -0.505],
            [0.213, -0.505],
            [0.285, -0.488],
            [0.322, -0.428],
            [0.326, -0.33],
            [0.282, -0.245],
            [0.264, -0.12],
            [0.259, 0.11],
            [0.281, 0.244],
            [0.33, 0.334],
            [0.331, 0.425],
            [0.292, 0.488],
            [0.214, 0.504],
            [0, 0.504],
          ],
          32,
        ),
        p.accent,
        [0, 0, 0],
        [1, 1, 1],
        [0, 0, -Math.PI / 2],
      );
      for (const s of [-1, 1]) {
        b.tube(p.trim, [s * 0.347, 0, 0], [s * 0.422, 0, 0], 0.337);
        b.tube(p.deep, [s * 0.308, 0, 0], [s * 0.328, 0, 0], 0.316);
        b.oval(p.extra, [s * 0.502, 0, 0], [0.04, 0.213, 0.213]);
        b.oval(p.trim, [s * 0.534, 0, 0], [0.016, 0.125, 0.125]);
      }
      badge(b, bolt, p.trim, [0, 0, 0.262], 0.152, -0.16);
    });
  });
}

function addSparkCostume(b, p, torso) {
  for (const s of [-1, 1]) {
    b.at([s * 0.27, 1.835, -0.035], [s * 0.09, s * 0.12, -s * (s > 0 ? 0.43 : 0.2)], () => {
      const height = s > 0 ? 0.245 : 0.312;
      b.oval(p.skin, [0, height * 0.85, 0], [0.155, height, 0.117]);
      b.oval(p.extra, [0, height * 0.94, 0.087], [0.08, height * 0.69, 0.049]);
      b.oval(p.trim, [0, height * 0.47, 0.088], [0.103, 0.04, 0.044]);
    });
  }
  b.add(
    profile(
      [
        [1.586, -0.003],
        [1.589, 0.014],
        [1.598, 0.039],
        [1.625, 0.047],
        [1.656, 0.047],
        [1.681, 0.036],
        [1.695, 0.012],
        [1.698, -0.003],
      ].map(([y, padding]) => [crownRadius(y) + padding, y]),
      72,
    ),
    p.deep,
    [0, 0, 0],
    [1, 1, BODY_DEPTH],
  );
  // Tilt the badge onto the sloped band. A vertical badge buries its lower point.
  const badgeHeight = 1.649,
    badgeDepth = BODY_DEPTH * (crownRadius(badgeHeight) + 0.047) + 0.002;
  b.at([0, badgeHeight, badgeDepth], [-0.5, 0, 0], () => badge(b, bolt, p.trim, [0, 0, 0], 0.103, -0.17));
  torso.oval(p.deep, [0, 0.796, 0.557], [0.172, 0.128, 0.051]);
  badge(torso, bolt, p.trim, [0, 0.817, 0.603], 0.122, -0.18);
}

// Each bow or hairclip sits tangent to the outside of the actual band or shell.
const clipSeats = {
  hammer: [1.682, 0.615, 0.837, -0.84, 0],
  knight: [1.732, 0.67, 0.873, -0.34, -0.018],
  cowboy: [0.1, 0.531 * 1.069, 0.884 / 1.069, -0.24, 0],
  spark: [1.649, crownRadius(1.649) + 0.047, BODY_DEPTH, -0.62, 0],
};
function attachClip(b, kind, side, draw) {
  const [y, r, aspect, slope, z] = clipSeats[kind],
    angle = side * (kind === 'hammer' ? 1.12 : 0.98);
  const s = Math.sin(angle),
    c = Math.cos(angle);
  const right = new THREE.Vector3(c, 0, -aspect * s).normalize();
  const normal = new THREE.Vector3(s, -slope, c / aspect).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, normal),
  );
  const mount = new THREE.Vector3(r * s, y, z + r * aspect * c).addScaledVector(normal, 0.018);
  const attach = () => b.at(mount.toArray(), rotation, draw);
  if (kind === 'cowboy') b.at(hatAnchor, hatTilt, attach);
  else attach();
}
function addOutfit(b, outfit, kind, p, torso) {
  if (outfit === 1) {
    attachClip(b, kind, -1, () => {
      b.oval(p.deep, [0.04, -0.035, -0.015], [0.175, 0.054, 0.045], [0, 0, 0.27]);
      badge(b, star, '#ffdc57', [0, 0, 0], 0.157);
      b.oval(white, [-0.025, 0.041, 0.029], [0.03, 0.014, 0.01], [0, 0, 0.51]);
    });
    badge(torso, star, '#ffdc57', [0.297, 0.748, 0.518], 0.077, 0.19);
  } else if (outfit === 2) {
    attachClip(b, kind, 1, () => {
      for (const s of [-1, 1])
        b.oval('#71e9cc', [s * 0.135, 0.015, 0], [0.17, 0.105, 0.069], [0, 0, s * 0.43]);
      b.oval('#ffd576', [0, 0, 0.031], [0.07, 0.079, 0.062]);
    });
    for (const s of [-1, 1]) badge(torso, star, '#ffda73', [s * 0.374, 1.162, 0.558], 0.039, s * 0.3);
  }
}

function buildArm(kind, p, side) {
  const b = new Batch(p.skin),
    s = side;
  b.tube(p.skin, [s * 0.012, 0, 0], [s * 0.223, -0.266, 0.139], 0.168, true);
  if (kind === 'knight') {
    b.oval(p.deep, [s * 0.08, -0.007, 0.02], [0.208, 0.143, 0.198], [0, 0, s * -0.4]);
    b.oval(p.accent, [s * 0.082, 0.023, 0.022], [0.208, 0.15, 0.202], [0, 0, s * -0.4]);
  }
  b.tube(kind === 'spark' ? p.trim : p.deep, [s * 0.177, -0.196, 0.111], [s * 0.237, -0.26, 0.161], 0.16);
  const glove = kind === 'spark' ? p.accent : kind === 'cowboy' ? p.skin : p.accent;
  const large = kind === 'spark' ? 1.43 : 1;
  b.oval(
    glove,
    [s * 0.256, -0.246, 0.179],
    [0.166 * large, 0.166 * large, 0.18 * large],
    [0, s * 0.15, s * 0.26],
  );
  b.oval(glove, [s * 0.172, -0.238, 0.266], [0.083 * large, 0.094 * large, 0.095 * large]);
  if (kind === 'spark') {
    b.oval(p.deep, [s * 0.274, -0.2, 0.335], [0.169, 0.145, 0.082]);
    badge(b, bolt, p.trim, [s * 0.272, -0.189, 0.414], 0.122, -s * 0.15);
  }
  if (kind === 'hammer' && s > 0) addMallet(b, p);
  if (kind === 'knight') s > 0 ? addSword(b, p) : addShield(b, p);
  if (kind === 'cowboy' && s > 0) addBlaster(b, p);
  return b.finish();
}

function buildFoot(kind, p, s) {
  const b = new Batch();
  b.oval(p.deep, [0, -0.086, 0.065], [0.243, 0.096, 0.305], [0, -s * 0.09, 0]);
  b.oval(kind === 'cowboy' ? p.accent : p.extra, [0, -0.018, 0.047], [0.24, 0.135, 0.289], [0, -s * 0.09, 0]);
  b.oval(p.accent, [0, 0.065, -0.016], [0.205, 0.131, 0.203]);
  b.oval(kind === 'cowboy' ? p.deep : p.trim, [0, 0.108, -0.003], [0.213, 0.053, 0.208]);
  if (kind === 'hammer')
    b.line(
      white,
      [
        [-0.09, 0.009, 0.279],
        [0.005, 0.036, 0.306],
        [0.091, 0.008, 0.277],
      ],
      0.019,
    );
  if (kind === 'knight') b.oval('#c2f5ff', [0, 0.013, 0.175], [0.158, 0.108, 0.156]);
  return b.finish();
}

function build(kind, skin, outfit) {
  const [bodyColour, face, accent, deep, trim, extra] = palettes[kind][skin];
  const p = { skin: bodyColour, face, accent, deep, trim, extra };
  const torso = new Batch(p.skin, p.face),
    head = new Batch(p.skin);
  torso.add(body, p.skin, [0, 0, 0], [1, 1, BODY_DEPTH]);
  addFace(torso, kind);
  shorts(torso, p);
  ({ hammer: addHammerCostume, knight: addKnightCostume, cowboy: addCowboyCostume, spark: addSparkCostume })[
    kind
  ](head, p, torso);
  addOutfit(kind === 'hammer' ? torso : head, outfit, kind, p, torso);
  return [
    torso.finish(),
    head.finish(),
    buildArm(kind, p, -1),
    buildArm(kind, p, 1),
    buildFoot(kind, p, -1),
    buildFoot(kind, p, 1),
  ];
}

/** Local +Z is forward. Its origin is the point of contact with the floor. */
export function makeFighter(kind, skin = 0, outfit = 0, gelMaterial = studioJelly) {
  if (!Object.hasOwn(palettes, kind)) kind = 'hammer';
  skin = [1, 2].includes(skin) ? skin : 0;
  outfit = [1, 2].includes(outfit) ? outfit : 0;
  const key = `${kind}-${skin}-${outfit}`;
  if (!cache.has(key)) cache.set(key, build(kind, skin, outfit));
  const surfaces = [material, gelMaterial];
  const meshes = cache.get(key).map((geometry) => {
    const mesh = new THREE.Mesh(geometry, geometry.groups.length ? surfaces : material);
    mesh.castShadow = true;
    if (gelMaterial === studioJelly && geometry.groups.length) {
      // A transparent portrait has no arena plate. Mask hidden eyes and equipment
      // before its translucent pixels are baked into the UI/Canvas sprite.
      const mask = new THREE.Mesh(geometry, [skipCutout, cutoutDepth]);
      mask.renderOrder = -2;
      mesh.add(mask);
    }
    return mesh;
  });
  return makeFighterRig(kind, meshes);
}

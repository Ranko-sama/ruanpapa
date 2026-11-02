import { Box3, Euler, Matrix4, Quaternion, Triangle, Vector3 } from './assets/three.module.min.js';
import { makeFighterRig, placeFighter } from './fighter-rig.js';
import { airAmount } from './jelly.js';
import { BLOCK, BUMPER_LOBES, SWEEPER_HEIGHT, SWEEPER_BANDS } from './arena-geometry.js';

const vec = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const up = vec(0, 1, 0),
  origin = vec(),
  unit = vec(1, 1, 1);
const identity = new Quaternion(),
  rotation = new Quaternion(),
  euler = new Euler();
const offset = vec(),
  extent = vec(),
  delta = vec(),
  normal = vec(),
  local = vec(),
  closest = vec();
const corners = Array.from({ length: 8 }, () => vec());
const unitCorners = corners.map((_, i) => vec(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1));
const faces = [
  [0, 2, 6, 4],
  [1, 5, 7, 3],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 1, 3, 2],
  [4, 6, 7, 5],
];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Local unit balls become ellipsoids under the same affine transforms as the mesh.
// The three torso lobes fit its lathed outline. Soles and forearms have their own bones.
function part(bone, center, radii, orientation = identity, box = false) {
  return {
    bone,
    box,
    center: vec(),
    q: new Float64Array(6),
    bounds: new Box3(),
    bind: new Matrix4().compose(center, orientation, radii),
    world: new Matrix4(),
    inverse: new Matrix4(),
    corners: box ? unitCorners.map(() => vec()) : null,
  };
}

function makeCollider(kind) {
  const rig = kind ? makeFighterRig(kind) : null,
    parts = [],
    soles = [];
  let shield;
  if (rig) {
    const { torso, head, left, right, footL, footR } = rig.userData.jellyRig;
    for (const [lo, hi, rx] of [
      [0.268, 0.632, 0.566],
      [0.266, 1.503, 0.719],
      [0.608, 1.949, 0.709],
    ]) {
      parts.push(part(torso, vec(0, (lo + hi) / 2, 0), vec(rx, (hi - lo) / 2, rx * 0.809)));
    }
    for (const [side, arm, foot] of [
      [-1, left, footL],
      [1, right, footR],
    ]) {
      const axis = vec(side * 0.25, -0.25, 0.18).normalize();
      const armRotation = new Quaternion().setFromUnitVectors(up, axis);
      parts.push(part(arm, vec(side * 0.13, -0.123, 0.088), vec(0.166, 0.344, 0.171), armRotation));
      const glove = kind === 'spark' ? 1.43 : 1;
      parts.push(
        part(arm, vec(side * 0.256, -0.246, 0.18), vec(0.167 * glove, 0.166 * glove, 0.184 * glove)),
      );
      const sole = part(foot, vec(0, -0.011, 0.046), vec(0.243, 0.172, 0.306));
      parts.push(sole);
      soles.push(sole);
    }
    if (kind === 'knight') {
      parts.push(part(head, vec(0, 1.655, -0.018), vec(0.684, 0.416, 0.597)));
      shield = part(
        left,
        vec(-0.284, -0.18, 0.445),
        vec(0.319, 0.411, 0.095),
        new Quaternion().setFromEuler(new Euler(0, -0.17, -0.125)),
      );
    }
  } else
    parts.push(
      part(
        null,
        vec(0, BLOCK.height / 2, 0),
        vec(BLOCK.width / 2, BLOCK.height / 2, BLOCK.depth / 2),
        identity,
        true,
      ),
    );
  return {
    kind,
    rig,
    parts,
    baseParts: parts,
    guardParts: shield ? [...parts, shield] : parts,
    soles,
    bounds: new Box3(),
    base: new Matrix4(),
    stepStart: vec(),
    motion: vec(),
  };
}

export function blockTilt(body) {
  return clamp(body.y, 0, 1) * body.rot * 0.3;
}
export function shotRadius(chain) {
  return chain ? 0.32 : 0.22;
}

function collisionPose(b) {
  return b.soft
    ? {
        ...b,
        speed: Math.min(1, Math.hypot(b.vx, b.vz) / 6),
        air: airAmount(b),
        attack: b.attack / 0.34,
        skill: b.skill / 0.65,
        jelly: [b.soft.height, b.soft.leanX, b.soft.leanZ],
      }
    : b;
}

// Endpoints are in the hand's bind space, using the same grips and axes as its geometry.
const grip = (v, shift, turn) => v.applyEuler(new Euler(...turn)).add(vec(...shift));
const malletEnd = (x) =>
  grip(grip(vec(x, 0, 0), [0, 0.911, 0], [0, -0.22, 0.135]), [0.276, -0.235, 0.227], [0.1, -0.12, -0.46]);
const bladeAt = (y) => grip(vec(0, y, 0), [0.292, -0.234, 0.224], [0.075, -0.09, -0.286]);
const weapons = {
  hammer: [malletEnd(-0.35), malletEnd(0.35), 0.3],
  knight: [bladeAt(0.25), bladeAt(0.98), 0.104],
  shield: [vec(-0.28, -0.34, 0.49), vec(-0.28, 0.07, 0.49), 0.24],
  spark: [vec(0.25, -0.24, 0.19), vec(0.27, -0.2, 0.335), 0.222],
};
const strikeRig = new Map();
export function weaponSweep(body, time, shield = false) {
  if (!strikeRig.has(body.kind)) strikeRig.set(body.kind, makeFighterRig(body.kind));
  const rig = strikeRig.get(body.kind),
    hand = rig.userData.jellyRig[shield ? 'left' : 'right'];
  const [heel, tip, radius] = weapons[shield ? 'shield' : body.kind];
  const pose = { ...collisionPose(body) },
    lines = [];
  let lastHeel, lastTip;
  for (let i = 0; i <= 4; i++) {
    pose.attack = shield ? 0 : i / 4;
    pose.skill = shield ? i / 4 : 0;
    placeFighter(rig, pose, time);
    hand.updateWorldMatrix(true, false);
    const a = heel.clone().applyMatrix4(hand.matrixWorld),
      b = tip.clone().applyMatrix4(hand.matrixWorld);
    lines.push([a, b.clone().sub(a)]);
    if (i) lines.push([lastHeel, a.clone().sub(lastHeel)], [lastTip, b.clone().sub(lastTip)]);
    lastHeel = a;
    lastTip = b;
  }
  return { lines, radius };
}

// Q = A A^T stores the squared support radius in any direction, including shear.
function updatePart(p, base) {
  p.world.multiplyMatrices(base, p.bind);
  p.inverse.copy(p.world).invert();
  const m = p.world.elements,
    q = p.q;
  for (const [k, i, j] of qIndices) q[k] = m[i] * m[j] + m[i + 4] * m[j + 4] + m[i + 8] * m[j + 8];
  p.center.setFromMatrixPosition(p.world);
  if (p.box) {
    p.corners.forEach((v, i) => v.copy(unitCorners[i]).applyMatrix4(p.world));
    p.bounds.setFromPoints(p.corners);
  } else {
    extent.set(Math.sqrt(q[0]), Math.sqrt(q[3]), Math.sqrt(q[5]));
    p.bounds.min.copy(p.center).sub(extent);
    p.bounds.max.copy(p.center).add(extent);
  }
}
const qIndices = [
  [0, 0, 0],
  [1, 0, 1],
  [2, 0, 2],
  [3, 1, 1],
  [4, 1, 2],
  [5, 2, 2],
];

// Cross-sections of the spindle's padded drums and domed cap in stages.js.
const spindle = [
  [0.414, 0.094, 0.619],
  [0.562, 0.236, 0.629],
  [0.735, 0.112, 0.66],
  [0.818, 0.153, 0.55],
];
function fixedProfile(x, z, lobes) {
  const c = { parts: [], bounds: new Box3() };
  const base = new Matrix4().makeTranslation(x, 0, z);
  for (const [y, h, r] of lobes) {
    const p = part(null, vec(0, y, 0), vec(r, h, r));
    updatePart(p, base);
    c.parts.push(p);
    c.bounds.union(p.bounds);
  }
  return c;
}
export const hubCollider = fixedProfile(0, 0, spindle);
const stageSolids = new WeakMap();
export function fixedObstacles(layout) {
  if (!stageSolids.has(layout)) {
    const fixed = (x, z, collider, bumper) => ({
      x,
      y: 0,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      ground: true,
      fixed: true,
      collider,
      bumper,
    });
    stageSolids.set(
      layout,
      layout.rotor
        ? [fixed(0, 0, hubCollider, false)]
        : (layout.bumpers || []).map(([x, z]) => fixed(x, z, fixedProfile(x, z, BUMPER_LOBES), true)),
    );
  }
  return stageSolids.get(layout);
}
export function castStage(layout, start, step, radius, angle) {
  if (layout.rotor) return castRotor(start, step, radius, angle);
  let nearest = Infinity;
  for (const o of fixedObstacles(layout))
    nearest = Math.min(nearest, castBody(o.collider, start, step, radius));
  return nearest;
}

// Accepts either an authoritative body or a network/replay frame. Storage belongs to the caller.
export function updateCollider(body, time, previous) {
  const c = previous && previous.kind === body.kind ? previous : makeCollider(body.kind);
  if (c.rig) {
    placeFighter(c.rig, collisionPose(body), time);
    c.rig.updateMatrixWorld();
  } else {
    rotation.setFromEuler(euler.set(0, body.rot, blockTilt(body)));
    c.base.compose(offset.set(body.x, body.y, body.z), rotation, unit);
  }
  c.parts = body.guard > 0 ? c.guardParts : c.baseParts;
  c.bounds.makeEmpty();
  for (const p of c.parts) {
    updatePart(p, p.bone?.matrixWorld || c.base);
    c.bounds.union(p.bounds);
  }
  return c;
}

export function translateCollider(c, body, x, y, z) {
  body.x += x;
  body.y += y;
  body.z += z;
  offset.set(x, y, z);
  c.bounds.translate(offset);
  for (const p of c.parts) {
    p.center.add(offset);
    p.bounds.translate(offset);
    const m = p.world.elements,
      inv = p.inverse.elements;
    m[12] += x;
    m[13] += y;
    m[14] += z;
    for (let i = 0; i < 3; i++) inv[12 + i] -= inv[i] * x + inv[4 + i] * y + inv[8 + i] * z;
    if (p.box) for (const v of p.corners) v.add(offset);
  }
}

function quadratic(q, v) {
  const { x, y, z } = v;
  return q[0] * x * x + q[3] * y * y + q[5] * z * z + 2 * (q[1] * x * y + q[2] * x * z + q[4] * y * z);
}

// The common tangent of two uniformly scaled ellipsoids gives a separating plane.
// Bisection balances their support distances. Only the direction of the inverse is needed.
function ellipsoidGap(a, b, out) {
  delta.subVectors(b.center, a.center);
  const A = a.q,
    B = b.q;
  if (delta.lengthSq() < 1e-14) out.set(1, 0, 0);
  else {
    let lo = 0,
      hi = 1;
    for (let k = 0; k < 11; k++) {
      const t = (lo + hi) / 2,
        s = 1 - t;
      const xx = s * A[0] + t * B[0],
        xy = s * A[1] + t * B[1],
        xz = s * A[2] + t * B[2];
      const yy = s * A[3] + t * B[3],
        yz = s * A[4] + t * B[4],
        zz = s * A[5] + t * B[5];
      const c00 = yy * zz - yz * yz,
        c01 = xz * yz - xy * zz,
        c02 = xy * yz - xz * yy;
      const c11 = xx * zz - xz * xz,
        c12 = xz * xy - xx * yz,
        c22 = xx * yy - xy * xy;
      const { x, y, z } = delta;
      out.set(c00 * x + c01 * y + c02 * z, c01 * x + c11 * y + c12 * z, c02 * x + c12 * y + c22 * z);
      if (s * s * quadratic(A, out) > t * t * quadratic(B, out)) lo = t;
      else hi = t;
    }
    out.normalize();
  }
  return delta.dot(out) - Math.sqrt(quadratic(A, out)) - Math.sqrt(quadratic(B, out));
}

const tri = new Triangle(),
  bestPoint = vec();
// Transform the box into the unit sphere's coordinates. The closest triangle point
// handles faces, edges and corners, even when the relative transform is sheared.
function ellipsoidBoxGap(ball, box, out) {
  const boxPoint = local.copy(ball.center).applyMatrix4(box.inverse);
  const inside = Math.max(Math.abs(boxPoint.x), Math.abs(boxPoint.y), Math.abs(boxPoint.z)) < 1;
  for (let k = 0; k < 8; k++) corners[k].copy(box.corners[k]).applyMatrix4(ball.inverse);
  let best = Infinity;
  for (const [i, j, k, l] of faces) {
    tri.set(corners[i], corners[j], corners[k]).closestPointToPoint(origin, closest);
    let d = closest.lengthSq();
    if (d < best) {
      best = d;
      bestPoint.copy(closest);
    }
    tri.set(corners[i], corners[k], corners[l]).closestPointToPoint(origin, closest);
    d = closest.lengthSq();
    if (d < best) {
      best = d;
      bestPoint.copy(closest);
    }
  }
  const length = Math.sqrt(best),
    inv = ball.inverse.elements;
  if (length < 1e-9) {
    const components = boxPoint.toArray();
    let axis = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(components[i]) > Math.abs(components[axis])) axis = i;
    out
      .setFromMatrixColumn(box.world, axis)
      .normalize()
      .multiplyScalar(-Math.sign(components[axis]) || 1);
    return -Math.sqrt(quadratic(ball.q, out));
  }
  bestPoint.multiplyScalar((inside ? -1 : 1) / length);
  const { x, y, z } = bestPoint;
  out.set(
    inv[0] * x + inv[1] * y + inv[2] * z,
    inv[4] * x + inv[5] * y + inv[6] * z,
    inv[8] * x + inv[9] * y + inv[10] * z,
  );
  const n = out.length();
  out.multiplyScalar(1 / n);
  return ((inside ? -length : length) - 1) / n;
}

const boxAxes = Array.from({ length: 6 }, () => vec()),
  cross = vec();
function boxRadius(part, axis) {
  const m = part.world.elements,
    { x, y, z } = axis;
  return (
    Math.abs(x * m[0] + y * m[1] + z * m[2]) +
    Math.abs(x * m[4] + y * m[5] + z * m[6]) +
    Math.abs(x * m[8] + y * m[9] + z * m[10])
  );
}
function boxGap(a, b, out) {
  delta.subVectors(b.center, a.center);
  let best = -Infinity;
  function test(axis) {
    const distance = delta.dot(axis),
      gap = Math.abs(distance) - boxRadius(a, axis) - boxRadius(b, axis);
    if (gap > best) {
      best = gap;
      out.copy(axis).multiplyScalar(distance < 0 ? -1 : 1);
    }
    return gap > 0;
  }
  for (let i = 0; i < 6; i++) {
    boxAxes[i].setFromMatrixColumn(i < 3 ? a.world : b.world, i % 3).normalize();
    if (test(boxAxes[i])) return best;
  }
  for (let i = 0; i < 3; i++)
    for (let j = 3; j < 6; j++) {
      cross.crossVectors(boxAxes[i], boxAxes[j]);
      if (cross.lengthSq() > 1e-10 && test(cross.normalize())) return best;
    }
  return best;
}

function surfacePoint(p, n, side, out) {
  const q = p.q,
    { x, y, z } = n,
    k = side / Math.sqrt(quadratic(q, n));
  return out
    .set(q[0] * x + q[1] * y + q[2] * z, q[1] * x + q[3] * y + q[4] * z, q[2] * x + q[4] * y + q[5] * z)
    .multiplyScalar(k)
    .add(p.center);
}
function closestBoxPoint(p, from, out) {
  return out.copy(from).applyMatrix4(p.inverse).clampScalar(-1, 1).applyMatrix4(p.world);
}
export function bodyContact(a, b, out, point) {
  if (!a.bounds.intersectsBox(b.bounds)) return 0;
  let depth = 0,
    first,
    second;
  for (const p of a.parts)
    for (const q of b.parts) {
      if (!p.bounds.intersectsBox(q.bounds)) continue;
      let gap;
      if (p.box && q.box) gap = boxGap(p, q, normal);
      else if (q.box) gap = ellipsoidBoxGap(p, q, normal);
      else if (p.box) {
        gap = ellipsoidBoxGap(q, p, normal);
        normal.negate();
      } else gap = ellipsoidGap(p, q, normal);
      if (-gap > depth) {
        depth = -gap;
        out.copy(normal);
        first = p;
        second = q;
      }
    }
  if (depth && point) {
    if (!first.box) surfacePoint(first, out, 1, point);
    else if (!second.box) surfacePoint(second, out, -1, point);
    else
      closestBoxPoint(first, second.center, point).lerp(closestBoxPoint(second, first.center, closest), 0.5);
  }
  return depth;
}

const travel = vec(),
  rayOrigin = vec(),
  rayEnd = vec();
function firstRoot(aa, bb, cc) {
  if (cc <= 0) return 0;
  const disc = bb * bb - aa * cc;
  if (bb >= 0 || disc < 0 || aa < 1e-16) return Infinity;
  const t = cc / (-bb + Math.sqrt(disc));
  return t <= 1 ? t : Infinity;
}
// One shaft expressed in its own axial, horizontal and vertical coordinates. Test the
// cylinder wall and both rounded ends, returning the first point on the sweep.
export function castRotor(start, step, radius, angle) {
  let first = castBody(hubCollider, start, step, radius);
  const cs = Math.cos(angle),
    sn = Math.sin(angle);
  const x = start.x * cs + start.z * sn,
    z = start.z * cs - start.x * sn,
    y = start.y - SWEEPER_HEIGHT;
  const dx = step.x * cs + step.z * sn,
    dz = step.z * cs - step.x * sn,
    dy = step.y;
  const radial = dz * dz + dy * dy,
    dot = z * dz + y * dy;
  for (const [inner, outer, barRadius] of SWEEPER_BANDS) {
    const rr = (radius + barRadius) ** 2,
      cc = z * z + y * y - rr;
    const wall = firstRoot(radial, dot, cc);
    if (Number.isFinite(wall)) {
      const along = Math.abs(x + dx * wall);
      if (along >= inner && along <= outer) first = Math.min(first, wall);
    }
    for (const end of [-outer, -inner, inner, outer]) {
      const axial = x - end;
      first = Math.min(first, firstRoot(radial + dx * dx, dot + axial * dx, cc + axial * axial));
    }
  }
  return first;
}
function rayPart(p, start, step) {
  rayOrigin.copy(start).applyMatrix4(p.inverse);
  travel.copy(rayEnd.copy(start).add(step).applyMatrix4(p.inverse)).sub(rayOrigin);
  if (p.box) {
    let lo = 0,
      hi = 1;
    for (const key of axes) {
      const d = travel[key],
        v = rayOrigin[key];
      if (Math.abs(d) < 1e-10) {
        if (Math.abs(v) > 1) return Infinity;
        continue;
      }
      const a = (-1 - v) / d,
        b = (1 - v) / d;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
      if (lo > hi) return Infinity;
    }
    return lo;
  }
  return firstRoot(travel.lengthSq(), rayOrigin.dot(travel), rayOrigin.lengthSq() - 1);
}
const axes = ['x', 'y', 'z'];
const probe = { center: vec(), q: new Float64Array(6) },
  nearBox = vec();
const sweepBounds = new Box3();
// Advance to the separating plane, never past the first contact. The returned fraction
// orders hits on different targets independently of actor/prop array order.
export function castBody(c, start, step, radius = 0) {
  sweepBounds.min.copy(start).min(rayEnd.copy(start).add(step)).addScalar(-radius);
  sweepBounds.max.copy(start).max(rayEnd).addScalar(radius);
  if (!c.bounds.intersectsBox(sweepBounds)) return Infinity;
  probe.q[0] = probe.q[3] = probe.q[5] = radius * radius;
  let first = Infinity;
  for (const p of c.parts) {
    if (!p.bounds.intersectsBox(sweepBounds)) continue;
    if (radius === 0) {
      first = Math.min(first, rayPart(p, start, step));
      continue;
    }
    let t = 0;
    for (let i = 0; i < 22 && t <= 1 && t < first; i++) {
      probe.center.copy(start).addScaledVector(step, t);
      let gap;
      if (p.box) {
        nearBox.copy(probe.center).applyMatrix4(p.inverse).clampScalar(-1, 1).applyMatrix4(p.world);
        normal.subVectors(probe.center, nearBox);
        gap = normal.length() - radius;
        normal.normalize();
      } else gap = ellipsoidGap(p, probe, normal);
      if (gap <= 0.00008) {
        first = t;
        break;
      }
      const closing = -step.dot(normal);
      if (closing <= 1e-9) break;
      t += gap / closing;
    }
  }
  return first;
}

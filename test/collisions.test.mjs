import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3 } from '../assets/three.module.min.js';
import { makeFighter } from '../assets/fighters.js';
import { placeFighter } from '../fighter-rig.js';
import { updateCollider, castBody, bodyContact } from '../colliders.js';
import { createMatch, frameOf, stepMatch, RADIUS, GLASS } from '../sim.js';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
function arena() {
  const s = createMatch({ players: 2, seed: 48 });
  for (const a of s.actors) Object.assign(a, { dead: 999, human: true, inv: 0, ac: 0, sc: 0, barCD: 999 });
  for (const p of s.props) Object.assign(p, { dead: 999, rot: 0, barCD: 999 });
  return s;
}
function at(b, x, y, z, more = {}) {
  return Object.assign(b, { x, y, z, vx: 0, vy: 0, vz: 0, dead: 0, ground: y === 0, yaw: 0 }, more);
}
function tick(s, frames) {
  for (let i = 0; i < frames; i++) stepMatch(s);
}

test('the hurt surface follows the actual animated torso through squash, tilt and yaw', () => {
  const s = arena();
  at(s.actors[0], 2, 0.7, -1, { kind: 'cowboy', yaw: 1.17 });
  const a = frameOf(s).actors[0],
    model = makeFighter('cowboy'),
    ray = new Raycaster();
  for (const [height, lean, tumble] of [
    [0, 0, 0],
    [-0.29, 0.22, 0.8],
    [0.24, -0.23, 0.9],
  ]) {
    Object.assign(a, { jelly: [height, lean, -0.12], tumble, speed: 0.65 });
    const time = 0.31,
      c = updateCollider(a, time);
    placeFighter(model, a, time);
    model.updateMatrixWorld();
    const torso = model.userData.jellyRig.torso;
    for (const y of [0.48, 0.67, 0.99, 1.3, 1.57, 1.72]) {
      const start = v(0.16, y, -3).applyMatrix4(torso.matrixWorld);
      const step = v(0.16, y, 3).applyMatrix4(torso.matrixWorld).sub(start);
      ray.set(start, step.clone().normalize());
      const mesh = ray.intersectObject(torso, false).find((hit) => hit.face.materialIndex === 1);
      assert.ok(mesh);
      const gap = Math.abs(mesh.distance - castBody(c, start, step) * step.length());
      assert.ok(gap < 0.065, `surface error ${gap} at height ${y}, squash ${height}`);
    }
  }
});

test('shoes, gloves and the knight helmet register hits while the sole gap and cowboy hat clear', () => {
  const s = arena(),
    a = at(s.actors[0], 0, 0, 0, { kind: 'cowboy' });
  const cast = (x, y) => castBody(updateCollider(a, 0), v(x, y, -2), v(0, 0, 4));
  assert.ok(cast(0.3, 0.14) < 1);
  assert.equal(cast(0, 0.14), Infinity);
  assert.ok(cast(0.85, 0.83) < 1);
  assert.equal(cast(0, 2.1), Infinity);
  a.kind = 'knight';
  assert.ok(cast(0, 2.015) < 1);
  const base = updateCollider(a, 0);
  a.outfit = 2;
  a.skin = 1;
  assert.deepEqual(updateCollider(a, 0).bounds, base.bounds);
});

test('swept bubbles hit the nearest cover, pass over a head and catch a crossing runner', () => {
  const shoot = (s, y) =>
    s.shots.push({
      id: 1,
      owner: 0,
      x: -1.2,
      y,
      z: 4,
      dx: 1,
      dy: 0,
      dz: 0,
      muzzleTravel: 0.8,
      life: 1,
      chain: false,
    });
  const s = arena();
  at(s.actors[0], -4, 0, 4, { kind: 'cowboy' });
  const target = at(s.actors[1], 0.65, 0, 4, { yaw: -Math.PI / 2 });
  const box = at(s.props[0], -0.58, 0, 4);
  shoot(s, 0.6);
  stepMatch(s);
  assert.equal(box.last, 0);
  assert.equal(target.load, 0);
  const high = arena();
  at(high.actors[0], -4, 0, 4, { kind: 'cowboy' });
  at(high.actors[1], -0.08, 0, 4, { kind: 'cowboy' });
  shoot(high, 2.4);
  tick(high, 12);
  assert.equal(high.actors[1].load, 0);
  const cross = arena();
  at(cross.actors[0], -4, 0, 4);
  const runner = at(cross.actors[1], 0.82, 0, 5, { kind: 'cowboy', vx: -30 });
  cross.shots.push({ id: 1, owner: 0, x: 0, y: 1.2, z: 4.4, dx: 0, dy: 0, dz: 1, life: 1 });
  stepMatch(cross);
  assert.equal(runner.last, 0);
});

test('stationary blocks support a landing and a second jump without a sideways kick', () => {
  const s = arena(),
    a = at(s.actors[0], 0, 2.8, 5);
  at(s.props[0], 0, 0, 5, { rot: 0.35 });
  tick(s, 100);
  const y = a.y;
  assert.ok(a.ground && y > 0.89 && y < 0.99);
  tick(s, 150);
  assert.ok(a.ground && Math.abs(a.y - y) < 0.015 && Math.hypot(a.x, a.z - 5) < 0.04);
  assert.equal(s.events.filter((e) => e.type === 'land' && e.who === a.id).length, 1);
  stepMatch(s, { 0: { jump: true } });
  assert.ok(!a.ground && a.vy > 6 && a.y > y + 0.08);
});

test('a foot on the rim or an intact edge can carry weight, and a cleared opening drops the fighter', () => {
  const s = arena(),
    a = at(s.actors[0], RADIUS + 0.23, 0, 0);
  tick(s, 12);
  assert.ok(a.ground);
  at(a, RADIUS + 0.69, 0, 0);
  tick(s, 15);
  assert.ok(!a.ground && a.y < -0.35);
  s.glass[0].down = 3;
  const [gx, gz] = GLASS[0];
  at(a, gx + 0.84, 0, gz);
  tick(s, 12);
  assert.ok(a.ground);
  at(a, gx, 0, gz);
  tick(s, 15);
  assert.ok(!a.ground && a.y < -0.35);
  at(a, 0, -0.3, 4, { vy: 0.3 });
  tick(s, 4);
  assert.ok(!a.ground && a.y < 0);
});

test('contact impulses reflect mass and preserve head-on momentum without a second hit at rest', () => {
  const s = arena();
  s.event = 'float';
  s.eventUntil = 5;
  const a = at(s.actors[0], -0.62, 1, 5, { kind: 'hammer', vx: 15, stun: 1 });
  const b = at(s.props[0], 0.7, 1, 5, { vx: -15 });
  stepMatch(s);
  assert.ok(a.x < b.x && b.vx > a.vx);
  assert.ok(b.vx + 15 > 15 - a.vx, 'the lighter crate changes speed more than the hammer fighter');
  // Before contact both bodies lose the same small amount of momentum to air drag.
  assert.ok(Math.abs(1.3 * a.vx + 0.68 * b.vx - (1.3 - 0.68) * 15) < 0.33);
  assert.equal(a.load, 0);
  const stack = arena(),
    lower = at(stack.props[0], 0, 0, 5),
    upper = at(stack.props[1], 0, 1.2, 5);
  tick(stack, 180);
  assert.ok(upper.ground && upper.y > 0.9 && upper.y < 0.94 && lower.y === 0);
});

test('a jump clears the rotating shaft by sole height and a weapon needs physical contact', () => {
  function crossing(y) {
    const s = arena();
    s.angle = 0;
    s.event = 'float';
    s.eventUntil = 2;
    const a = at(s.actors[0], 3, y, 0, { barCD: 0 });
    stepMatch(s);
    return a;
  }
  assert.equal(crossing(0.94).load, 0);
  assert.ok(crossing(0.3).load > 0);
  const s = arena(),
    a = at(s.actors[0], 0, 0, 5, { kind: 'hammer' });
  const above = at(s.actors[1], 0, 2.41, 6.75),
    behind = at(s.actors[2], 0, 0, 3.3);
  stepMatch(s, { 0: { hit: true, aimYaw: 0 } });
  assert.equal(above.load, 0);
  assert.equal(behind.load, 0);
  const high = updateCollider(above, s.t),
    low = updateCollider(a, s.t);
  assert.equal(bodyContact(high, low, v()), 0);
});

test('off-centre impacts spin a box in opposite directions and centred shots push it straight', () => {
  function fire(offset) {
    const s = arena();
    at(s.actors[0], -3, 0, 5);
    const box = at(s.props[0], 0, 0, 5);
    s.shots.push({ id: 1, owner: 0, x: -0.9, y: 0.5, z: 5 + offset, dx: 1, dy: 0, dz: 0, life: 1 });
    tick(s, 3);
    assert.ok(box.vx > 8);
    return box.rot;
  }
  assert.ok(Math.abs(fire(0)) < 0.001);
  const left = fire(-0.33),
    right = fire(0.33);
  assert.ok(right > 0.15 && Math.abs(left + right) < 0.001);
});

test('overlapping grounded fighters separate laterally and settle without gaining energy', () => {
  const s = arena();
  for (const b of s.actors) at(b, 0, 0, 5, { yaw: b.id * 0.7 });
  for (let i = 0; i < 100; i++) {
    stepMatch(s);
    for (const a of s.actors)
      assert.ok(a.ground && Math.abs(a.y) < 0.01 && Math.hypot(a.vx, a.vy, a.vz) < 0.01);
  }
  const shapes = s.actors.map((a) => updateCollider(a, s.t));
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) assert.ok(bodyContact(shapes[i], shapes[j], v()) < 0.015);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, frameOf, betweenFrames } from '../sim.js';
import { validFrame } from '../match.js';
import { jellyShape } from '../jelly.js';
import { makeFighter, poseFighter } from '../assets/fighters.js';

function practice() {
  const s = createMatch({ seed: 61 });
  for (const bot of s.actors.slice(1)) bot.dead = 999;
  for (const block of s.props) block.dead = 999;
  Object.assign(s.actors[0], { x: 6, y: 0, z: 0, ground: true, barCD: 999 });
  return s;
}

test('a jump stretches the body, landing compresses it, and the rebound decays at rest', () => {
  const s = practice(),
    a = s.actors[0];
  const airborne = [],
    grounded = [];
  for (let i = 0; i < 190; i++) {
    stepMatch(s, { 0: { jump: i === 0 } });
    (a.ground ? grounded : airborne).push(a.soft.height);
  }
  const trough = grounded.indexOf(Math.min(...grounded));
  assert.ok(Math.max(...airborne) > 0.16);
  assert.ok(grounded[trough] < -0.16 && Math.max(...grounded.slice(trough)) > 0.04);
  assert.ok(Math.abs(a.soft.height) < 0.001);
  assert.equal(s.events.filter((e) => e.type === 'land' && e.who === 0).length, 1);
  function landing(height) {
    const s = practice(),
      a = s.actors[0];
    Object.assign(a, { y: height, ground: false });
    let minimum = 0;
    for (let i = 0; i < 130; i++) {
      stepMatch(s);
      minimum = Math.min(minimum, a.soft.height);
    }
    return -minimum;
  }
  assert.ok(landing(3) > landing(0.35) * 1.45);
});

test('knockback leaves a directional lag which interpolates in new clips and resets on respawn', () => {
  const s = practice(),
    a = s.actors[0],
    b = s.actors[1];
  Object.assign(a, { x: 0, z: 5.5, kind: 'hammer', yaw: Math.PI / 2, inv: 0, ac: 0 });
  Object.assign(b, { x: 2.1, y: 0, z: 5.5, vx: 0, vy: 0, vz: 0, dead: 0, human: true, inv: 0, barCD: 999 });
  const before = frameOf(s);
  stepMatch(s, { 0: { hit: true } });
  const after = frameOf(s);
  assert.ok(b.vx > 0 && b.soft.leanX < 0 && b.soft.height < 0);
  const half = betweenFrames(before, after, 0.5);
  assert.ok(half.actors[1].jelly.every((n, i) => Math.abs(n - after.actors[1].jelly[i] * 0.5) < 1e-9));
  const old = {
    ...before,
    actors: before.actors.map((a) => {
      const { jelly, ...rest } = a;
      return rest;
    }),
  };
  assert.ok(validFrame(old));
  assert.ok(Number.isFinite(jellyShape(betweenFrames(old, old, 0.5).actors[1], 1).height));
  b.dead = 0.001;
  stepMatch(s);
  assert.deepEqual(frameOf(s).actors[1].jelly, [0, 0, 0]);
});

test('all four fighters preserve gel volume while hard attachments keep their dimensions', () => {
  for (const kind of ['hammer', 'knight', 'cowboy', 'spark']) {
    const g = makeFighter(kind, 1, 2),
      r = g.userData.jellyRig;
    g.position.set(2, 3, -1);
    for (const height of [-0.32, 0.28]) {
      poseFighter(g, { time: 0.7, jelly: [height, 0.25, -0.12], yaw: 1.2, speed: 0.6 });
      assert.ok(Math.abs(r.torso.matrix.determinant() - 1) < 1e-8);
      assert.deepEqual(g.position.toArray(), [2, 3, -1]);
      for (const part of [r.left, r.right, r.footL, r.footR])
        assert.deepEqual(part.scale.toArray(), [1, 1, 1]);
      if (kind === 'spark') assert.ok(r.head.matrix.equals(r.torso.matrix));
      else assert.deepEqual(r.head.scale.toArray(), [1, 1, 1]);
    }
    assert.equal(r.torso.material[1].transparent, true);
    assert.equal(r.torso.material[0].transparent, false);
    assert.deepEqual(
      r.torso.geometry.groups.map((g) => g.materialIndex),
      [0, 1],
    );
  }
});

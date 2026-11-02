import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, frameOf, stepMatch, STEP } from '../sim.js';
import { Highlights, validFrame } from '../match.js';
import { loadProfile, MODES, MAP_IDS } from '../data.js';
import { ARENA, GLASS_WARNING } from '../arena-geometry.js';

function arena(mode = 'brawl') {
  const s = createMatch({ mode, players: 2, seed: 51 });
  for (const a of s.actors) Object.assign(a, { dead: 999, human: true, inv: 0, ac: 0, sc: 0, barCD: 999 });
  for (const p of s.props) p.dead = 999;
  return s;
}
function place(a, x, z, extra = {}) {
  Object.assign(a, { dead: 0, x, y: 0, z, vx: 0, vy: 0, vz: 0, ground: true }, extra);
  return a;
}
function tick(s, n) {
  for (let i = 0; i < n; i++) stepMatch(s);
}

test('hammer knockback scales with accumulated load, while a shield deflects the attacker', () => {
  function swing(load, guard = 0) {
    const s = arena();
    place(s.actors[0], 0, 3.5, { kind: 'hammer', yaw: 0 });
    place(s.actors[1], 0, 5.6, { load, guard });
    stepMatch(s, { 0: { hit: true } });
    return s.actors;
  }
  const light = swing(0)[1],
    heavy = swing(80)[1];
  assert.ok(heavy.vy > light.vy * 1.5);
  assert.ok(heavy.vz > light.vz * 1.5);
  assert.equal(light.last, 0);
  const [attacker, shield] = swing(20, 1);
  assert.equal(shield.load, 20);
  assert.equal(attacker.last, 1);
});
test('a launched foam block transfers momentum and knockout credit', () => {
  const s = arena();
  place(s.actors[0], -3, 5);
  const target = place(s.actors[1], 2, 5);
  place(s.props[0], 0.8, 5, { vx: 16, last: 0, lastAt: 0 });
  stepMatch(s);
  assert.ok(target.vx > 4);
  assert.equal(target.last, 0);
  assert.ok(target.load > 0);
  place(target, 9, 5, { y: -3.5 });
  stepMatch(s);
  assert.equal(s.actors[0].score, 1);
  assert.equal(target.falls, 1);
  assert.ok(target.dead > 0);
  tick(s, 102);
  assert.equal(target.dead, 0);
  assert.equal(target.load, 0);
  assert.ok(target.inv > 0);
});
test('cowboy chain shot strikes two distinct targets', () => {
  const s = arena();
  place(s.actors[0], -3, 5, { kind: 'cowboy', yaw: Math.PI / 2 });
  place(s.actors[1], -1, 5);
  place(s.actors[2], 2, 5);
  stepMatch(s, { 0: { skill: true } });
  tick(s, 12);
  assert.ok(s.events.some((e) => e.type === 'chain'));
  assert.equal(s.actors[1].last, 0);
  assert.equal(s.actors[2].last, 0);
});
test('skills impart angular impulse, collapse glass and create a real fall-through opening', () => {
  const s = arena();
  place(s.actors[0], 3.6, -1.5, { kind: 'hammer' });
  stepMatch(s, { 0: { skill: true } });
  assert.notEqual(s.spinKick, 0);
  assert.ok(s.glass[1].warn > 0);
  tick(s, Math.ceil(GLASS_WARNING / STEP) + 1);
  assert.ok(s.glass[1].down > 0);
  place(s.actors[1], ...ARENA.glass[1]);
  tick(s, 25);
  assert.ok(s.actors[1].y < -0.6);
  tick(s, 280);
  assert.equal(s.glass[1].down, 0);
});
test('flag capture requires the home flag and awards a single capture', () => {
  const s = arena('flag');
  const a = place(s.actors[0], ARENA.flagX, 0);
  stepMatch(s);
  assert.equal(s.obj.flags[1].carrier, 0);
  place(a, -ARENA.flagX, 0);
  s.obj.flags[0].away = 5;
  s.obj.flags[0].x = -2;
  stepMatch(s);
  assert.equal(s.obj.teams[0], 0);
  Object.assign(s.obj.flags[0], { x: -ARENA.flagX, z: 0, away: 0 });
  stepMatch(s);
  assert.equal(s.obj.teams[0], 1);
  assert.equal(s.obj.flags[1].carrier, -1);
});
test('zone and cart objectives respect contesting teams, and the crown scores for its holder', () => {
  const zone = arena('zone');
  place(zone.actors[0], 0, 1);
  place(zone.actors[3], 0, -1);
  stepMatch(zone);
  assert.deepEqual(zone.obj.teams, [0, 0]);
  zone.actors[3].dead = 20;
  stepMatch(zone);
  assert.equal(zone.obj.teams[0], STEP);
  const cart = arena('cart');
  place(cart.actors[0], 0, 1);
  place(cart.actors[3], 0, -0.7);
  stepMatch(cart);
  assert.equal(cart.obj.cart, 0);
  cart.actors[3].dead = 20;
  stepMatch(cart);
  assert.ok(cart.obj.cart > 0);
  const king = arena('king');
  place(king.actors[0], 0, 0);
  tick(king, 20);
  assert.equal(king.obj.crown.carrier, 0);
  assert.ok(king.actors[0].score > 0.2);
});
test('each adventure stage supports solo and two-player co-op and ends at its own target', () => {
  for (const players of [1, 2])
    for (let level = 0; level < MAP_IDS.length; level++) {
      const s = createMatch({ mode: 'adventure', level, players });
      assert.equal(s.config.map, MAP_IDS[level]);
      assert.equal(s.actors.length, Math.min(6, players + 2 + level));
      assert.equal(s.actors.filter((a) => a.team === 0).length, players);
      assert.equal(s.target, 3 + level);
      s.obj.teams[0] = s.target - 1;
      const b = s.actors.at(-1);
      place(b, 9, 0, { y: -4, last: 0, lastAt: s.t });
      stepMatch(s);
      assert.deepEqual(s.end.winners, [0]);
    }
});
test('zero gravity suspends free bodies until the event ends', () => {
  const s = arena();
  s.event = 'float';
  s.eventUntil = 2;
  const a = place(s.actors[0], 6, 0, { y: 2, ground: false });
  tick(s, 55);
  assert.equal(a.y, 2);
  tick(s, 105);
  assert.ok(a.y < 1);
  assert.equal(s.event, '');
});
test('every mode reaches a finite result with valid playback frames', () => {
  for (const mode of Object.keys(MODES)) {
    const s = createMatch({ mode, players: 2, seed: 17 });
    const rec = new Highlights(s.config);
    for (let i = 0; i < 6300 && !s.end; i++) {
      stepMatch(s);
      if (i % 6 === 0) rec.record(frameOf(s), s.events.splice(0));
    }
    assert.ok(s.end, mode);
    const clip = rec.finish();
    assert.ok(clip.frames.every(validFrame), mode);
    assert.ok(clip.frames.length >= 3);
    const data = { version: 1, games: 3, kind: 'spark', clips: [clip] };
    assert.equal(loadProfile({ getItem: () => JSON.stringify(data) }).clips.length, 1);
  }
});

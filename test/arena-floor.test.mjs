import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, frameOf, betweenFrames, STEP } from '../sim.js';
import {
  ARENA,
  GLASS_HALF,
  GLASS_WARNING,
  GLASS_REPAIR,
  hasFloorAt,
  layoutFor,
} from '../arena-geometry.js';
import { makeStage, updateStage } from '../assets/stages.js';
import { ArenaCamera } from '../camera.js';
import { Raycaster, Vector3 } from '../assets/three.module.min.js';

function practice(map = 'cloud') {
  const s = createMatch({ map, seed: 35 });
  s.nextEvent = Infinity;
  for (const b of [...s.actors, ...s.props]) Object.assign(b, { dead: 999, barCD: 999 });
  return s;
}
function place(b, x, y, z, extra = {}) {
  return Object.assign(b, { x, y, z, vx: 0, vy: 0, vz: 0, dead: 0, yaw: 0, rot: 0, ground: y === 0 }, extra);
}

test('a descending crate cannot push a fighter through intact deck during pair separation', () => {
  for (const height of [1.35, 1.6, 1.83]) {
    const s = practice(),
      a = place(s.actors[0], 1, 0.025, 5.5, { vx: 0.9, vy: -0.01 });
    place(s.props[0], 1, height, 5.5, { vy: -11 });
    for (let i = 0; i < 75; i++) {
      stepMatch(s, { 0: { z: 0.8 } });
      assert.ok(a.y >= -1e-8 && a.falls === 0, `crate height ${height}, tick ${i}`);
    }
    assert.ok(a.ground);
  }
  const s = practice(),
    a = place(s.actors[0], 1, -0.02, 5.5, { vy: -0.5 });
  stepMatch(s);
  assert.ok(a.ground && a.y === 0);
  place(a, 1, -0.32, 5.5, { vy: 0.2 });
  stepMatch(s);
  assert.ok(!a.ground && a.y < 0);
});

test('ordinary running crosses intact glass and the new outer lane on all three maps', () => {
  for (const map of ['cloud', 'soda', 'orbit']) {
    const s = practice(map),
      a = s.actors[0];
    for (const [x, z] of ARENA.glass) {
      place(a, x - 2.3, 0, z);
      for (let i = 0; i < 120 && a.x < x + 2.2; i++) {
        stepMatch(s, { 0: { x: 1 } });
        assert.ok(a.ground && a.y === 0 && a.falls === 0);
        assert.ok(s.glass.every((g) => g.warn === 0 && g.down === 0));
      }
      assert.ok(a.x >= x + 2.2);
    }
    place(a, 13.3, 0, -4.5);
    while (a.z < 4.5 && s.t < 12) {
      stepMatch(s, { 0: { z: 1 } });
      assert.ok(a.ground && a.falls === 0);
    }
    assert.ok(a.z >= 4.5 && Math.hypot(a.x, a.z) < ARENA.radius);
    place(a, ARENA.radius + 5, 2, 0);
    stepMatch(s);
    assert.equal(a.dead, 0);
    for (let i = 0; i < 100 && !a.dead; i++) stepMatch(s);
    assert.equal(a.falls, 1);
    assert.equal(s.events.find((e) => e.type === 'ko').cause, 'edge');
  }
});

test('heavy landings telegraph an opening, repeated hits do not skip the warning, and the deck repairs', () => {
  const s = practice(),
    [x, z] = ARENA.glass[0],
    a = place(s.actors[0], x, 2.1, z, { kind: 'hammer', sc: 0 });
  while (!s.glass[0].warn && s.t < 2) stepMatch(s);
  const tile = s.glass[0];
  assert.equal(tile.warn, GLASS_WARNING);
  assert.ok(a.ground);
  for (let i = 0; i < 15; i++) stepMatch(s);
  const left = tile.warn;
  stepMatch(s, { 0: { skill: true } });
  assert.ok(Math.abs(tile.warn - (left - STEP)) < 1e-7);
  assert.equal(s.events.filter((e) => e.type === 'crack').length, 1);
  while (tile.warn > STEP) {
    stepMatch(s);
    assert.ok(tile.down === 0 && a.y === 0);
  }
  stepMatch(s);
  assert.equal(tile.down, GLASS_REPAIR);
  assert.ok(!hasFloorAt(ARENA, s.glass, x, z));
  for (let i = 0; i < 80 && !a.dead; i++) stepMatch(s);
  assert.equal(a.falls, 1);
  assert.equal(s.events.find((e) => e.type === 'ko').cause, 'glass');
  for (let i = 0; i < 250; i++) stepMatch(s);
  assert.equal(tile.down, 0);
  assert.ok(hasFloorAt(ARENA, s.glass, x, z) && a.dead === 0);
  assert.ok(
    ARENA.glass.every(([gx, gz]) => Math.max(Math.abs(a.x - gx), Math.abs(a.z - gz)) > GLASS_HALF + 0.7),
  );
});

test('the rendered deck matches physics from the outer lane to both open shafts', () => {
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  const scan = (meshes, x, z) => {
    ray.ray.origin.set(x, 3, z);
    return ray.intersectObjects(meshes, false);
  };
  for (const map of ['cloud', 'soda', 'orbit']) {
    const stage = makeStage(map),
      s = createMatch({ map, seed: 7 });
    const surfaces = () => {
      stage.updateMatrixWorld();
      const m = [];
      stage.traverseVisible((o) => {
        if (o.isMesh) m.push(o);
      });
      return m;
    };
    let meshes = surfaces();
    for (const [x, z] of ARENA.glass)
      assert.ok(scan(meshes, x, z).some((hit) => Math.abs(hit.point.y) < 0.03));
    s.glass.forEach((g) => (g.warn = 0.7));
    updateStage(stage, s);
    assert.ok(stage.userData.stage.tiles.every((tile) => tile.visible && tile.userData.cracks.visible));
    s.glass.forEach((g) => {
      g.warn = 0;
      g.down = 1;
    });
    updateStage(stage, s);
    meshes = surfaces();
    for (const [x, z] of ARENA.glass)
      for (const dx of [-0.72, 0, 0.72])
        for (const dz of [-0.72, 0, 0.72]) {
          assert.equal(hasFloorAt(ARENA, s.glass, x + dx, z + dz), false);
          assert.equal(scan(meshes, x + dx, z + dz).filter((hit) => hit.point.y > -1.9).length, 0);
        }
    for (const r of [7.8, 12.5, ARENA.radius - 0.16])
      for (let i = 0; i < 16; i++) {
        const x = r * Math.cos((i * Math.PI) / 8),
          z = r * Math.sin((i * Math.PI) / 8);
        if (!hasFloorAt(ARENA, s.glass, x, z)) continue;
        assert.ok(
          scan(meshes, x, z).some((hit) => Math.abs(hit.point.y) < 0.12),
          `${map}, missing deck at ${x},${z}`,
        );
      }
  }
});

test('old clips retain their layout and interpolated glass changes at the recorded crossing', () => {
  const s = createMatch(),
    old = layoutFor({ map: 'cloud' }),
    wide = layoutFor(s.config);
  assert.equal(wide.radius, 2 * old.radius);
  assert.deepEqual(old.glass, [
    [-4, 3],
    [4, -3],
  ]);
  const camera = new ArenaCamera();
  camera.resize(1280, 720, old);
  const half = camera.overview.top;
  camera.resize(1280, 720, wide);
  assert.equal(camera.overview.top, half * 2);
  assert.equal(createMatch({ mode: 'cart' }).target, wide.cartEnd);
  const from = frameOf(s),
    to = frameOf(s);
  from.t = 1;
  to.t = 1.1;
  from.glass[0] = { warn: 0.06, down: 0 };
  to.glass[0] = { warn: 0, down: 3.96 };
  assert.ok(betweenFrames(from, to, 0.3).glass[0].warn > 0);
  assert.ok(betweenFrames(from, to, 0.8).glass[0].down > 0);
  from.glass[0] = { warn: 0, down: 0.06 };
  to.glass[0] = { warn: 0, down: 0 };
  assert.ok(betweenFrames(from, to, 0.3).glass[0].down > 0);
  assert.equal(betweenFrames(from, to, 0.8).glass[0].down, 0);
  s.glass[0].down = 0.0001;
  assert.ok(frameOf(s).glass[0].down > 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Raycaster } from '../assets/three.module.min.js';
import { createMatch, stepMatch, frameOf } from '../sim.js';
import { hasFloorAt, layoutFor, BELT_SPEED } from '../arena-geometry.js';
import { makeStage, updateStage } from '../assets/stages.js';
import { castStage } from '../colliders.js';
import { routeOnDeck } from '../navigation.js';

function practice(map, mode = 'brawl') {
  const s = createMatch({ map, mode, seed: 8421 });
  s.nextEvent = Infinity;
  for (const b of [...s.actors, ...s.props]) b.dead = 999;
  return s;
}
function place(b, x, z, y = 0) {
  return Object.assign(b, {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    dead: 0,
    ground: y === 0,
    supportY: 0,
    rot: 0,
    stun: 0,
  });
}
test('all three bridges carry a running fighter over both seams; the spaces between them are water', () => {
  for (const z of [-9, 0, 9]) {
    const s = practice('dock'),
      a = place(s.actors[0], -5.2, z);
    for (let i = 0; i < 160 && a.x < 5.2; i++) {
      stepMatch(s, { 0: { x: 1 } });
      assert.ok(a.ground && a.y === 0 && a.falls === 0);
    }
    assert.ok(a.x >= 5.2);
  }
  for (const [map, z] of [
    ['dock', 5.4],
    ['dock', -5.8],
    ['pinball', 12.4],
  ]) {
    const s = practice(map),
      a = place(s.actors[0], 0, z);
    for (let i = 0; i < 80 && !a.dead; i++) stepMatch(s);
    assert.equal(a.falls, 1);
    assert.equal(s.events.find((e) => e.type === 'ko').cause, 'edge');
    for (let i = 0; i < 115; i++) stepMatch(s);
    assert.equal(a.dead, 0);
    assert.ok(hasFloorAt(s.arena, s.glass, a.x, a.z));
  }
});
test('both belts carry resting fighters and loose crates, and release airborne bodies', () => {
  for (const body of ['actors', 'props'])
    for (const i of [0, 1]) {
      const s = practice('dock'),
        b = s.arena.belts[i],
        a = place(s[body][0], b.x, -b.direction * 4);
      const initial = a.z;
      for (let i = 0; i < 90; i++) stepMatch(s);
      assert.ok(a.ground && (a.z - initial) * b.direction > 3.5);
      assert.ok(Math.abs(a.vz - BELT_SPEED * b.direction) < 0.17);
      place(a, b.x, 0, 3.4);
      for (let i = 0; i < 15; i++) stepMatch(s);
      assert.equal(a.vz, 0);
      assert.equal(a.z, 0);
    }
});
test('mushrooms kick a fighter and a box away from their real impact point and block bubble shots', () => {
  for (const body of ['actors', 'props']) {
    const s = practice('pinball'),
      [x, z] = s.arena.bumpers[0],
      b = place(s[body][0], x - 2.45, z);
    b.vx = 11;
    for (let i = 0; i < 35 && !s.events.some((e) => e.type === 'bumper'); i++) stepMatch(s);
    assert.ok(s.events.some((e) => e.type === 'bumper') && b.vx < -6.9 && b.vy > 3.9);
    assert.ok(b.x < x && b.dead === 0);
  }
  const s = practice('pinball'),
    [x, z] = s.arena.bumpers[0];
  const a = place(s.actors[0], x, z, 2.7);
  for (let i = 0; i < 90 && !s.events.some((e) => e.type === 'bumper'); i++) stepMatch(s);
  assert.ok(a.vy > 8 && a.falls === 0);
  const origin = new Vector3(x - 3, 1.05, z),
    delta = new Vector3(6, 0, 0);
  const hit = castStage(s.arena, origin, delta, 0, 0);
  assert.ok(hit > 0.26 && hit < 0.32);
  assert.equal(castStage(s.arena, new Vector3(0, 0.54, -2), new Vector3(0, 0, 4), 0, 0), Infinity);
  assert.equal(castStage(practice('dock').arena, origin, delta, 0, 0), Infinity);
  const gun = place(s.actors[0], x - 3, z);
  gun.kind = 'cowboy';
  gun.ac = 0;
  const target = place(s.actors[1], x + 2.25, z);
  target.human = true;
  target.inv = 0;
  for (let i = 0; i < 28; i++) stepMatch(s, i === 0 ? { 0: { hit: true, aimYaw: Math.PI / 2 } } : {});
  assert.equal(target.load, 0);
  assert.equal(s.shots.length, 0);
});
test('rendered bridges, holes, flipper lanes, glass and animated belt arrows match the playable surfaces', () => {
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  for (const map of ['dock', 'pinball']) {
    const s = practice(map),
      layout = layoutFor(s.config),
      stage = makeStage(map);
    const points =
      map === 'dock'
        ? [
            [0, 0, true],
            [0, 9, true],
            [0, -9, true],
            [-3.6, 1, true],
            [0, 5.4, false],
            [0, -5.5, false],
            [0, 11.5, false],
            [14, 9, true],
            [17.7, 0, false],
          ]
        : [
            [0, 0, true],
            [0, 9, true],
            [0, 12.4, false],
            [-5, 12, true],
            [5, 12, true],
            [15, 6, false],
            [-15, -6, true],
          ];
    const tiles = stage.userData.stage.tiles;
    const visible = () => {
      stage.updateMatrixWorld(true);
      const mesh = [];
      stage.traverseVisible((o) => {
        if (o.isMesh) mesh.push(o);
      });
      return mesh;
    };
    const floor = (meshes, x, z) => {
      ray.ray.origin.set(x, 2.7, z);
      return ray.intersectObjects(meshes, false).some((h) => h.point.y >= -0.04 && h.point.y < 0.08);
    };
    let meshes = visible();
    for (const [x, z, expected] of points) {
      assert.equal(hasFloorAt(layout, s.glass, x, z), expected, `${map} support ${x},${z}`);
      assert.equal(floor(meshes, x, z), expected, `${map} mesh ${x},${z}`);
    }
    for (const [x, z] of layout.glass) assert.ok(floor(meshes, x, z));
    s.glass.forEach((g) => (g.down = 3));
    updateStage(stage, frameOf(s));
    meshes = visible();
    assert.ok(tiles.every((t) => !t.visible));
    for (const [x, z] of layout.glass)
      for (const dx of [-0.6, 0, 0.6])
        for (const dz of [-0.6, 0, 0.6])
          assert.equal(floor(meshes, x + dx, z + dz), false, `${map} open hatch ${x + dx},${z + dz}`);
    assert.equal(stage.userData.stage.rotor, null);
    for (const { belt, marks } of stage.userData.stage.treads) {
      updateStage(stage, { t: 0 });
      const start = marks[1].position.z;
      updateStage(stage, { t: 0.2 });
      assert.ok(Math.abs(marks[1].position.z - start - 0.2 * BELT_SPEED * belt.direction) < 1e-7);
    }
  }
});
test('spawns and mode objectives are supported with broken hatches, and bots can route around the open water', () => {
  for (const map of ['dock', 'pinball']) {
    for (const mode of ['brawl', 'king', 'flag', 'cart', 'zone', 'adventure']) {
      const s = createMatch({ map, mode, level: map === 'dock' ? 3 : 4, players: 2, seed: 333 });
      assert.equal(s.config.map, map);
      s.glass.forEach((g) => (g.down = 1));
      for (const body of [...s.actors, ...s.props, ...s.obj.flags, s.obj.crown])
        assert.ok(hasFloorAt(s.arena, s.glass, body.x, body.z));
      for (let x = -s.arena.cartEnd; x <= s.arena.cartEnd; x += 0.25)
        assert.ok(hasFloorAt(s.arena, s.glass, x, 1));
      if (mode === 'cart') assert.equal(s.target, s.arena.cartEnd);
    }
  }
  for (const [z1, z2] of [
    [6, 6],
    [-5.8, -6],
    [7, -6],
  ]) {
    const s = practice('dock'),
      a = place(s.actors[0], -10.4, z1),
      goal = { x: 10.4, z: z2 };
    let next;
    for (let i = 0; i < 540 && Math.hypot(a.x - goal.x, a.z - goal.z) > 0.85; i++) {
      if (i % 9 === 0) next = routeOnDeck(s.arena, s.glass, a, goal);
      const dx = next.x - a.x,
        dz = next.z - a.z,
        mag = Math.max(0.1, Math.hypot(dx, dz));
      stepMatch(s, { 0: { x: dx / mag, z: dz / mag } });
      assert.ok(a.ground && a.falls === 0, `route ${z1} to ${z2}, tick ${i}`);
    }
    assert.ok(Math.hypot(a.x - goal.x, a.z - goal.z) < 0.86, `arrived on other shore at ${a.x},${a.z}`);
  }
});
test('a flag bot takes a bridge to retrieve a flag on the other bank and scores on returning', () => {
  const s = practice('dock', 'flag'),
    bot = place(s.actors[1], -11, 6.1);
  Object.assign(s.obj.flags[1], { x: 11, z: 6.1, away: 999 });
  let pickedUp = false;
  for (let i = 0; i < 950 && s.obj.teams[0] === 0; i++) {
    stepMatch(s);
    pickedUp ||= s.obj.flags[1].carrier === bot.id;
    assert.ok(bot.y >= 0 && bot.falls === 0);
  }
  assert.ok(pickedUp);
  assert.equal(s.obj.teams[0], 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Raycaster, Triangle, Vector3 } from '../assets/three.module.min.js';
import { makeFighter, poseFighter } from '../assets/fighters.js';
import { createMatch, frameOf, stepMatch } from '../sim.js';
import { updateCollider } from '../colliders.js';
import { placeFighter } from '../fighter-rig.js';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const extremes = [
  { jelly: [0, 0, 0], time: 0 },
  { jelly: [-0.33, 0.32, -0.27], speed: 0.9, yaw: 0.71, time: 0.35 },
  { jelly: [0.29, -0.29, 0.32], air: 1, tumble: 0.8, yaw: -1.23, time: 1.2 },
  { air: 0.8, tumble: 0.7, speed: 0.9, time: 0.48 }, // Replays recorded before jelly offsets.
];

function sightLine(mount, from, at) {
  const origin = from.applyMatrix4(mount.matrixWorld);
  return new Raycaster(origin, at.applyMatrix4(mount.matrixWorld).sub(origin).normalize());
}
function faceColor(hit) {
  return new Color().fromBufferAttribute(hit.object.geometry.attributes.color, hit.face.a).getHex();
}

test('the entire lightning emblem and the full circumference of the headband remain exposed', () => {
  const fighter = makeFighter('spark'),
    { torso, head } = fighter.userData.jellyRig;
  const surfaces = [torso, head],
    g = head.geometry,
    marks = [];
  for (let i = 0; i < g.index.count; i += 3) {
    const index = g.index.getX(i);
    const p = v().fromBufferAttribute(g.attributes.position, index);
    if (
      Math.abs(p.x) > 0.14 ||
      p.y < 1.51 ||
      p.y > 1.82 ||
      p.z < 0.41 ||
      new Color().fromBufferAttribute(g.attributes.color, index).getHex() !== 0xffeb72
    )
      continue;
    const triangle = new Triangle(
      p,
      ...[1, 2].map((j) => v().fromBufferAttribute(g.attributes.position, g.index.getX(i + j))),
    );
    if (triangle.getNormal(v()).z > 0.8 && triangle.getArea() > 0.00005) {
      const center = triangle.getMidpoint(v());
      for (const corner of [triangle.a, triangle.b, triangle.c])
        marks.push(corner.clone().lerp(center, 0.12));
    }
  }
  marks.sort((a, b) => a.y - b.y);
  assert.ok(marks.at(-1).y - marks[0].y > 0.1);
  for (const pose of extremes) {
    poseFighter(fighter, pose);
    fighter.updateMatrixWorld();
    assert.ok(head.matrixWorld.equals(torso.matrixWorld));
    for (const p of [marks[0], marks[Math.floor(marks.length / 2)], marks.at(-1)]) {
      const ray = sightLine(head, p.clone().add(v(0, 0.65, 2)), p.clone());
      assert.equal(
        faceColor(ray.intersectObjects(surfaces, false)[0]),
        0xffeb72,
        'both tips and the centre of the badge',
      );
    }
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) * Math.PI) / 6,
        y = 1.635;
      const hit = sightLine(head, v(3 * Math.sin(a), y, 3 * Math.cos(a)), v(0, y, 0)).intersectObjects(
        surfaces,
        false,
      )[0];
      assert.equal(faceColor(hit), 0x513f91, 'skin must stay behind the purple band');
    }
  }
});

test('hairclips and bow knots stay on the visible side of their mounts for every costume', () => {
  for (const kind of ['spark', 'hammer', 'knight', 'cowboy'])
    for (const outfit of [1, 2]) {
      const group = makeFighter(kind, 2, outfit),
        { head, torso } = group.userData.jellyRig;
      const mount = kind === 'hammer' ? torso : head,
        attributes = mount.geometry.attributes;
      const wanted = outfit === 1 ? 0xffdc57 : 0xffd576,
        center = v();
      let count = 0;
      for (let i = 0; i < attributes.position.count; i++) {
        const p = v().fromBufferAttribute(attributes.position, i);
        if (p.y > 1.48 && new Color().fromBufferAttribute(attributes.color, i).getHex() === wanted) {
          center.add(p);
          count++;
        }
      }
      assert.ok(count > 0);
      center.divideScalar(count);
      for (const pose of extremes) {
        poseFighter(group, pose);
        group.updateMatrixWorld();
        const start = center.clone().add(v(outfit === 1 ? -1.7 : 1.7, 0.85, 1.3));
        const hit = sightLine(mount, start, center.clone()).intersectObjects([head, torso], false)[0];
        assert.equal(faceColor(hit), wanted, `${kind}, outfit ${outfit}`);
      }
    }
});

test('rigid shells enclose the deformed crown, with the simulated helmet at its rendered position', () => {
  for (const kind of ['knight', 'cowboy']) {
    const fighter = makeFighter(kind, 1, 2),
      { torso, head } = fighter.userData.jellyRig;
    const heights = kind === 'knight' ? [1.59, 1.68, 1.81, 1.96, 2.03] : [1.79, 1.86, 1.98, 2.09, 2.13];
    for (const pose of [...extremes, { jelly: [0.31, 0, 0], time: 0 }]) {
      poseFighter(fighter, pose);
      fighter.updateMatrixWorld();
      for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(v().setFromMatrixColumn(head.matrixWorld, axis).length() - 1) < 1e-10);
      const crownInHat = head.worldToLocal(torso.localToWorld(v(0, 1.949, 0)));
      const brim = kind === 'knight' ? 1.55 : 1.716;
      assert.ok(crownInHat.y > brim + 0.05, 'the crown must remain seated inside the brim');
      for (const y of heights)
        for (let i = 0; i < 8; i++) {
          const a = ((i + 0.5) * Math.PI) / 4;
          const ray = sightLine(head, v(3 * Math.sin(a), y, 3 * Math.cos(a)), v(0, y, 0));
          const shell = ray.intersectObject(head, false)[0];
          const skin = ray.intersectObject(torso, false).find((h) => h.face.materialIndex === 1);
          if (shell && skin)
            assert.ok(shell.distance < skin.distance, `${kind} crown exposed at ${y}, angle ${a}`);
        }
    }
    const s = createMatch({ picks: [{ kind }], seed: 23 }),
      a = s.actors[0];
    a.barCD = 99;
    let c;
    for (let i = 0; i < 75; i++) {
      stepMatch(s, { 0: { jump: i === 5, x: i < 23 ? 1 : 0 } });
      const f = frameOf(s),
        frame = f.actors[0];
      placeFighter(fighter, frame, f.t);
      fighter.updateMatrixWorld();
      c = updateCollider(frame, f.t, c);
      assert.ok(c.rig.userData.jellyRig.head.matrixWorld.equals(head.matrixWorld));
    }
  }
});

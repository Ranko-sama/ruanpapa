import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../assets/three.module.min.js';
import { ArenaCamera } from '../camera.js';
import { createMatch, frameOf, stepMatch, STEP } from '../sim.js';
import { cleanInput, Highlights } from '../match.js';

const actor = () => ({ id: 0, x: 2, y: 0, z: 4, yaw: -2.1, dead: 0 });
const ndc = (a, y, rig) => new Vector3(a.x, a.y + y, a.z).project(rig.camera);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} vs ${b}`);

test('shoulder framing, centered chase and the original overhead camera cycle in order', () => {
  const rig = new ArenaCamera(),
    a = actor();
  rig.resize(1280, 720);
  rig.update(a, STEP);
  const head = ndc(a, 2.16, rig),
    feet = ndc(a, 0, rig);
  assert.equal(rig.mode, 'shoulder');
  assert.ok(rig.camera.isPerspectiveCamera && head.x < -0.34 && head.x > -0.47);
  assert.ok(head.y < 0.12 && feet.y < -0.8);
  rig.cycle(a);
  rig.update(a, STEP);
  assert.equal(rig.mode, 'chase');
  close(ndc(a, 2.16, rig).x, 0);
  rig.cycle(a);
  rig.update(a, STEP);
  assert.ok(rig.camera.isOrthographicCamera);
  assert.deepEqual(rig.camera.position.toArray(), [0, 19, 23]);
  assert.deepEqual(rig.move(1, -1), { x: 1, z: -1 });
  assert.deepEqual(rig.aim(a, {}, false), {});
  rig.cycle(a);
  rig.resize(390, 844);
  rig.update(a, STEP);
  assert.equal(rig.mode, 'shoulder');
  assert.ok(Math.abs(ndc(a, 2.16, rig).x) < 0.5 && ndc(a, 0, rig).y > -1);
});

test('movement stays camera-relative while strafing and respawn recenters on the local fighter', () => {
  const rig = new ArenaCamera(),
    a = actor();
  rig.resize(1280, 720);
  a.yaw = Math.PI;
  rig.update(a, STEP);
  rig.turn(Math.PI / 2, 5);
  rig.update(a, STEP);
  close(rig.move(0, -1).x, 1);
  close(rig.move(1, 0).z, 1);
  const diagonal = rig.move(1, -1);
  close(Math.hypot(diagonal.x, diagonal.z), 1);
  a.yaw = -0.75;
  a.x += 1;
  rig.update(a, STEP);
  close(rig.yaw, Math.PI / 2);
  const before = rig.anchor.clone();
  a.dead = 1;
  a.y = -4;
  a.x = 14;
  rig.update(a, STEP);
  assert.ok(before.equals(rig.anchor));
  assert.ok(rig.camera.position.y >= 0.72);
  Object.assign(a, { x: -4, y: 1, z: -3, dead: 0, yaw: 1.4 });
  rig.update(a, STEP);
  assert.deepEqual(rig.anchor.toArray(), [-4, 1, -3]);
  close(rig.yaw, a.yaw);
});

test('a networked shoulder-view shot converges on the reticle even with a closer off-axis enemy', () => {
  const rig = new ArenaCamera(),
    s = createMatch({ mode: 'brawl', seed: 7 });
  for (const a of s.actors) Object.assign(a, { dead: 999, human: true, inv: 0, barCD: 999 });
  for (const p of s.props) p.dead = 999;
  const [shooter, decoy, target] = s.actors;
  Object.assign(shooter, { kind: 'cowboy', x: 0, y: 0, z: 5.2, yaw: Math.PI, dead: 0, ac: 0 });
  Object.assign(decoy, { x: -1.3, y: 0, z: 4.8, dead: 0 });
  rig.resize(1280, 720);
  rig.update(shooter, STEP);
  const center = rig.camera.getWorldDirection(new Vector3()).multiplyScalar(9).add(rig.camera.position);
  Object.assign(target, { x: center.x, y: center.y - 1.08, z: center.z, dead: 0 });
  const f = frameOf(s),
    aim = rig.aim(f.actors[0], f, false);
  const input = cleanInput({ ...aim, hit: true, x: -1 });
  stepMatch(s, { 0: input });
  assert.equal(s.shots.length, 1);
  close(s.shots[0].dy, Math.sin(aim.aimPitch));
  assert.ok(shooter.vx < 0 && s.shots[0].dx > 0);
  for (let i = 0; i < 35; i++) stepMatch(s);
  assert.equal(target.last, 0);
  assert.equal(decoy.last, -1);
  assert.equal(cleanInput({ x: 1 }).aimYaw, undefined);
  assert.equal(cleanInput({ aimYaw: Infinity }).aimYaw, undefined);
});

test('a guest highlight records its own fighter as the follow-camera subject', () => {
  const s = createMatch({ players: 2, seed: 3 }),
    rec = new Highlights(s.config, 1);
  for (let i = 0; i < 65; i++) {
    stepMatch(s);
    rec.record(frameOf(s), s.events.splice(0));
  }
  assert.equal(rec.finish().focusId, 1);
});

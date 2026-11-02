import { Group, Object3D } from './assets/three.module.min.js';
import { jellyShape } from './jelly.js';
import { seatHeadgear, SOLE_PIVOT } from './headgear.js';

// The arena renderer and the fixed-step collision model use the same attachment transforms.
export function makeFighterRig(kind, parts = Array.from({ length: 6 }, () => new Object3D())) {
  const group = new Group(),
    bodyRig = new Group();
  const [torso, head, left, right, footL, footR] = parts;
  group.name = `jelly-${kind}`;
  group.add(bodyRig);
  bodyRig.add(...parts);
  torso.matrixAutoUpdate = false;
  head.matrixAutoUpdate = kind !== 'spark';
  footL.position.set(-0.302, 0.185, 0);
  footR.position.set(0.302, 0.185, 0);
  group.userData.jellyRig = { kind, bodyRig, torso, head, left, right, footL, footR };
  poseFighter(group);
  return group;
}

export function placeFighter(group, pose, time) {
  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.set(
    pose.tumble * 0.19 * Math.sin(time * 8),
    pose.yaw,
    pose.tumble * 0.25 * Math.cos(time * 10),
  );
  poseFighter(group, pose, time + pose.id * 0.6);
}

const unit = (n) => Math.max(0, Math.min(1, Number(n) || 0));

/** Animates the toy without writing to the parent-controlled world transform. */
export function poseFighter(group, pose = {}, t = pose.time || 0) {
  const rig = group.userData.jellyRig;
  if (!rig) return;
  const { kind, bodyRig, torso, head, left, right, footL, footR } = rig;
  const speed = unit(pose.speed),
    air = unit(pose.air),
    flop = unit(pose.tumble),
    cheer = unit(pose.emote);
  const attack = unit(pose.attack),
    skill = unit(pose.skill);
  const swing = kind === 'cowboy' ? Math.sin((1 - attack) * Math.PI) : Math.sin((attack * Math.PI) / 2);
  const power = kind === 'knight' ? Math.sin((skill * Math.PI) / 2) : Math.sin((1 - skill) * Math.PI);
  const step = Math.sin(t * 12),
    idle = Math.sin(t * 2.85),
    wave = Math.sin(t * 16);
  const shape = jellyShape(pose, t),
    h = shape.height,
    w = shape.width;
  const yaw = pose.yaw || 0,
    cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const lx = cy * shape.leanX - sy * shape.leanZ,
    lz = sy * shape.leanX + cy * shape.leanZ;
  const base = SOLE_PIVOT;
  // A volume-preserving stretch and shear about the soles. Rigid gear follows its attachment.
  torso.matrix.set(w, lx, 0, -base * lx, 0, h, 0, base * (1 - h), 0, lz, w, -base * lz, 0, 0, 0, 1);
  torso.matrixWorldNeedsUpdate = true;
  seatHeadgear(kind, head, torso, h, w, lx, lz);
  const shoulder = 1.073 - base;
  left.position.set(-0.591 * w + shoulder * lx, base + shoulder * h, 0.013 * w + shoulder * lz);
  right.position.set(0.591 * w + shoulder * lx, base + shoulder * h, 0.013 * w + shoulder * lz);
  const lunge = kind === 'cowboy' ? 0 : swing;
  bodyRig.position.z = 0.38 * lunge + (kind === 'knight' ? 0.29 * power : 0);
  right.position.x -= 0.24 * lunge;
  right.position.z += 0.24 * lunge;
  bodyRig.position.y = Math.abs(step) * speed * 0.092 + cheer * (0.075 + 0.072 * wave);
  bodyRig.rotation.set(
    speed * 0.095 - air * 0.115 + flop * 0.34 * Math.sin(t * 10),
    Math.sin(t * 2.2) * 0.028 - lunge * 0.23,
    step * speed * 0.052 + flop * 0.36 * Math.cos(t * 9) + cheer * 0.084 * wave,
  );
  left.rotation.set(step * speed * 0.5 + power * 0.13, -0.04, -0.065 + idle * 0.034 - air * 0.53);
  right.rotation.set(-step * speed * 0.46, 0.03, 0.065 - idle * 0.033 + air * 0.48);
  if (kind === 'hammer')
    right.rotation.set(
      right.rotation.x + swing * 0.64 + power * 0.52,
      -swing * 1.27 - power * 1.1,
      right.rotation.z - swing * 0.1 + power * 0.26,
    );
  if (kind === 'knight') {
    right.rotation.x += swing * 0.88;
    right.rotation.y -= swing * 1.28;
    right.rotation.z -= swing * 0.12;
    left.position.z += power * 0.27;
    left.rotation.x -= power * 0.44;
    left.rotation.y += power * 0.69;
    left.rotation.z += power * 0.2;
  }
  if (kind === 'cowboy') {
    right.rotation.y -= swing * 0.89 + power * 1.07;
    right.rotation.x -= swing * 0.21;
    right.rotation.z += swing * 0.25;
  }
  if (kind === 'spark') {
    right.rotation.x -= swing * 0.66;
    right.rotation.y -= swing * 1.05;
    left.rotation.x -= power * 1.08;
    right.rotation.z += power * 0.85;
    left.rotation.z -= power * 0.85;
  }
  left.rotation.z -= cheer * (1.95 + 0.34 * wave) + flop * 0.45;
  right.rotation.z += cheer * 0.57 + flop * 0.4;
  footL.rotation.x = -step * speed * 0.68 + air * 0.35 + flop * 0.31 * Math.sin(t * 13);
  footR.rotation.x = step * speed * 0.68 - air * 0.32 - flop * 0.31 * Math.sin(t * 13);
  footL.position.y = 0.185 + Math.max(0, step) * speed * 0.092;
  footR.position.y = 0.185 + Math.max(0, -step) * speed * 0.092;
}

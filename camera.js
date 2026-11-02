import { OrthographicCamera, PerspectiveCamera, Vector3 } from './assets/three.module.min.js';
import { updateCollider, castBody, castStage } from './colliders.js';
import { ARENA } from './arena-geometry.js';

export const CAMERA_MODES = ['shoulder', 'chase', 'overview'];
export const CAMERA_LABELS = { shoulder: '越肩', chase: '正后方', overview: '全场' };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const forward = new Vector3(),
  right = new Vector3(),
  pivot = new Vector3();
const point = new Vector3(),
  sight = new Vector3(),
  aimStart = new Vector3();
const defaultPitch = 0.19;

export class ArenaCamera {
  constructor() {
    this.overview = new OrthographicCamera(-12, 12, 10, -10, 0.1, 125);
    this.follow = new PerspectiveCamera(58, 1, 0.09, 125);
    this.anchor = new Vector3();
    this.aimColliders = [];
    this.resize(1, 1);
    this.reset();
  }
  get camera() {
    return this.mode === 'overview' ? this.overview : this.follow;
  }
  get label() {
    return CAMERA_LABELS[this.mode];
  }
  reset(mode = 'shoulder') {
    this.mode = mode;
    this.yaw = Math.PI;
    this.pitch = defaultPitch;
    this.tracking = false;
    this.wasDead = false;
  }
  cycle(actor) {
    const previous = this.mode;
    this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(previous) + 1) % CAMERA_MODES.length];
    if (previous === 'overview') this.reset(this.mode);
    if (!this.tracking && actor) this.yaw = actor.yaw;
  }
  resize(w, h, layout = ARENA) {
    this.layout = layout;
    this.aspect = w / h;
    const half = Math.max(7.15, 10.5 / this.aspect) * layout.scale;
    Object.assign(this.overview, {
      left: -half * this.aspect,
      right: half * this.aspect,
      top: half,
      bottom: -half,
    });
    this.overview.position.set(0, 19, 23);
    this.overview.lookAt(0, 0.15, 0);
    this.overview.updateProjectionMatrix();
    this.overview.updateMatrixWorld();
    this.follow.aspect = this.aspect;
    this.follow.updateProjectionMatrix();
  }
  turn(horizontal, vertical = 0) {
    if (this.mode === 'overview') return;
    this.yaw = wrap(this.yaw - horizontal);
    this.pitch = clamp(this.pitch + vertical, -0.32, 0.85);
  }
  update(actor, dt, shake = 0, replay = false) {
    if (this.mode === 'overview') {
      this.overview.position.x = shake;
      this.overview.updateMatrixWorld();
      return;
    }
    if (!actor) return;
    const dead = actor.dead > 0;
    const snap = !this.tracking || (this.wasDead && !dead);
    if (snap) {
      this.anchor.set(actor.x, Math.max(0, actor.y), actor.z);
      this.yaw = actor.yaw;
      this.tracking = true;
    } else if (!dead) {
      // Follow the body, independently of the wobbling head and weapon.
      const k = 1 - Math.exp(-22 * dt);
      this.anchor.lerp(point.set(actor.x, Math.max(0, actor.y), actor.z), k);
      if (replay) this.yaw = wrap(this.yaw + wrap(actor.yaw - this.yaw) * (1 - Math.exp(-8 * dt)));
    }
    this.wasDead = dead;
    const shoulder = this.mode === 'shoulder';
    const distance = (shoulder ? 3.9 : 4.35) * Math.max(1, 1.05 / this.aspect);
    const halfWidth = distance * Math.tan((this.follow.fov * Math.PI) / 360) * this.aspect;
    const offset = shoulder ? halfWidth * (this.aspect < 1 ? 0.28 : 0.4) : 0;
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw),
      cp = Math.cos(this.pitch);
    forward.set(sy * cp, -Math.sin(this.pitch), cy * cp);
    right.set(-cy, 0, sy);
    pivot.copy(this.anchor);
    pivot.y += shoulder ? 2.1 : 2.38;
    pivot.addScaledVector(right, offset);
    const eye = this.follow.position.copy(pivot).addScaledVector(forward, -distance);
    eye.y = Math.max(0.72, eye.y);
    eye.addScaledVector(right, shake * 0.25);
    this.follow.lookAt(pivot);
    this.follow.updateMatrixWorld();
  }
  move(x, z) {
    if (this.mode === 'overview') return { x, z };
    x = clamp(x, -1, 1);
    z = clamp(z, -1, 1);
    const length = Math.max(1, Math.hypot(x, z));
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    // Screen right and screen forward in the arena's XZ plane. Input z is backward.
    return { x: (-cy * x - sy * z) / length, z: (sy * x - cy * z) / length };
  }
  aim(actor, frame, teams) {
    if (this.mode === 'overview' || !actor || !this.tracking) return {};
    const origin = this.follow.position;
    this.follow.getWorldDirection(sight);
    const range = actor.kind === 'cowboy' ? 12 : 3.5;
    const length = origin.distanceTo(actor) + range;
    // A prop between the trailing camera and the weapon cannot be the forward aim point.
    const near = clamp(
      point
        .set(actor.x, actor.y + 1.15, actor.z)
        .sub(origin)
        .dot(sight),
      0,
      length,
    );
    aimStart.copy(origin).addScaledVector(sight, near);
    sight.multiplyScalar(length - near);
    let nearest = Math.min(1, castStage(this.layout, aimStart, sight, 0, frame.angle)),
      index = 0;
    // Converge the weapon and the offset camera on the same point under the reticle.
    for (const body of [...frame.actors, ...frame.props]) {
      const slot = index++;
      if (body === actor || body.dead > 0 || (body.kind && teams && body.team === actor.team)) continue;
      if ((body.x - actor.x) * sight.x + (body.z - actor.z) * sight.z <= 0) continue;
      const shape = updateCollider(body, frame.t, this.aimColliders[slot]);
      this.aimColliders[slot] = shape;
      nearest = Math.min(nearest, castBody(shape, aimStart, sight));
    }
    point.copy(aimStart).addScaledVector(sight, nearest);
    const dx = point.x - actor.x,
      dz = point.z - actor.z;
    return {
      aimYaw: Math.atan2(dx, dz),
      aimPitch: clamp(Math.atan2(point.y - actor.y - 1.15, Math.hypot(dx, dz)), -1.1, 1.1),
    };
  }
}

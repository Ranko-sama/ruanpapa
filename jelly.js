const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const airAmount = (body) =>
  body.ground ? 0 : Math.min(1, Math.abs(body.y - (body.supportY || 0)) / 1.2);

// The host advances the body's secondary motion on the same fixed clock as contacts.
// Positive height is stretch. Lean is displacement per unit height in world X and Z.
export function newJelly() {
  return { height: 0, rate: 0, leanX: 0, leanZ: 0, rateX: 0, rateZ: 0, lastVx: 0, lastVz: 0 };
}

export function pulseJelly(actor, impulse) {
  actor.soft.rate = clamp(actor.soft.rate + impulse, -9, 8);
}

export function stepJelly(a, dt) {
  if (a.dead > 0) return;
  const j = a.soft;
  const stiffness = a.kind === 'hammer' ? 215 : a.kind === 'spark' ? 278 : 245;
  const damping = Math.exp(-9.4 * dt);
  const flightStretch = a.ground ? 0 : Math.min(0.14, Math.abs(a.vy) * 0.015);
  j.rate = (j.rate + (flightStretch - j.height) * stiffness * dt) * damping;
  j.height = clamp(j.height + j.rate * dt, -0.33, 0.29);

  // The rim trails acceleration, then passes the resting axis as the gel settles.
  const changeX = clamp(a.vx - j.lastVx, -20, 20);
  const changeZ = clamp(a.vz - j.lastVz, -20, 20);
  j.rateX = (j.rateX - changeX * 0.34 - j.leanX * 178 * dt) * damping;
  j.rateZ = (j.rateZ - changeZ * 0.34 - j.leanZ * 178 * dt) * damping;
  j.leanX = clamp(j.leanX + j.rateX * dt, -0.32, 0.32);
  j.leanZ = clamp(j.leanZ + j.rateZ * dt, -0.32, 0.32);
  j.lastVx = a.vx;
  j.lastVz = a.vz;
}

export function jellyShape(pose, time) {
  const speed = clamp(pose.speed || 0, 0, 1),
    air = clamp(pose.air || 0, 0, 1);
  // Existing clips have motion cues but predate the three recorded spring offsets.
  const spring = pose.jelly?.[0] ?? air * 0.09 + Math.min(pose.tumble || 0, 1) * 0.075 * Math.sin(time * 16);
  const stride = -0.054 * speed * (1 - air) * Math.cos(time * 24);
  const height = 1 + clamp(spring + stride + 0.014 * Math.sin(time * 2.85), -0.34, 0.31);
  return {
    height,
    width: 1 / Math.sqrt(height),
    leanX: clamp(pose.jelly?.[1] || 0, -0.32, 0.32),
    leanZ: clamp(pose.jelly?.[2] || 0, -0.32, 0.32),
  };
}

import { MAPS, MAP_IDS, MODES, KINDS, BOT_NAMES } from './data.js';
import { newJelly, pulseJelly, stepJelly, airAmount } from './jelly.js';
import { Vector3 } from './assets/three.module.min.js';
import { routeOnDeck } from './navigation.js';
import {
  ARENA,
  BELT_SPEED,
  layoutFor,
  onDeck,
  hasFloorAt,
  GLASS_WARNING,
  GLASS_REPAIR,
  DECK_RADIUS as RADIUS,
  GLASS,
  GLASS_HALF,
  BLOCK,
  SWEEPER_HEIGHT,
  SWEEPER_BANDS,
} from './arena-geometry.js';
import {
  updateCollider,
  translateCollider,
  bodyContact,
  castBody,
  castRotor,
  castStage,
  fixedObstacles,
  shotRadius,
  weaponSweep,
} from './colliders.js';

export const STEP = 1 / 60;
export { RADIUS, GLASS };
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const active = (a) => a && a.dead <= 0 && a.y > -0.8;
const opponents = (s, a, b) => a !== b && (!MODES[s.config.mode].team || a.team !== b.team);
const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const direction = (x, z) => {
  const d = Math.hypot(x, z) || 1;
  return [x / d, z / d];
};
const random = (s) => (s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0) / 4294967296;
const colliders = new WeakMap();
const start = new Vector3(),
  path = new Vector3(),
  contact = new Vector3(),
  contactPoint = new Vector3();
const relativeStart = new Vector3(),
  relativePath = new Vector3();
function syncCollider(body, time) {
  const shape = updateCollider(body, time, colliders.get(body));
  colliders.set(body, shape);
  return shape;
}
const inverseMass = { hammer: 1 / 1.3, knight: 1 / 1.15, cowboy: 1, spark: 1 / 0.92 };
const massWeight = (body) => (body.fixed ? 0 : (inverseMass[body.kind] ?? 1 / BLOCK.mass));
// The foam crate is 0.94 by 0.92 in plan. Only its yaw is a simulated spin axis.
const boxInvInertia = 12 / (BLOCK.mass * (BLOCK.width ** 2 + BLOCK.depth ** 2));
const crateSpawns = [
  [-6.4, -4.8],
  [6.4, 4.8],
  [0, 8.3],
];

export function createMatch(settings = {}) {
  const mode = Object.hasOwn(MODES, settings.mode) ? settings.mode : 'brawl';
  const level = clamp(Math.trunc(Number(settings.level) || 0), 0, MAP_IDS.length - 1);
  const config = {
    arenaVersion: ARENA.version,
    mode,
    level,
    map: mode === 'adventure' ? MAP_IDS[level] : Object.hasOwn(MAPS, settings.map) ? settings.map : 'cloud',
    players: settings.players === 2 ? 2 : 1,
    seed: (settings.seed ?? Date.now()) >>> 0,
  };
  const arena = layoutFor(config);
  const s = {
    config,
    arena,
    rng: config.seed,
    t: 0,
    remain: MODES[mode].time,
    target: mode === 'adventure' ? 3 + level : mode === 'cart' ? arena.cartEnd : MODES[mode].target,
    actors: [],
    props: [],
    shots: [],
    shotSeq: 0,
    angle: 0.16,
    spinKick: 0,
    glass: arena.glass.map(() => ({ down: 0, warn: 0 })),
    events: [],
    eventId: 0,
    event: '',
    eventUntil: 0,
    nextEvent: 18,
    end: null,
    obj: {
      teams: [0, 0],
      zone: -1,
      cart: 0,
      flags: [0, 1].map((team) => ({
        team,
        x: team ? arena.flagX : -arena.flagX,
        z: 0,
        carrier: -1,
        away: 0,
      })),
      crown: { x: 0, z: 0, carrier: -1, lock: 0 },
    },
  };
  const count = mode === 'adventure' ? Math.min(6, config.players + 2 + level) : 6;
  for (let i = 0; i < count; i++) {
    const human = i < config.players;
    const pick = settings.picks?.[i] || {};
    const kind =
      human && KINDS.includes(pick.kind)
        ? pick.kind
        : KINDS[(i + level) % (mode === 'adventure' && level >= 2 ? 4 : 3)];
    const team = mode === 'adventure' ? (human ? 0 : 1) : MODES[mode].team ? (i < 3 ? 0 : 1) : i;
    const a = {
      id: i,
      name: human ? i + 1 + 'P' : BOT_NAMES[i],
      kind,
      team,
      human,
      skin: human ? pick.skin || 0 : i > 2 ? 1 : 0,
      outfit: human ? pick.outfit || 0 : 0,
      emoteId: human ? pick.emote || 0 : i % 3,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      ground: true,
      load: 0,
      score: 0,
      kos: 0,
      falls: 0,
      dead: 0,
      inv: 0,
      attack: 0,
      skill: 0,
      guard: 0,
      stun: 0,
      tumble: 0,
      emote: 0,
      emoteCd: 0,
      ac: 0,
      sc: 0,
      jc: 0,
      last: -1,
      lastAt: -20,
      barCD: 0,
      pulse: 0,
      brain: 0,
      decision: null,
    };
    s.actors.push(a);
    spawn(s, a, true);
  }
  for (const [id, [x, z]] of (arena.crates || crateSpawns).entries()) {
    s.props.push({
      id,
      x,
      y: 0,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: id * 0.9,
      spin: 0,
      last: -1,
      lastAt: -20,
      dead: 0,
      barCD: 0,
    });
  }
  return s;
}

function event(s, type, data = {}) {
  s.events.push({ id: ++s.eventId, t: s.t, type, ...data });
  if (s.events.length > 96) s.events.shift();
}
function spawn(s, a, first = false) {
  let ang = (a.id * 2.39996 + 0.97 + (first ? 0 : random(s) * 2.4)) % TAU;
  let x, z;
  if (MODES[s.config.mode].team && s.config.mode !== 'adventure') {
    x = (a.team ? 1 : -1) * (s.arena.flagX - 1.5 + (a.id % 2) * 0.9);
    z = ((a.id % 3) - 1) * 3.6;
  } else if (s.arena.spawns) {
    const slot = a.id + (first ? 0 : Math.floor(random(s) * s.arena.spawns.length));
    [x, z] = s.arena.spawns[slot % s.arena.spawns.length];
  } else {
    x = Math.sin(ang) * s.arena.radius * 0.65;
    z = Math.cos(ang) * s.arena.radius * 0.65;
  }
  const spawnRadius = Math.hypot(x, z),
    spawnAngle = Math.atan2(x, z);
  const occupied = [...s.actors, ...s.props].filter((b) => b !== a && active(b));
  for (let i = 0; i < 15; i++) {
    const offset = Math.ceil(i / 2) * (i % 2 ? 0.21 : -0.21);
    const sx = Math.sin(spawnAngle + offset) * spawnRadius,
      sz = Math.cos(spawnAngle + offset) * spawnRadius;
    if (
      (s.arena.decks &&
        ![
          [0.85, 0],
          [-0.85, 0],
          [0, 0.85],
          [0, -0.85],
        ].every(([dx, dz]) => onDeck(s.arena, sx + dx, sz + dz))) ||
      s.arena.bumpers?.some(([bx, bz]) => Math.hypot(sx - bx, sz - bz) < 2.4) ||
      s.arena.glass.some(
        ([gx, gz]) => Math.abs(sx - gx) < GLASS_HALF + 0.8 && Math.abs(sz - gz) < GLASS_HALF + 0.8,
      )
    )
      continue;
    if (occupied.some((b) => Math.hypot(sx - b.x, sz - b.z) < 1.8)) continue;
    x = sx;
    z = sz;
    break;
  }
  Object.assign(a, {
    x,
    z,
    y: first ? 0 : 1,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: Math.atan2(-x, -z),
    load: 0,
    dead: 0,
    inv: first ? 0.75 : 1.7,
    ground: first,
    supportY: 0,
    fallCause: '',
    lastBumper: null,
    soft: newJelly(),
    attack: 0,
    skill: 0,
    guard: 0,
    stun: 0,
    tumble: 0,
    last: -1,
    lastAt: -20,
    barCD: 0.5,
    pulse: 0,
    ac: 0.25,
    sc: first ? 0.8 : 1,
    brain: 0,
  });
  if (!first) event(s, 'respawn', { who: a.id, x, z });
}
function nearest(s, a, limit = Infinity) {
  let result = null,
    best = limit;
  for (const b of s.actors)
    if (active(b) && opponents(s, a, b)) {
      const d = dist(a, b);
      if (d < best) {
        best = d;
        result = b;
      }
    }
  return result;
}
function dropObjective(s, a) {
  const held = s.obj.flags.find((f) => f.carrier === a.id);
  if (held) {
    held.carrier = -1;
    held.x = a.x;
    held.z = a.z;
    held.away = 9;
  }
  const crown = s.obj.crown;
  if (crown.carrier === a.id) {
    Object.assign(crown, { carrier: -1, x: a.x, z: a.z, lock: 0.75 });
  }
}
function strike(s, b, source, dx, dz, force, lift, add = 13) {
  if (!active(b) || b.inv > 0 || source === b.id) return false;
  const attacker = s.actors[source];
  const [nx, nz] = direction(dx, dz);
  if (b.guard > 0 && source >= 0) {
    pulseJelly(b, -1.8);
    if (active(attacker) && dist(b, attacker) < 3.2) {
      attacker.vx -= nx * 8;
      attacker.vz -= nz * 8;
      attacker.vy = Math.max(attacker.vy, 3.5);
      attacker.stun = 0.3;
      attacker.last = b.id;
      attacker.lastAt = s.t;
      attacker.load += 5;
    }
    event(s, 'block', { who: b.id, x: b.x, y: b.y + 1, z: b.z });
    return false;
  }
  b.load = Math.min(270, b.load + add);
  const scale = 1 + b.load * 0.011;
  pulseJelly(b, -Math.min(6.5, force * scale * 0.38));
  b.vx = b.vx * 0.35 + nx * force * scale;
  b.vz = b.vz * 0.35 + nz * force * scale;
  b.vy = Math.max(b.vy, lift * scale);
  b.ground = false;
  b.stun = clamp(0.18 + scale * 0.12, 0.25, 0.65);
  b.tumble = clamp((force / 12) * scale, 0.3, 1.8);
  if (source >= 0) {
    b.last = source;
    b.lastAt = s.t;
  }
  if (b.load >= 26 && (force >= 8 || b.load >= 65)) dropObjective(s, b);
  event(s, 'hit', { who: b.id, by: source, x: b.x, y: b.y + 0.95, z: b.z, power: Math.round(force * scale) });
  return true;
}
function pushProp(s, p, source, dx, dz, force, lift = 3, point) {
  if (p.dead > 0) return;
  const [nx, nz] = direction(dx, dz);
  p.vx += nx * force;
  p.vz += nz * force;
  if (point)
    p.spin =
      (p.spin || 0) + ((point.z - p.z) * nx - (point.x - p.x) * nz) * force * BLOCK.mass * boxInvInertia;
  p.vy = Math.max(lift, p.vy);
  if (source >= 0) {
    p.last = source;
    p.lastAt = s.t;
  }
}
function crackGlass(s, i) {
  const tile = s.glass[i];
  if (tile.warn > 0 || tile.down > 0) return;
  tile.warn = GLASS_WARNING;
  event(s, 'crack', { x: s.arena.glass[i][0], z: s.arena.glass[i][1] });
}
function wave(s, a, radius, force, lift) {
  start.set(a.x, a.y + 0.95, a.z);
  path.set(0, 0, 0);
  for (const b of s.actors)
    if (active(b) && opponents(s, a, b) && fieldTouches(s, b, radius)) {
      strike(s, b, a.id, b.x - a.x, b.z - a.z, force, lift, 16);
    }
  for (const p of s.props)
    if (p.dead <= 0 && fieldTouches(s, p, radius))
      pushProp(s, p, a.id, p.x - a.x, p.z - a.z, force + 3, lift);
  if (s.arena.rotor && castRotor(start, path, radius, s.angle) === 0)
    s.spinKick += Math.cos(a.yaw - s.angle) >= 0 ? 2.1 : -2.1;
  s.arena.glass.forEach(([x, z], i) => {
    const dx = Math.max(0, Math.abs(a.x - x) - GLASS_HALF),
      dz = Math.max(0, Math.abs(a.z - z) - GLASS_HALF);
    if (Math.hypot(dx, start.y, dz) < radius) crackGlass(s, i);
  });
}
function fieldTouches(s, b, radius) {
  return castBody(syncCollider(b, s.t), start, path, radius) === 0;
}
function attack(s, a, special, input) {
  pulseJelly(a, special ? -2.5 : a.kind === 'hammer' ? -1.9 : -0.85);
  const aimed = Number.isFinite(input.aimYaw);
  if (aimed) a.yaw = input.aimYaw;
  const target = !aimed && nearest(s, a, a.kind === 'cowboy' ? 8.5 : 3.35);
  if (target && Math.abs(wrap(angleTo(a, target) - a.yaw)) < (a.human ? 1.85 : 2.8))
    a.yaw = angleTo(a, target);
  const dx = Math.sin(a.yaw),
    dz = Math.cos(a.yaw);
  if (special) {
    a.sc = { hammer: 5.5, knight: 5, cowboy: 5.8, spark: 5.2 }[a.kind];
    a.skill = 0.65;
    event(s, 'skill', { who: a.id, kind: a.kind, x: a.x, y: a.y, z: a.z });
  } else {
    a.ac = { hammer: 0.72, knight: 0.46, cowboy: 0.52, spark: 0.48 }[a.kind];
    a.attack = 0.34;
  }
  if (a.kind === 'cowboy') {
    const pitch = aimed && Number.isFinite(input.aimPitch) ? clamp(input.aimPitch, -1.1, 1.1) : 0;
    const planar = Math.cos(pitch),
      dy = Math.sin(pitch);
    s.shots.push({
      id: ++s.shotSeq,
      owner: a.id,
      x: a.x,
      y: a.y + 1.15,
      z: a.z,
      muzzleTravel: 0.8,
      dx: dx * planar,
      dz: dz * planar,
      dy,
      life: special ? 0.94 : 0.72,
      chain: special,
    });
    event(s, 'shot', { who: a.id, x: a.x, y: a.y + 1, z: a.z });
    return;
  }
  if (special && a.kind === 'hammer') {
    wave(s, a, 4.4, 10, 6.2);
    return;
  }
  if (special && a.kind === 'spark') {
    start.set(a.x, a.y + 0.95, a.z);
    path.set(0, 0, 0);
    for (const b of s.actors)
      if (active(b) && opponents(s, a, b) && fieldTouches(s, b, 5.4)) {
        const [nx, nz] = direction(a.x - b.x, a.z - b.z);
        b.vx += nx * 5;
        b.vz += nz * 5;
      }
    for (const p of s.props)
      if (p.dead <= 0 && fieldTouches(s, p, 5.5)) pushProp(s, p, a.id, a.x - p.x, a.z - p.z, 6, 1);
    a.pulse = 0.32;
    return;
  }
  if (special && a.kind === 'knight') {
    a.guard = 1.3;
    a.vx += dx * 10;
    a.vz += dz * 10;
  }
  const hammer = a.kind === 'hammer';
  const swing = weaponSweep(a, s.t, special && a.kind === 'knight');
  function touched(b) {
    if (dist(a, b) > 3.6 || Math.abs(a.y - b.y) > 3.6) return false;
    const c = syncCollider(b, s.t);
    for (const [from, travel] of swing.lines) {
      const u = castBody(c, from, travel, swing.radius);
      if (u <= 1) {
        contactPoint.copy(from).addScaledVector(travel, u);
        return true;
      }
    }
    return false;
  }
  for (const b of s.actors) {
    if (!active(b) || !opponents(s, a, b) || !touched(b)) continue;
    strike(
      s,
      b,
      a.id,
      b.x - a.x + 0.12 * dx,
      b.z - a.z + 0.12 * dz,
      special ? 10 : hammer ? 7.5 : 6.1,
      hammer ? 5.2 : 3.3,
      hammer ? 18 : 12,
    );
  }
  for (const p of s.props) if (p.dead <= 0 && touched(p)) pushProp(s, p, a.id, dx, dz, 12, 3.2, contactPoint);
  if (
    s.arena.rotor &&
    swing.lines.some(([from, travel]) => castRotor(from, travel, swing.radius, s.angle) <= 1)
  )
    s.spinKick += a.x * dz - a.z * dx >= 0 ? 0.85 : -0.85;
}
function shots(s, dt, bodies) {
  for (const p of s.shots) {
    const travel = 16 * Math.min(dt, p.life) + (p.muzzleTravel || 0),
      radius = shotRadius(p.chain);
    p.muzzleTravel = 0;
    p.life -= dt;
    start.set(p.x, p.y, p.z);
    path.set(p.dx, p.dy || 0, p.dz).multiplyScalar(travel);
    const floorTime = path.y < 0 ? Math.max(0, (radius - p.y) / path.y) : Infinity;
    let first =
      floorTime <= 1 && supported(s, p.x + path.x * floorTime, p.z + path.z * floorTime)
        ? floorTime
        : Infinity;
    first = Math.min(first, castStage(s.arena, start, path, radius, s.angle));
    const owner = s.actors[p.owner];
    const targets = bodies.filter(
      (b) => b.dead <= 0 && (!b.kind || (active(b) && opponents(s, owner, b) && b.inv <= 0)),
    );
    let hit = null;
    for (const b of targets) {
      const c = colliders.get(b);
      // Cast in the moving target's end-of-substep reference frame.
      relativeStart.copy(start).add(c.motion);
      relativePath.copy(path).sub(c.motion);
      const t = castBody(c, relativeStart, relativePath, radius);
      if (t < first) {
        first = t;
        hit = b;
      }
    }
    const u = Math.min(1, first);
    p.x += path.x * u;
    p.y += path.y * u;
    p.z += path.z * u;
    if (first <= 1) p.life = 0;
    if (!hit) continue;
    const seen = new Set();
    let next = hit,
      dx = p.dx,
      dz = p.dz;
    for (let j = 0; next && j < (p.chain ? 3 : 1); j++) {
      if (next.kind) strike(s, next, p.owner, dx, dz, p.chain ? 8.6 : 6.4, 3.1, p.chain ? 16 : 11);
      else pushProp(s, next, p.owner, dx, dz, 12, 3, j === 0 ? p : undefined);
      seen.add(next);
      let best = null,
        d = 4.35;
      for (const other of targets) {
        const range = Math.hypot(
          other.x - next.x,
          other.y + (other.kind ? 1 : 0.46) - next.y - (next.kind ? 1 : 0.46),
          other.z - next.z,
        );
        if (!seen.has(other) && range < d) {
          best = other;
          d = range;
        }
      }
      if (best && p.chain && j < 2) {
        event(s, 'chain', { x: next.x, y: next.y + 1, z: next.z, tx: best.x, ty: best.y + 1, tz: best.z });
        dx = best.x - next.x;
        dz = best.z - next.z;
      }
      next = best;
    }
    p.life = 0;
  }
  s.shots = s.shots.filter((p) => p.life > 0);
}
function ai(s, a) {
  if (a.brain > 0 && a.decision) return a.decision;
  const r = random(s);
  a.brain = 0.12 + r * 0.075;
  const foe = nearest(s, a);
  let goal = foe || { x: 0, z: 0 };
  switch (s.config.mode) {
    case 'flag': {
      const own = s.obj.flags[a.team],
        enemy = s.obj.flags[1 - a.team];
      if (enemy.carrier === a.id) goal = { x: a.team ? s.arena.flagX : -s.arena.flagX, z: 0 };
      else if (own.carrier >= 0 && a.id % 3 !== 1) goal = s.actors[own.carrier];
      else if (enemy.carrier < 0 || !foe || dist(a, foe) > 2.8) goal = enemy;
      break;
    }
    case 'zone':
      if (!foe || dist(a, foe) > 2.5 || Math.hypot(a.x, a.z) > s.arena.zoneRadius - 0.3)
        goal = { x: Math.sin(a.id) * 1.1, z: Math.cos(a.id) * 1.1 };
      break;
    case 'cart':
      if (!foe || dist(a, foe) > 2.3 || Math.abs(a.x - s.obj.cart) > 2.3)
        goal = { x: s.obj.cart + (a.team ? 0.6 : -0.6), z: 1 + Math.cos(a.id) * 0.7 };
      break;
    case 'king': {
      const c = s.obj.crown;
      goal =
        c.carrier >= 0
          ? c.carrier === a.id
            ? { x: Math.cos(s.t * 0.8) * 4, z: Math.sin(s.t * 0.8) * 4 }
            : s.actors[c.carrier]
          : c;
      break;
    }
  }
  let dx = goal.x - a.x,
    dz = goal.z - a.z;
  const gap = foe ? dist(a, foe) : 50;
  if (goal === foe && a.kind === 'cowboy' && gap < 3.5) {
    dx = -dx;
    dz = -dz;
  }
  if (s.arena.waypoints) {
    const dest = goal === foe && a.kind === 'cowboy' && gap < 3.5 ? { x: a.x + dx, z: a.z + dz } : goal;
    const next = routeOnDeck(s.arena, s.glass, a, dest);
    dx = next.x - a.x;
    dz = next.z - a.z;
  } else if (Math.hypot(a.x, a.z) > s.arena.radius - 1.65 && a.stun <= 0) {
    dx = -a.x;
    dz = -a.z;
  }
  const [mx, mz] = Math.hypot(dx, dz) > 0.32 ? direction(dx, dz) : [0, 0];
  if (foe && gap < (a.kind === 'cowboy' ? 8 : 3)) a.yaw = angleTo(a, foe);
  const use = gap < (a.kind === 'cowboy' ? 7.8 : 2.55);
  a.decision = {
    x: mx,
    z: mz,
    hit: use && r > 0.25,
    skill: gap < (a.kind === 'cowboy' ? 7 : 3.3) && r > 0.76,
    jump:
      a.stun <= 0 &&
      (r > 0.973 || (s.arena.rotor && a.barCD < 0.01 && Math.hypot(a.x, a.z) < 4.6 && r < 0.1)),
  };
  return a.decision;
}
function supported(s, x, z, pad = 0) {
  return hasFloorAt(s.arena, s.glass, x, z, pad);
}

// A shoe can carry weight over a lip; the large belly, a hat or a weapon cannot.
function footprints(body, x, z, accept) {
  if (body.kind) {
    const soles = colliders.get(body).soles;
    const low = Math.min(soles[0].bounds.min.y, soles[1].bounds.min.y);
    for (const sole of soles) {
      if (sole.bounds.min.y > low + 0.18) continue;
      const halfHeight = Math.sqrt(sole.q[3]);
      const fx = x - body.x + sole.center.x - sole.q[1] / halfHeight;
      const fz = z - body.z + sole.center.z - sole.q[4] / halfHeight;
      if (accept(fx, fz, 0.12)) return true;
    }
  } else {
    const sn = Math.sin(body.rot),
      cs = Math.cos(body.rot);
    for (const side of [-0.34, 0.34])
      for (const end of [-0.34, 0.34])
        if (accept(x + side * cs + end * sn, z - side * sn + end * cs, 0.08)) return true;
  }
  return false;
}
function floorSupports(s, b, x, z) {
  return supported(s, x, z) || footprints(b, x, z, (fx, fz, pad) => supported(s, fx, fz, pad));
}
function landing(s, b, impact) {
  if (!b.kind || impact < 1.3) return;
  pulseJelly(b, -Math.min(8.5, (impact - 0.65) * 0.88));
  if (impact > 2.8) event(s, 'land', { who: b.id, impact: Math.round(impact), x: b.x, z: b.z });
}
function leaveDeck(s, b, x, z) {
  if (b.kind && !b.fallCause && b.y < 0) b.fallCause = onDeck(s.arena, x, z) ? 'glass' : 'edge';
}
// The deck is a one-way contact. Use the approach before this substep, including
// for corrections made later by a crate, the hub or another fighter.
function resolveDeck(s, b, c) {
  const from = c.stepStart;
  const skin = 0.065;
  if (b.y > 0 || from.y < -skin || (from.y < -0.0001 && b.vy > 0)) return;
  if (!floorSupports(s, b, b.x, b.z)) {
    leaveDeck(s, b, b.x, b.z);
    return;
  }
  if (from.y > 0) {
    const u = from.y / (from.y - b.y);
    const x = from.x + (b.x - from.x) * u,
      z = from.z + (b.z - from.z) * u;
    if (!floorSupports(s, b, x, z)) {
      leaveDeck(s, b, x, z);
      return;
    }
  }
  if (b.kind) b.fallCause = '';
  if (b.y < 0) translateCollider(c, b, 0, -b.y, 0);
  if (b.vy > 0) {
    b.ground = false;
    return;
  }
  const impact = -b.vy;
  landing(s, b, impact);
  const bounce = (!b.kind || s.event === 'bounce') && impact > 4.2;
  b.vy = bounce ? impact * (s.event === 'bounce' ? 0.59 : 0.35) : 0;
  b.ground = !bounce;
  b.supportY = 0;
  if (impact >= 5.5) {
    s.arena.glass.forEach(([gx, gz], i) => {
      if (footprints(b, b.x, b.z, (x, z) => Math.abs(x - gx) < GLASS_HALF && Math.abs(z - gz) < GLASS_HALF))
        crackGlass(s, i);
    });
  }
}
function integrate(s, a, dt, time) {
  const map = MAPS[s.config.map],
    grounded = a.ground && a.vy <= 0.02;
  const wind = s.event === 'wind' && !grounded ? 2.3 : 0;
  const drag = grounded ? (!a.kind ? 2.25 : a.stun > 0 ? 2.1 : 5.4) * map.friction : 0.55;
  const friction = Math.exp(-dt * drag),
    oldX = a.x,
    oldY = a.y,
    oldZ = a.z;
  a.vx = clamp(a.vx * friction + wind * dt, -32, 32);
  a.vz = clamp(a.vz * friction, -32, 32);
  if (grounded && a.y < 0.08 && s.arena.belts) {
    const belt = s.arena.belts.find((b) => Math.abs(a.x - b.x) < b.halfX && Math.abs(a.z - b.z) < b.halfZ);
    if (belt) a.vz += belt.direction * BELT_SPEED * (1 - friction);
  }
  a.x += a.vx * dt;
  a.z += a.vz * dt;
  if (s.event === 'float' && Math.hypot(a.x, a.z) < s.arena.radius + 1 && a.y >= -0.1) {
    a.vy *= Math.exp(-dt * 0.62);
    if (a.y > 4.6 && a.vy > 0) a.vy *= -0.48;
  } else a.vy -= map.gravity * dt;
  a.y += a.vy * dt;
  if (!a.kind) {
    a.spin = clamp(a.spin || 0, -16, 16) * Math.exp(-dt * (grounded ? 3.5 * map.friction : 0.6));
    a.rot += a.spin * dt;
  }
  const c = syncCollider(a, time);
  c.stepStart.set(oldX, oldY, oldZ);
  a.ground = false;
  resolveDeck(s, a, c);
  return c;
}

function bar(s, a, c, omega) {
  if (a.barCD > 0 || c.bounds.min.y > 0.84 || c.bounds.max.y < 0.24 || Math.hypot(a.x, a.z) > 5.9) return;
  const dx = Math.cos(s.angle),
    dz = Math.sin(s.angle),
    along = a.x * dx + a.z * dz;
  const side = Math.sign(along) || 1;
  for (const [inner, outer, radius] of SWEEPER_BANDS) {
    start.set(side * dx * inner, SWEEPER_HEIGHT, side * dz * inner);
    path.set(side * dx * (outer - inner), 0, side * dz * (outer - inner));
    if (castBody(c, start, path, radius) > 1) continue;
    const sign = side * (Math.sign(omega) || 1),
      tx = -dz * sign + dx * along * 0.09,
      tz = dx * sign + dz * along * 0.09;
    const speed = clamp(Math.abs(omega * along), 0, 7);
    if (a.kind) strike(s, a, -1, tx, tz, 3.6 + speed * 0.6, 2.8 + speed * 0.15, 6);
    else pushProp(s, a, -1, tx, tz, 4.6 + speed * 0.7, 3);
    a.barCD = 1.1;
    return;
  }
}

function resolveContact(s, a, b, ca, cb) {
  const depth = bodyContact(ca, cb, contact, contactPoint);
  if (depth <= 0) return;
  // Two upright neighbours slide past one another. Decorative gait must not launch them.
  if (a.ground && b.ground && Math.abs(a.y - b.y) < 0.18) {
    if (Math.abs(contact.y) > 0.65) {
      const dx = b.x - a.x,
        dz = b.z - a.z;
      if (Math.hypot(dx, dz) > 0.001) contact.set(dx, 0, dz);
      else if (Math.hypot(contact.x, contact.z) < 0.1) {
        const angle = (a.id ?? 0) * 2.4 + (b.id ?? 0) * 1.62;
        contact.set(Math.cos(angle), 0, Math.sin(angle));
      }
    }
    contact.y = 0;
    contact.normalize();
  }
  const { x: nx, y: ny, z: nz } = contact,
    wa = massWeight(a),
    wb = massWeight(b);
  const ay = a.ground && ny > 0 ? 0 : wa,
    by = b.ground && ny < 0 ? 0 : wb;
  const weight = (wa + wb) * (nx * nx + nz * nz) + (ay + by) * ny * ny;
  if (weight < 1e-8) return;
  const fix = (Math.max(0, depth - 0.001) * 0.92) / weight;
  if (fix > 0) {
    if (wa) translateCollider(ca, a, -nx * wa * fix, -ny * ay * fix, -nz * wa * fix);
    if (wb) translateCollider(cb, b, nx * wb * fix, ny * by * fix, nz * wb * fix);
  }
  if (a.bumper && (b.lastBumper !== a || s.t >= b.bumperUntil)) {
    const [dx, dz] = direction(b.x - a.x, b.z - a.z);
    const speed = clamp(8.4 - (b.vx * dx + b.vz * dz) * 0.45, 7, 17);
    b.vx = dx * speed;
    b.vz = dz * speed;
    b.vy = Math.max(b.vy, Math.hypot(b.x - a.x, b.z - a.z) < 0.6 ? 8.8 : 4.1);
    b.ground = false;
    b.lastBumper = a;
    b.bumperUntil = s.t + 0.35;
    if (b.kind) {
      pulseJelly(b, -4);
      b.tumble = Math.max(b.tumble, 0.45);
      b.stun = Math.max(b.stun, 0.16);
    }
    event(s, 'bumper', { who: b.kind ? b.id : -1, x: a.x, y: 1.1, z: a.z });
    return;
  }
  const ia = !a.kind && !a.fixed ? boxInvInertia : 0,
    ib = !b.kind && !b.fixed ? boxInvInertia : 0;
  const armA = (contactPoint.z - a.z) * nx - (contactPoint.x - a.x) * nz;
  const armB = (contactPoint.z - b.z) * nx - (contactPoint.x - b.x) * nz;
  const towardB = a.vx * nx + a.vy * ny + a.vz * nz + (a.spin || 0) * armA;
  const towardA = -(b.vx * nx + b.vy * ny + b.vz * nz + (b.spin || 0) * armB);
  const closing = towardB + towardA;
  if (closing <= 0) return;
  const top = ny > 0 ? b : a,
    bottom = ny > 0 ? a : b;
  const supportedTop = Math.abs(ny) > 0.7 && !top.fixed && bottom.ground;
  const softLanding = supportedTop && top.kind && s.event !== 'bounce';
  const restitution = closing > 2.4 && !softLanding ? (s.event === 'bounce' ? 0.64 : 0.2) : 0;
  const impulse = ((1 + restitution) * closing) / (weight + ia * armA * armA + ib * armB * armB);
  a.vx -= nx * wa * impulse;
  a.vy -= ny * ay * impulse;
  a.vz -= nz * wa * impulse;
  b.vx += nx * wb * impulse;
  b.vy += ny * by * impulse;
  b.vz += nz * wb * impulse;
  if (ia) a.spin -= armA * impulse * ia;
  if (ib) b.spin += armB * impulse * ib;
  // Coulomb friction cannot remove more than the tangential relative speed.
  const rx = b.vx - a.vx,
    ry = b.vy - a.vy,
    rz = b.vz - a.vz,
    vn = rx * nx + ry * ny + rz * nz;
  const tx = rx - vn * nx,
    ty = ry - vn * ny,
    tz = rz - vn * nz,
    slip = Math.hypot(tx, ty, tz);
  const friction = Math.min(1 / (wa + wb), (0.32 * impulse) / Math.max(1e-8, slip));
  a.vx += tx * friction * wa;
  a.vy += ty * friction * ay;
  a.vz += tz * friction * wa;
  b.vx -= tx * friction * wb;
  b.vy -= ty * friction * by;
  b.vz -= tz * friction * wb;
  if (supportedTop) {
    if (!top.ground) landing(s, top, closing);
    if (top.vy < 0.45) {
      top.ground = true;
      top.supportY = top.y;
    }
  }
  if (closing > 2.4) {
    const squeeze = -Math.min(2.2, (closing - 2) * 0.26);
    if (a.kind) pulseJelly(a, squeeze);
    if (b.kind) pulseJelly(b, squeeze);
  }
  if (closing < 5.6 || a.fixed || b.fixed) return;
  const [from, to, sign] = towardB >= towardA ? [a, b, 1] : [b, a, -1];
  if (from.last < 0 || s.t - from.lastAt > 3 || (to.kind && from.last === to.id)) return;
  if (to.kind && opponents(s, s.actors[from.last], to))
    strike(s, to, from.last, nx * sign, nz * sign, clamp(closing * 0.73, 4, 10), 3.3, 8);
  if (!to.kind) {
    to.last = from.last;
    to.lastAt = s.t;
    to.vy = Math.max(to.vy, 2);
  }
}

// Limit relative travel on fast knockbacks and on a boosted rotor. Inputs, scoring,
// attack timers and jelly springs still advance exactly once per authoritative tick.
function moveBodies(s, bodies, dt, omega) {
  const obstacles = fixedObstacles(s.arena);
  let speed = Math.abs(omega) * 4.6;
  for (const b of bodies) speed = Math.max(speed, Math.hypot(b.vx, b.vy, b.vz));
  const steps = clamp(Math.ceil((speed * dt) / 0.17), 1, 12),
    h = dt / steps;
  for (let sub = 0; sub < steps; sub++) {
    s.angle = (s.angle + omega * h) % TAU;
    const time = s.t - dt + (sub + 1) * h;
    for (const b of bodies) {
      const x = b.x,
        y = b.y,
        z = b.z;
      const c = integrate(s, b, h, time);
      c.motion.set(b.x - x, b.y - y, b.z - z);
      if (s.arena.rotor) bar(s, b, c, omega);
    }
    if (s.shots.length) shots(s, h, bodies);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (const obstacle of obstacles)
          resolveContact(s, obstacle, bodies[i], obstacle.collider, colliders.get(bodies[i]));
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i],
            b = bodies[j];
          resolveContact(s, a, b, colliders.get(a), colliders.get(b));
        }
      }
      // Pair separation can push a previously airborne or freshly struck body through
      // the floor, even when velocity integration itself crossed no plane.
      for (const b of bodies) if (b.y < 0 || (b.y === 0 && b.vy < 0)) resolveDeck(s, b, colliders.get(b));
    }
  }
}
function fall(s, a) {
  const by = s.t - a.lastAt <= 8 ? a.last : -1,
    attacker = s.actors[by];
  a.falls++;
  a.dead = 1.65;
  dropObjective(s, a);
  if (attacker && opponents(s, a, attacker)) {
    attacker.kos++;
    if (s.config.mode === 'brawl') attacker.score++;
    if (s.config.mode === 'adventure') s.obj.teams[attacker.team]++;
  }
  event(s, 'ko', {
    who: a.id,
    by: attacker?.id ?? -1,
    x: a.x,
    z: a.z,
    load: Math.round(a.load),
    cause: a.fallCause,
  });
}
function objectives(s, dt) {
  const live = s.actors.filter(active),
    m = s.config.mode,
    o = s.obj;
  if (m === 'zone') {
    const present = [0, 1].map((team) =>
      live.some((a) => a.team === team && Math.hypot(a.x, a.z) < s.arena.zoneRadius),
    );
    o.zone = present[0] === present[1] ? -1 : present[0] ? 0 : 1;
    if (o.zone >= 0) o.teams[o.zone] += dt;
  }
  if (m === 'cart') {
    const n = [0, 1].map(
      (team) => live.filter((a) => a.team === team && Math.hypot(a.x - o.cart, a.z - 1) < 2.65).length,
    );
    o.cart = clamp(o.cart + (n[0] - n[1]) * 0.73 * dt, -s.arena.cartEnd, s.arena.cartEnd);
    o.teams = [Math.max(0, o.cart), Math.max(0, -o.cart)];
  }
  if (m === 'flag') {
    for (const f of o.flags) {
      const base = f.team ? s.arena.flagX : -s.arena.flagX;
      if (f.carrier >= 0) {
        const a = s.actors[f.carrier];
        f.x = a.x;
        f.z = a.z;
        continue;
      }
      if (f.away > 0) {
        f.away -= dt;
        if (
          f.away <= 0 ||
          !supported(s, f.x, f.z) ||
          live.some((a) => a.team === f.team && dist(a, f) < 0.9)
        ) {
          Object.assign(f, { x: base, z: 0, away: 0 });
        }
      }
      const grab = live.find((a) => a.team !== f.team && dist(a, f) < 1.15 && a.y < 1.7);
      if (grab) {
        f.carrier = grab.id;
        f.away = 0;
        event(s, 'flag', { who: grab.id, x: f.x, z: f.z });
      }
    }
    for (const f of o.flags)
      if (f.carrier >= 0) {
        const a = s.actors[f.carrier],
          home = o.flags[a.team],
          base = a.team ? s.arena.flagX : -s.arena.flagX;
        if (home.carrier < 0 && home.away <= 0 && Math.hypot(a.x - base, a.z) < 1.55) {
          o.teams[a.team]++;
          a.score++;
          Object.assign(f, { carrier: -1, x: f.team ? s.arena.flagX : -s.arena.flagX, z: 0, away: 0 });
          event(s, 'score', { who: a.id, x: a.x, z: a.z });
        }
      }
  }
  if (m === 'king') {
    const c = o.crown;
    c.lock = Math.max(0, c.lock - dt);
    if (c.carrier >= 0) {
      const a = s.actors[c.carrier];
      a.score += dt;
      c.x = a.x;
      c.z = a.z;
    } else if (c.lock === 0) {
      if (!supported(s, c.x, c.z)) {
        c.x = 0;
        c.z = 0;
      }
      const grab = live.find((a) => dist(a, c) < 1.35 && a.y < 1.6);
      if (grab) {
        c.carrier = grab.id;
        event(s, 'crown', { who: grab.id, x: c.x, z: c.z });
      }
    }
  }
}
function finish(s) {
  const mode = s.config.mode,
    team = !!MODES[mode].team;
  const scores = team ? s.obj.teams : s.actors.map((a) => a.score);
  const high = Math.max(...scores);
  if (mode === 'adventure') {
    if (scores[0] < s.target && s.remain > 0) return;
    s.end = {
      team: true,
      winners: [scores[0] >= s.target ? 0 : 1],
      reason: scores[0] >= s.target ? 'goal' : 'time',
    };
  } else {
    if (high < s.target - 1e-6 && s.remain > 0) return;
    s.end = {
      team,
      winners: scores.flatMap((v, i) => (Math.abs(v - high) < 1e-5 ? [i] : [])),
      reason: s.remain > 0 ? 'goal' : 'time',
    };
  }
  event(s, 'finish');
}
export function stepMatch(s, inputs = {}, dt = STEP) {
  if (s.end) return;
  s.t += dt;
  s.remain = Math.max(0, MODES[s.config.mode].time - s.t);
  if (s.event && s.t >= s.eventUntil) {
    s.event = '';
    event(s, 'calm');
  }
  if (s.t >= s.nextEvent) {
    const list = ['float', 'wind', 'bounce'];
    s.event = list[Math.floor(random(s) * list.length)];
    s.eventUntil = s.t + 7;
    s.nextEvent += 21;
    event(s, 'event', { kind: s.event });
    if (s.event === 'float') {
      for (const body of [...s.actors, ...s.props])
        if (active(body)) {
          body.vy = Math.max(body.vy, 1.7 + random(s) * 0.7);
          body.ground = false;
        }
    }
  }
  const omega = MAPS[s.config.map].spin + s.spinKick;
  const bodies = [];
  s.spinKick *= Math.exp(-dt * 0.9);
  s.glass.forEach((g, i) => {
    if (g.down > 0) g.down = Math.max(0, g.down - dt);
    else if (g.warn > 0) {
      g.warn -= dt;
      if (g.warn <= 0) {
        g.warn = 0;
        g.down = GLASS_REPAIR;
        event(s, 'glass', { x: s.arena.glass[i][0], z: s.arena.glass[i][1] });
      }
    }
  });
  for (const a of s.actors) {
    if (a.dead > 0) {
      a.dead -= dt;
      if (a.dead <= 0) spawn(s, a);
      continue;
    }
    for (const key of [
      'inv',
      'attack',
      'skill',
      'guard',
      'stun',
      'tumble',
      'ac',
      'sc',
      'jc',
      'barCD',
      'brain',
      'emote',
      'emoteCd',
    ])
      a[key] = Math.max(0, a[key] - dt);
    if (a.pulse > 0) {
      a.pulse -= dt;
      if (a.pulse <= 0) wave(s, a, 4.5, 10, 5);
    }
    const input = a.human ? inputs[a.id] || {} : ai(s, a);
    if (a.stun <= 0 && a.y > -0.5) {
      const x = clamp(Number(input.x) || 0, -1, 1),
        z = clamp(Number(input.z) || 0, -1, 1),
        mag = Math.hypot(x, z);
      if (mag > 0.04) {
        const mx = x / Math.max(1, mag),
          mz = z / Math.max(1, mag);
        const steer = a.ground ? 34 : 9.4;
        a.vx += mx * steer * dt;
        a.vz += mz * steer * dt;
        if (!Number.isFinite(input.aimYaw) && (a.human || !input.hit))
          a.yaw += wrap(Math.atan2(mx, mz) - a.yaw) * Math.min(1, dt * 15);
      }
      if (Number.isFinite(input.aimYaw)) a.yaw += wrap(input.aimYaw - a.yaw) * Math.min(1, dt * 22);
      const canJump = a.ground || (s.event === 'float' && a.y < 4 && a.y >= 0);
      if (input.jump && canJump && a.jc <= 0) {
        a.vy = s.event === 'float' ? 3.4 : 7.2;
        pulseJelly(a, a.vy * 0.52);
        a.ground = false;
        a.jc = 0.6;
        event(s, 'jump', { who: a.id, x: a.x, z: a.z });
      }
      if (input.skill && a.sc <= 0) attack(s, a, true, input);
      else if (input.hit && a.ac <= 0) attack(s, a, false, input);
      if (input.emote && a.emoteCd <= 0) {
        a.emote = 1.7;
        a.emoteCd = 2.5;
        event(s, 'emote', { who: a.id, x: a.x, z: a.z });
      }
    }
    bodies.push(a);
  }
  for (const p of s.props) {
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0)
        Object.assign(p, {
          x: (s.arena.crates || crateSpawns)[p.id][0],
          y: 2.3,
          z: (s.arena.crates || crateSpawns)[p.id][1],
          vx: 0,
          vz: 0,
          vy: 0,
          last: -1,
          spin: 0,
          ground: false,
          barCD: 0,
        });
      continue;
    }
    p.barCD = Math.max(0, p.barCD - dt);
    bodies.push(p);
  }
  for (const a of s.actors) stepJelly(a, dt);
  moveBodies(s, bodies, dt, omega);
  for (const b of bodies) {
    if (b.kind) {
      if (b.y < -3.25) fall(s, b);
    } else if (b.y < -3.4) b.dead = 2.8;
  }
  objectives(s, dt);
  finish(s);
}

const two = (v) => Math.round(v * 100) / 100;
const three = (v) => Math.round(v * 1000) / 1000;
const phaseTime = (v) => (v > 0 ? Math.max(0.01, two(v)) : 0);
export function frameOf(s) {
  return {
    t: two(s.t),
    remain: two(s.remain),
    target: s.target,
    angle: two(s.angle),
    event: s.event,
    glass: s.glass.map((g) => ({ warn: phaseTime(g.warn), down: phaseTime(g.down) })),
    actors: s.actors.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      team: a.team,
      human: a.human,
      skin: a.skin,
      outfit: a.outfit,
      emoteId: a.emoteId,
      x: two(a.x),
      y: two(a.y),
      z: two(a.z),
      yaw: two(a.yaw),
      speed: two(Math.min(1, Math.hypot(a.vx, a.vz) / 6)),
      air: two(airAmount(a)),
      jelly: [three(a.soft.height), three(a.soft.leanX), three(a.soft.leanZ)],
      attack: two(a.attack / 0.34),
      skill: two(a.skill / 0.65),
      guard: two(a.guard),
      tumble: two(a.tumble),
      emote: two(a.emote),
      dead: two(a.dead),
      inv: two(a.inv),
      load: Math.round(a.load),
      score: two(a.score),
      kos: a.kos,
      falls: a.falls,
      sc: two(a.sc),
    })),
    props: s.props.map((p) => ({
      id: p.id,
      x: two(p.x),
      y: two(p.y),
      z: two(p.z),
      rot: two(p.rot),
      dead: two(p.dead),
    })),
    shots: s.shots.map((p) => ({ id: p.id, x: two(p.x), y: two(p.y), z: two(p.z), chain: p.chain })),
    obj: {
      teams: s.obj.teams.map(two),
      cart: two(s.obj.cart),
      zone: s.obj.zone,
      flags: s.obj.flags.map((f) => ({ ...f, x: two(f.x), z: two(f.z) })),
      crown: { ...s.obj.crown, x: two(s.obj.crown.x), z: two(s.obj.crown.z) },
    },
  };
}

export function betweenFrames(a, b, u) {
  if (!a || !b || u >= 1) return b || a;
  const lerp = (x, y) => x + (y - x) * u;
  const span = b.t - a.t,
    elapsed = span * u,
    remaining = span - elapsed;
  const mix = (list, prev, turn) =>
    list.map((v, i) => {
      const p = prev[i];
      if (!p || p.id !== v.id || !!p.dead !== !!v.dead || Math.hypot(p.x - v.x, p.z - v.z) > 4) return v;
      const r = { ...v, x: lerp(p.x, v.x), y: lerp(p.y, v.y), z: lerp(p.z, v.z) };
      if (p.jelly && v.jelly) r.jelly = v.jelly.map((value, j) => lerp(p.jelly[j], value));
      if (turn) r[turn] = p[turn] + wrap(v[turn] - p[turn]) * u;
      return r;
    });
  return {
    ...b,
    t: lerp(a.t, b.t),
    // Reconstruct the actual expiry inside the snapshot interval. A guest or replay
    // must not paint a repaired panel while the interpolated actor is still falling.
    glass: b.glass.map((next, i) => {
      const prev = a.glass[i];
      if (prev.down > 0) {
        const left = next.down > 0 ? lerp(prev.down, next.down) : prev.down - elapsed;
        if (left > 0) return { warn: 0, down: left };
      }
      if (prev.warn > 0) {
        const left = next.warn > 0 ? lerp(prev.warn, next.warn) : prev.warn - elapsed;
        if (left > 0) return { warn: left, down: 0 };
      }
      if (next.down > 0 && (prev.warn > 0 || next.down + remaining <= GLASS_REPAIR + 0.005))
        return { warn: 0, down: Math.min(GLASS_REPAIR, next.down + remaining) };
      if (next.warn > 0 && next.warn + remaining <= GLASS_WARNING + 0.005)
        return { warn: Math.min(GLASS_WARNING, next.warn + remaining), down: 0 };
      return { warn: 0, down: 0 };
    }),
    angle: a.angle + wrap(b.angle - a.angle) * u,
    actors: mix(b.actors, a.actors, 'yaw'),
    props: mix(b.props, a.props, 'rot'),
  };
}

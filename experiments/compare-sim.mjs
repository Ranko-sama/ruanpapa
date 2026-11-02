import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Run against an independent copy of the baseline browser sources.
const [baseline, candidate = fileURLToPath(new URL('../', import.meta.url))] = process.argv.slice(2);
if (!baseline)
  throw Error('Usage: node experiments/compare-sim.mjs <baseline browser directory> [candidate directory]');
const moduleAt = (dir, name) => import(pathToFileURL(resolve(dir, name)));
const [before, after, { MAP_IDS, MODES, KINDS }] = await Promise.all([
  moduleAt(baseline, 'sim.js'),
  moduleAt(candidate, 'sim.js'),
  moduleAt(baseline, 'data.js'),
]);
assert.notEqual(before, after, 'Use two different copies of the browser sources');

const rows = [];
let total = 0;
for (const [m, map] of MAP_IDS.entries()) {
  for (const [n, mode] of Object.keys(MODES).entries()) {
    const seed = 0x4a11 + m * 101 + n * 13;
    const settings = {
      map,
      mode,
      level: m,
      players: 2,
      seed,
      picks: [{ kind: 'cowboy' }, { kind: KINDS[(m + n) % 4] }],
    };
    const a = before.createMatch(settings),
      b = after.createMatch(settings);
    const hash = createHash('sha256');
    let ticks = 0;
    while (!a.end && ticks < 7300) {
      // Both versions receive exactly the same inputs, including aim and button timing.
      const inputs = a.actors.slice(0, 2).map((actor, id) => {
        const distance = (enemy) => Math.hypot(enemy.x - actor.x, enemy.z - actor.z);
        const foe = a.actors
          .filter(
            (enemy) => enemy.dead <= 0 && enemy.id !== id && (!MODES[mode].team || actor.team !== enemy.team),
          )
          .sort((u, v) => distance(u) - distance(v))[0] || { x: 0, z: 0 };
        const dx = foe.x - actor.x,
          dz = foe.z - actor.z,
          d = Math.hypot(dx, dz) || 1;
        return {
          x: dx / d,
          z: dz / d,
          aimYaw: Math.atan2(dx, dz),
          hit: (ticks + id) % 7 === 0,
          skill: (ticks + id * 5) % 47 === 0,
          jump: (ticks + id * 19) % 97 === 0,
          emote: (ticks + id) % 601 === 0,
        };
      });
      before.stepMatch(a, inputs);
      after.stepMatch(b, inputs);
      const expected = JSON.stringify([before.frameOf(a), a.events.splice(0), a.end]);
      const actual = JSON.stringify([after.frameOf(b), b.events.splice(0), b.end]);
      assert.ok(actual === expected, `Divergence: ${map}/${mode}, seed ${seed}, tick ${ticks}`);
      hash.update(expected + '\n');
      ticks++;
    }
    assert.ok(a.end, `Unfinished match: ${map}/${mode}`);
    rows.push({ map, mode, seed, ticks, digest: hash.digest('hex') });
    total += ticks;
  }
}
const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
console.log(`${rows.length} matches, ${total} identical frames and event batches. SHA-256 ${digest}`);

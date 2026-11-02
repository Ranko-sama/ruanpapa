import { hasFloorAt } from './arena-geometry.js';

const graphs = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Check both sides of a fighter's intended path. This also works across a seam
// between two separate slabs where neither slab alone contains the whole shoe.
function clear(layout, glass, a, b) {
  const d = distance(a, b),
    steps = Math.max(1, Math.ceil(d / 0.65));
  const nx = d ? ((a.z - b.z) * 0.58) / d : 0,
    nz = d ? ((b.x - a.x) * 0.58) / d : 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps,
      x = a.x + (b.x - a.x) * u,
      z = a.z + (b.z - a.z) * u;
    if (
      !hasFloorAt(layout, glass, x + nx, z + nz) ||
      !hasFloorAt(layout, glass, x - nx, z - nz) ||
      layout.bumpers?.some(([bx, bz]) => (x - bx) ** 2 + (z - bz) ** 2 < 2.15 ** 2)
    )
      return false;
  }
  return true;
}
function graphFor(layout, tiles) {
  if (!graphs.has(layout)) graphs.set(layout, new Map());
  const cache = graphs.get(layout);
  const mask = tiles.reduce((bits, t, i) => bits | (Number(t.down > 0 || t.warn > 0) << i), 0);
  if (cache.has(mask)) return cache.get(mask);
  const glass = tiles.map((_, i) => ({ down: (mask >> i) & 1 }));
  const nodes = layout.waypoints.map(([x, z]) => ({ x, z }));
  const paths = nodes.map((a, i) =>
    nodes.map((b, j) => (i === j ? 0 : clear(layout, glass, a, b) ? distance(a, b) : Infinity)),
  );
  for (let k = 0; k < nodes.length; k++)
    for (let i = 0; i < nodes.length; i++)
      for (let j = 0; j < nodes.length; j++) paths[i][j] = Math.min(paths[i][j], paths[i][k] + paths[k][j]);
  const graph = { glass, nodes, paths };
  cache.set(mask, graph);
  return graph;
}
export function routeOnDeck(layout, tiles, from, goal) {
  const { glass, nodes, paths } = graphFor(layout, tiles);
  if (clear(layout, glass, from, goal)) return goal;
  const ends = nodes.map((node) => (clear(layout, glass, node, goal) ? distance(node, goal) : Infinity));
  // An opponent can be falling into a channel. Approach the nearest safe landing.
  if (!ends.some(Number.isFinite)) {
    let closest = 0;
    for (let i = 1; i < nodes.length; i++)
      if (distance(nodes[i], goal) < distance(nodes[closest], goal)) closest = i;
    ends[closest] = 0;
  }
  let result = null,
    best = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = distance(from, nodes[i]);
    if (d < 0.4 || d > best || !clear(layout, glass, from, nodes[i])) continue;
    const cost = d + Math.min(...paths[i].map((length, j) => length + ends[j]));
    if (cost < best) {
      best = cost;
      result = nodes[i];
    }
  }
  return result || nodes.reduce((a, b) => (distance(from, a) < distance(from, b) ? a : b));
}

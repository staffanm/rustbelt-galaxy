import { TERRAIN } from './data/terrain';
import { UNITS } from './data/units';
import { distance, within } from './hex';
import { log, unitSight } from './rules';
import type { GameState } from './types';

// 0 = not visible, 1 = terrain visible but units hidden (terrain that blocks sight, seen from a distance), 2 = fully visible.
export function computeVisible(s: GameState, f: number): Uint8Array {
  const out = new Uint8Array(s.hexes.length);
  const fac = s.factions[f];
  const close: number[] = []; // positions that see into an adjacent nebula
  const mark = (center: number, radius: number) => {
    for (const i of within(s, center, radius)) {
      const level = TERRAIN[s.hexes[i].terrain].blocksSight && distance(s, center, i) > 1 ? 1 : 2;
      if (out[i] < level) out[i] = level;
    }
  };
  for (const u of s.units) {
    if (u.owner === f) {
      mark(u.hex, unitSight(fac, UNITS[u.type]));
      close.push(u.hex);
    }
  }
  for (const p of s.planets) {
    if (p.owner === f) mark(p.hex, 2);
  }
  for (let i = 0; i < s.hexes.length; i++) {
    const o = s.hexes[i].owner;
    if (o !== undefined && s.planets[o].owner === f) {
      out[i] = 2;
      for (const n of within(s, i, 1)) if (out[n] < 1) out[n] = TERRAIN[s.hexes[n].terrain].blocksSight ? 1 : 2;
    }
  }
  return out;
}

// Marks visible hexes as explored and records first contact with other factions.
export function updateExplored(s: GameState, f: number): Uint8Array {
  const fac = s.factions[f];
  const vis = computeVisible(s, f);
  if (fac.isPirate) return vis;
  for (let i = 0; i < vis.length; i++) if (vis[i]) fac.explored[i] = 1;
  const seen = new Map<number, number>(); // faction -> hex where it was seen
  for (const u of s.units) if (u.owner !== f && vis[u.hex] === 2 && !seen.has(u.owner)) seen.set(u.owner, u.hex);
  for (let i = 0; i < vis.length; i++) {
    const o = s.hexes[i].owner;
    if (vis[i] && o !== undefined && s.planets[o].owner >= 0 && s.planets[o].owner !== f && !seen.has(s.planets[o].owner)) {
      seen.set(s.planets[o].owner, s.planets[o].hex);
    }
  }
  for (const [g, hex] of seen) {
    const other = s.factions[g];
    if (other.isPirate || !other.alive || fac.met.includes(g)) continue;
    meet(s, f, g, hex);
  }
  return vis;
}

export function meet(s: GameState, a: number, b: number, hex?: number) {
  const fa = s.factions[a];
  const fb = s.factions[b];
  if (fa.met.includes(b)) return;
  fa.met.push(b);
  fb.met.push(a);
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const bonus = Math.max(0, ...s.units.filter((u) => u.owner === x).map((u) => UNITS[u.type].contactBonus ?? 0));
    if (bonus) s.attitude[y][x] = Math.min(100, s.attitude[y][x] + bonus);
  }
  log(s, a, `First contact: you met the ${fb.name}.`, hex, 'info');
  log(s, b, `First contact: you met the ${fa.name}.`, hex, 'info');
}

import { TERRAIN } from './data/terrain';
import { UNITS } from './data/units';
import { attack, canAttack, preview } from './combat';
import { difficulty, hexFaction, log, pirateFaction } from './rules';
import { debug, hexLabel, playerLabel, unitLabel } from './debug';
import { emit } from './events';
import { distance, neighbors, within } from './hex';
import { canEnter, canStop, moveToward, occupancy, reachable, refreshUnits } from './movement';
import { assignWorkers, createUnit } from './planet';
import { nextFloat, pick, randInt } from './rng';
import type { GameState, Unit } from './types';
import { computeVisible } from './visibility';

function dens(s: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.hexes.length; i++) if (s.hexes[i].den) out.push(i);
  return out;
}

function freeSpot(s: GameState, center: number, radius: number): number {
  const pf = s.factions[pirateFaction(s)];
  const occ = occupancy(s);
  const spots = within(s, center, radius).filter((i) => canEnter(s, pf, i) && !occ.military.has(i) && !occ.civilian.has(i));
  return spots.length ? pick(s, spots) : -1;
}

function spawn(s: GameState) {
  const pid = pirateFaction(s);
  const rate = difficulty(s).pirateRate;
  const all = dens(s);
  const pirates = s.units.filter((u) => u.owner === pid);
  const raiders = pirates.filter((u) => u.type !== 'leviathan').length;
  const cap = Math.ceil(all.length * 1.5) + Math.floor(s.turn / 40);
  let count = raiders;
  for (const den of all) {
    if (count >= cap || s.turn < 8) break;
    if (nextFloat(s) < 0.08 * rate) {
      const spot = freeSpot(s, den, 1);
      if (spot >= 0) {
        createUnit(s, pid, s.turn > 60 && nextFloat(s) < 0.5 ? 'marauder' : 'raider', spot);
        count++;
      }
    }
  }

  // New dens appear in space that no faction owns or sees.
  const factions = s.factions.filter((f) => !f.isPirate && f.alive);
  if (all.length < 2 + factions.length && nextFloat(s) < 0.05 * rate) {
    const seen = factions.map((f) => computeVisible(s, f.id));
    const spots: number[] = [];
    for (let i = 0; i < s.hexes.length; i++) {
      const h = s.hexes[i];
      if (h.terrain === 'space' || h.terrain === 'star' || h.terrain === 'planet' || h.terrain === 'rift') continue;
      if (h.owner !== undefined || h.den || seen.some((v) => v[i])) continue;
      if (all.some((d) => distance(s, d, i) < 6)) continue;
      spots.push(i);
    }
    if (spots.length) s.hexes[pick(s, spots)].den = true;
  }

  // The Hollow comes out of Void Rifts that nobody watches.
  const hollow = pirates.filter((u) => UNITS[u.type].voidborn).length;
  const hollowCap = 1 + Math.floor(s.turn / 45);
  if (s.turn >= 30 && hollow < hollowCap && nextFloat(s) < 0.05 * rate) {
    const seen = factions.map((f) => computeVisible(s, f.id));
    const occ = occupancy(s);
    const rifts: number[] = [];
    for (let i = 0; i < s.hexes.length; i++) {
      if (s.hexes[i].terrain === 'rift' && !occ.military.has(i) && !seen.some((v) => v[i])) rifts.push(i);
    }
    if (rifts.length) createUnit(s, pid, s.turn > 80 && nextFloat(s) < 0.35 ? 'hollow_choir' : 'hollow_whisper', pick(s, rifts));
  }

  // Leviathans
  const leviathans = pirates.filter((u) => u.type === 'leviathan').length;
  if (s.turn >= 40 && leviathans < 2 && nextFloat(s) < 0.03 * rate) {
    const spots: number[] = [];
    for (let i = 0; i < s.hexes.length; i++) if (s.hexes[i].terrain === 'nebula' && s.hexes[i].owner === undefined) spots.push(i);
    if (spots.length) {
      const spot = freeSpot(s, pick(s, spots), 0);
      if (spot >= 0) createUnit(s, pid, 'leviathan', spot);
    }
  }
}

function pillage(s: GameState, u: Unit): boolean {
  const h = s.hexes[u.hex];
  const owner = hexFaction(s, u.hex);
  if (!h.station || owner < 0) return false;
  h.station = false;
  log(s, owner, `Pirates destroyed your ${TERRAIN[h.terrain].stationName}.`, u.hex, 'bad');
  if (h.owner !== undefined) assignWorkers(s, s.planets[h.owner]);
  return true;
}

// A Hollow unit on a rift can step out of space and appear on another rift.
function phase(s: GameState, u: Unit) {
  if (s.hexes[u.hex].terrain !== 'rift' || nextFloat(s) > 0.35) return;
  const occ = occupancy(s);
  const targets = within(s, u.hex, 14).filter((i) => i !== u.hex && s.hexes[i].terrain === 'rift' && !occ.military.has(i));
  if (!targets.length) return;
  // Prefer a rift near a planet of some faction.
  const scored = targets.map((i) => {
    const near = Math.min(...s.planets.filter((p) => p.owner >= 0).map((p) => distance(s, p.hex, i)), 99);
    return { i, near };
  });
  scored.sort((a, b) => a.near - b.near);
  const to = scored[Math.floor(nextFloat(s) * Math.min(3, scored.length))].i;
  const watchers = s.factions.filter((f) => !f.isPirate && f.alive && computeVisible(s, f.id)[to] === 2);
  emit(s, { kind: 'unitMoved', unit: u.id, owner: u.owner, from: u.hex, to });
  u.hex = to;
  for (const f of watchers) log(s, f.id, `A ${UNITS[u.type].name} stepped out of a Void Rift. It was not there a moment ago.`, to, 'bad');
}

function act(s: GameState, u: Unit, home: number | undefined) {
  // Attack the best target in range.
  let best: { hex: number; score: number; from?: number } | null = null;
  const consider = (from: number | undefined, hex: number) => {
    if (canAttack(s, u, hex, from)) {
      const p = preview(s, u, hex, from)!;
      const score = p.toDefender - p.toAttacker * 0.8 + (p.target.kind === 'civilian' ? 40 : 0) - (p.target.kind === 'planet' ? 25 : 0);
      if (score > 0 && (!best || score > best.score)) best = { hex, score, from };
    }
  };
  for (const n of neighbors(s, u.hex)) consider(undefined, n);
  if (!best) {
    for (const [hex, left] of reachable(s, u)) {
      if (left <= 0) continue;
      for (const n of neighbors(s, hex)) consider(hex, n);
    }
  }
  if (best) {
    const b = best as { hex: number; score: number; from?: number };
    debug(s, 'major', playerLabel(s.factions[u.owner]), () => `Evaluated attack options for ${unitLabel(s, u)} - attack on ${hexLabel(s, b.hex)} from ${hexLabel(s, b.from ?? u.hex)} has the highest expected value (${b.score.toFixed(1)})`);
    if (b.from !== undefined && !moveToward(s, u, b.from)) return;
    attack(s, u, b.hex);
    return;
  }
  if (pillage(s, u)) {
    debug(s, 'major', playerLabel(s.factions[u.owner]), () => `${unitLabel(s, u)} destroyed the station on its hex`);
    u.moves = 0;
    return;
  }
  // Go to a station in range, or wander near the den.
  const range = u.type === 'leviathan' ? 4 : 7;
  const center = home ?? u.hex;
  const occ = occupancy(s);
  const stations = within(s, u.hex, 5).filter(
    (i) => s.hexes[i].station && hexFaction(s, i) >= 0 && distance(s, center, i) <= range + 2 && canStop(s, u, i, occ),
  );
  let target: number | undefined;
  if (stations.length && nextFloat(s) < 0.7) target = stations.sort((a, b) => distance(s, u.hex, a) - distance(s, u.hex, b))[0];
  else {
    const spots = within(s, center, range).filter((i) => canEnter(s, s.factions[u.owner], i, u) && canStop(s, u, i, occ));
    if (spots.length) target = pick(s, spots);
  }
  if (target !== undefined) {
    const to = target;
    debug(s, 'minor', playerLabel(s.factions[u.owner]), () => `${unitLabel(s, u)} moves to ${hexLabel(s, to)}`);
    moveToward(s, u, target);
  }
}

export function piratesTurn(s: GameState) {
  const pid = pirateFaction(s);
  const pf = s.factions[pid];
  refreshUnits(s, pf);
  for (const u of s.units) if (u.owner === pid && u.hp < 100) u.hp = Math.min(100, u.hp + 5);
  spawn(s);
  const all = dens(s);
  const rifts: number[] = [];
  for (let i = 0; i < s.hexes.length; i++) if (s.hexes[i].terrain === 'rift') rifts.push(i);
  for (const u of s.units.filter((x) => x.owner === pid)) {
    if (!s.units.includes(u)) continue;
    if (UNITS[u.type].voidborn) {
      const rift = rifts.slice().sort((a, b) => distance(s, u.hex, a) - distance(s, u.hex, b))[0];
      // A hurt Whisper goes back into the rift and mends there.
      if (s.hexes[u.hex].terrain === 'rift') u.hp = Math.min(100, u.hp + 30);
      if (u.hp < 50 && rift !== undefined) {
        if (u.hex !== rift) moveToward(s, u, rift);
        continue;
      }
      phase(s, u);
      act(s, u, rift);
      continue;
    }
    const home = all.length ? all.slice().sort((a, b) => distance(s, u.hex, a) - distance(s, u.hex, b))[0] : undefined;
    act(s, u, u.type === 'leviathan' ? undefined : home);
  }
}

export { randInt };

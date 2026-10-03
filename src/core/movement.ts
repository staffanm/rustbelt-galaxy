import { PLANET_TYPES, TERRAIN } from './data/terrain';
import { TECH_LIST } from './data/techs';
import { UNITS, UNIT_LIST } from './data/units';
import { emit } from './events';
import { distance, neighbors, within } from './hex';
import { assignWorkers, canSettle, createUnit, settle } from './planet';
import { nextFloat, randInt } from './rng';
import {
  atWar,
  canColonizeType,
  canStation,
  colonizeTech,
  driveLevel,
  factionResources,
  hasTech,
  hexFaction,
  log,
  relation,
  resolveUnit,
  sumMod,
  unitCost,
  unitMove,
} from './rules';
import type { Faction, GameState, Unit } from './types';
import { updateExplored } from './visibility';

// Can a unit of this faction be inside the hex, without regard to other units?
export function canEnter(s: GameState, f: Faction, hex: number, u?: Unit): boolean {
  const h = s.hexes[hex];
  if (h.terrain === 'star') return false;
  if (h.terrain === 'rift') {
    if (u && UNITS[u.type].voidborn) return true;
    if (f.isPirate || driveLevel(f) < 2) return false;
  }
  const owner = hexFaction(s, hex);
  if (h.terrain === 'planet') {
    const p = s.planets[h.planetId!];
    if (f.isPirate) return false;
    return p.owner === f.id || p.owner < 0;
  }
  if (owner >= 0 && owner !== f.id && !f.isPirate) {
    if (!atWar(s, f.id, owner) && !relation(s, f.id, owner).openBorders && !sumMod(f, 'ignoreBorders')) return false;
  }
  return true;
}

export function moveCost(s: GameState, hex: number): number {
  return TERRAIN[s.hexes[hex].terrain].moveCost;
}

interface Occupancy {
  military: Map<number, Unit>;
  civilian: Map<number, Unit>;
}

export function occupancy(s: GameState): Occupancy {
  const military = new Map<number, Unit>();
  const civilian = new Map<number, Unit>();
  for (const u of s.units) (UNITS[u.type].cls === 'military' ? military : civilian).set(u.hex, u);
  return { military, civilian };
}

// Can the unit end its move on the hex?
export function canStop(s: GameState, u: Unit, hex: number, occ: Occupancy): boolean {
  const cls = UNITS[u.type].cls;
  const m = occ.military.get(hex);
  const c = occ.civilian.get(hex);
  for (const o of [m, c]) {
    if (o && o.id !== u.id && o.owner !== u.owner) return false;
  }
  const same = cls === 'military' ? m : c;
  return !same || same.id === u.id;
}

function blockedByEnemy(s: GameState, u: Unit, hex: number, occ: Occupancy): boolean {
  const m = occ.military.get(hex);
  const c = occ.civilian.get(hex);
  return !!((m && m.owner !== u.owner && atWar(s, u.owner, m.owner)) || (c && c.owner !== u.owner && atWar(s, u.owner, c.owner)));
}

class Heap {
  private items: [number, number, number][] = []; // [priority, cost, hex]
  get size() {
    return this.items.length;
  }
  push(item: [number, number, number]) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): [number, number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Shortest path by movement cost (A*). The result excludes the start hex. adjacentOk stops next to the target.
export function findPath(s: GameState, u: Unit, target: number, adjacentOk = false, maxCost = 200): number[] | null {
  const f = s.factions[u.owner];
  const occ = occupancy(s);
  if (u.hex === target) return [];
  const dist = new Map<number, number>([[u.hex, 0]]);
  const prev = new Map<number, number>();
  const open = new Heap();
  open.push([distance(s, u.hex, target), 0, u.hex]);
  let goal = -1;
  while (open.size) {
    const [, d, at] = open.pop();
    if (d > (dist.get(at) ?? Infinity)) continue;
    if (at === target || (adjacentOk && distance(s, at, target) === 1 && canStop(s, u, at, occ))) {
      goal = at;
      break;
    }
    if (d > maxCost) continue;
    for (const n of neighbors(s, at)) {
      if (n === target && !adjacentOk) {
        if (!canEnter(s, f, n, u) || !canStop(s, u, n, occ)) continue;
      } else if (!canEnter(s, f, n, u) || blockedByEnemy(s, u, n, occ)) continue;
      const nd = d + moveCost(s, n) + (canStop(s, u, n, occ) ? 0 : 0.01);
      if (nd < (dist.get(n) ?? Infinity)) {
        dist.set(n, nd);
        prev.set(n, at);
        open.push([nd + distance(s, n, target), nd, n]);
      }
    }
  }
  if (goal < 0) return null;
  const path: number[] = [];
  for (let at = goal; at !== u.hex; at = prev.get(at)!) path.unshift(at);
  return path;
}

// Hexes that the unit can reach this turn, with the moves that remain on arrival.
export function reachable(s: GameState, u: Unit): Map<number, number> {
  const f = s.factions[u.owner];
  const occ = occupancy(s);
  const best = new Map<number, number>([[u.hex, u.moves]]);
  const open = [u.hex];
  while (open.length) {
    const at = open.shift()!;
    const left = best.get(at)!;
    if (left <= 0) continue;
    for (const n of neighbors(s, at)) {
      if (!canEnter(s, f, n, u) || blockedByEnemy(s, u, n, occ)) continue;
      const nl = Math.max(0, left - moveCost(s, n));
      if (nl > (best.get(n) ?? -1)) {
        best.set(n, nl);
        open.push(n);
      }
    }
  }
  const out = new Map<number, number>();
  for (const [hex, left] of best) if (hex !== u.hex && canStop(s, u, hex, occ)) out.set(hex, left);
  return out;
}

const ANOMALY_TEXT = {
  timeslip: 'The ship arrived before it left. The clocks disagree by three days. The crew is rested, repaired, and does not want to talk about it.',
  whisper: 'Something in the anomaly looked back. The ship took damage that the hull shows and the sensors deny. It also left a map, drawn in a script that hurts to read.',
  credits: 'Your crew found an abandoned cargo pod. The owner is not expected to ask for it.',
  science: 'Your crew found an alien data core. Most of it is recipes, but the rest is useful.',
  influence: 'Your crew found a lost ambassador in a life pod. The rescue makes good news.',
  map: 'Your crew found an old star chart. Someone drew sea monsters on the edges.',
  unit: 'Your crew found a derelict warship and started the engine on the third attempt.',
  trap: 'The anomaly was an old mine. The ship has damage. The crew has opinions.',
};

function anomaly(s: GameState, u: Unit) {
  const f = s.factions[u.owner];
  s.hexes[u.hex].anomaly = false;
  const mult = 1 + sumMod(f, 'anomalyMult');
  const roll = nextFloat(s);
  let text: string;
  let tone: 'good' | 'bad' = 'good';
  if (roll < 0.28) {
    const n = Math.round(randInt(s, 30, 60) * mult);
    f.credits += n;
    text = `${ANOMALY_TEXT.credits} +${n} credits.`;
  } else if (roll < 0.52) {
    const n = Math.round(randInt(s, 20, 40) * mult * (1 + f.techs.length * 0.08));
    if (f.researching) f.researchProgress[f.researching] = (f.researchProgress[f.researching] ?? 0) + n;
    else f.researchProgress._pool = (f.researchProgress._pool ?? 0) + n;
    text = `${ANOMALY_TEXT.science} +${n} science.`;
  } else if (roll < 0.68) {
    const n = Math.round(randInt(s, 15, 30) * mult);
    f.influence += n;
    text = `${ANOMALY_TEXT.influence} +${n} influence.`;
  } else if (roll < 0.82) {
    const r = Math.round(5 * mult);
    for (const i of within(s, u.hex, r)) f.explored[i] = 1;
    text = `${ANOMALY_TEXT.map} The map within ${r} hexes is revealed.`;
  } else if (roll < 0.86) {
    u.hp = 100;
    u.moves = unitMove(f, UNITS[u.type]);
    const n = Math.round(randInt(s, 10, 20) * mult);
    f.researchProgress._pool = (f.researchProgress._pool ?? 0) + n;
    text = `${ANOMALY_TEXT.timeslip} The ship is repaired to full and has its moves again. +${n} science.`;
  } else if (roll < 0.9) {
    hurt(s, u, 20);
    const r = Math.round(8 * mult);
    for (const i of within(s, u.hex, r)) f.explored[i] = 1;
    text = `${ANOMALY_TEXT.whisper} -20 hit points. The map within ${r} hexes is revealed.`;
  } else if (roll < 0.94) {
    const def = resolveUnit(f, hasTech(f, 'kinetic_weapons') ? 'frigate' : 'corvette');
    const occ = occupancy(s);
    const spot = within(s, u.hex, 2).find((i) => canEnter(s, f, i) && !occ.military.has(i) && !occ.civilian.has(i));
    if (spot !== undefined) {
      createUnit(s, f.id, def.id, spot).moves = 0;
      text = `${ANOMALY_TEXT.unit} You get a ${def.name}.`;
    } else {
      f.credits += 40;
      text = `${ANOMALY_TEXT.credits} +40 credits.`;
    }
  } else {
    hurt(s, u, 30);
    text = `${ANOMALY_TEXT.trap} -30 hit points.`;
    tone = 'bad';
  }
  log(s, f.id, text, u.hex, tone);
}

// Damage from an anomaly. It does not destroy the unit.
function hurt(s: GameState, u: Unit, amount: number) {
  const lost = Math.min(amount, u.hp - 1);
  u.hp -= lost;
  if (lost > 0) emit(s, { kind: 'unitDamaged', unit: u.id, owner: u.owner, hex: u.hex, amount: lost });
}

function destroyDen(s: GameState, u: Unit) {
  const f = s.factions[u.owner];
  s.hexes[u.hex].den = false;
  const n = 40 + randInt(s, 0, 30);
  f.credits += n;
  f.influence += 5;
  log(s, f.id, `Your ${UNITS[u.type].name} destroyed a pirate den. +${n} credits, +5 influence.`, u.hex, 'good');
}

export function removeUnit(s: GameState, u: Unit) {
  const at = s.units.indexOf(u);
  if (at >= 0) s.units.splice(at, 1);
}

// Moves the unit one hex. Returns false when the step is not possible.
export function step(s: GameState, u: Unit, hex: number): boolean {
  const f = s.factions[u.owner];
  if (u.moves <= 0 || distance(s, u.hex, hex) !== 1 || !canEnter(s, f, hex, u)) return false;
  const occ = occupancy(s);
  if (blockedByEnemy(s, u, hex, occ)) return false;
  emit(s, { kind: 'unitMoved', unit: u.id, owner: u.owner, from: u.hex, to: hex });
  u.hex = hex;
  u.moves = Math.max(0, u.moves - moveCost(s, hex));
  if (u.order?.kind === 'fortify' || u.order?.kind === 'sleep' || u.order?.kind === 'build') u.order = undefined;
  if (!f.isPirate) {
    updateExplored(s, f.id);
    const h = s.hexes[hex];
    if (h.anomaly) anomaly(s, u);
    if (h.den && UNITS[u.type].cls === 'military') destroyDen(s, u);
  }
  return true;
}

// Moves the unit along the path to the target as far as its moves permit. Returns true when it arrived.
export function moveToward(s: GameState, u: Unit, target: number, adjacentOk = false): boolean {
  if (u.hex === target) return true;
  const path = findPath(s, u, target, adjacentOk);
  if (!path) return false;
  if (!path.length) return true;
  const occ = occupancy(s);
  // Find the last hex on the path where the unit can stop this turn.
  let left = u.moves;
  let stopAt = -1;
  for (let i = 0; i < path.length && left > 0; i++) {
    left = Math.max(0, left - moveCost(s, path[i]));
    if (canStop(s, u, path[i], occ)) stopAt = i;
  }
  for (let i = 0; i <= stopAt; i++) {
    if (!step(s, u, path[i])) break;
    if (!s.units.includes(u)) return false;
  }
  const end = path[path.length - 1];
  return u.hex === end;
}

// For each hex on the path, the turn (1 = this turn) in which the unit arrives there.
export function pathTurns(s: GameState, u: Unit, path: number[]): number[] {
  const f = s.factions[u.owner];
  const full = unitMove(f, UNITS[u.type]);
  let left = u.moves;
  let turn = 1;
  const out: number[] = [];
  for (const hex of path) {
    if (left <= 0) {
      turn++;
      left = full;
    }
    left = Math.max(0, left - moveCost(s, hex));
    out.push(turn);
  }
  return out;
}

// Player command: go to the target now and keep the order for later turns.
export function orderMove(s: GameState, u: Unit, target: number): boolean {
  const path = findPath(s, u, target);
  if (!path) return false;
  u.order = { kind: 'goto', target };
  if (moveToward(s, u, target)) u.order = undefined;
  else if (u.order?.kind !== 'goto') u.order = undefined;
  return true;
}

// Actions

// Why the unit cannot found a colony here, or null when it can.
export function colonizeBlocker(s: GameState, u: Unit): string | null {
  const h = s.hexes[u.hex];
  if (!UNITS[u.type].canColonize) return 'This unit cannot found colonies.';
  if (h.planetId === undefined) return 'Move the ship onto a planet.';
  const p = s.planets[h.planetId];
  if (p.owner >= 0) return `${p.name} is already colonized.`;
  const f = s.factions[u.owner];
  if (!canColonizeType(f, p.type)) {
    const tech = colonizeTech(p.type);
    return `A ${PLANET_TYPES[p.type].name.toLowerCase()} world needs the technology ${tech?.name ?? '?'}.`;
  }
  return null;
}

export function canColonizeHere(s: GameState, u: Unit): boolean {
  const h = s.hexes[u.hex];
  if (!UNITS[u.type].canColonize || h.planetId === undefined) return false;
  return canSettle(s, s.factions[u.owner], s.planets[h.planetId]);
}

// The unit needs a move left, as for a station. The player and the AI have the same rule.
export function colonize(s: GameState, u: Unit): boolean {
  if (!canColonizeHere(s, u) || u.moves <= 0) return false;
  const p = s.planets[s.hexes[u.hex].planetId!];
  settle(s, p, u.owner, UNITS[u.type].colonyPop ?? 1);
  const gift = UNITS[u.type].colonyBuilding;
  if (gift) p.buildings.push(gift);
  removeUnit(s, u);
  emit(s, { kind: 'colonyFounded', planet: p.id, owner: u.owner });
  log(s, u.owner, `You founded a colony on ${p.name}.`, p.hex, 'good');
  updateExplored(s, u.owner);
  return true;
}

export function stationTurns(s: GameState, u: Unit): number {
  const f = s.factions[u.owner];
  return Math.max(1, 4 - sumMod(f, 'stationSpeed') - (UNITS[u.type].buildSpeed ?? 0));
}

export function canBuildStation(s: GameState, u: Unit): boolean {
  const h = s.hexes[u.hex];
  const f = s.factions[u.owner];
  if (!UNITS[u.type].canBuild || h.station || hexFaction(s, u.hex) !== u.owner) return false;
  if (!TERRAIN[h.terrain].stationName) return false;
  return canStation(f, h.terrain);
}

// Why the unit cannot build a station here, or null when it can.
export function stationBlocker(s: GameState, u: Unit): string | null {
  const h = s.hexes[u.hex];
  const f = s.factions[u.owner];
  if (!UNITS[u.type].canBuild) return 'This unit cannot build stations.';
  const def = TERRAIN[h.terrain];
  if (!def.stationName) return `No station can be built on ${def.name.toLowerCase()}.`;
  if (h.station) return `This hex already has a ${def.stationName}.`;
  if (hexFaction(s, u.hex) !== u.owner) return 'The hex must be inside your borders.';
  if (!canStation(f, h.terrain)) {
    const tech = TECH_LIST.find((t) => t.effects.some((m) => m.kind === 'station' && m.terrains.includes(h.terrain)));
    return `A ${def.stationName} needs the technology ${tech?.name ?? '?'}.`;
  }
  return null;
}

export function buildStation(s: GameState, u: Unit): boolean {
  if (!canBuildStation(s, u) || u.moves <= 0) return false;
  u.order = { kind: 'build', turnsLeft: stationTurns(s, u) };
  u.moves = 0;
  return true;
}

export function upgradeTarget(s: GameState, u: Unit) {
  const f = s.factions[u.owner];
  let next = UNITS[u.type].upgradesTo;
  let best;
  while (next) {
    const def = UNIT_LIST.find((d) => d.replaces === next && d.species === f.species) ?? UNITS[next];
    if (hasTech(f, def.tech) && (!def.resource || factionResources(s, f.id).has(def.resource))) best = def;
    next = def.upgradesTo;
  }
  return best;
}

export function upgradeCost(s: GameState, u: Unit): number {
  const f = s.factions[u.owner];
  const to = upgradeTarget(s, u);
  if (!to) return 0;
  const diff = unitCost(s, f, to) - unitCost(s, f, UNITS[u.type]);
  return Math.max(10, Math.ceil(diff * 2 * Math.max(0.3, 1 + sumMod(f, 'purchaseCostMult'))));
}

// Why the unit cannot upgrade now, or null when it can.
export function upgradeBlocker(s: GameState, u: Unit): string | null {
  if (!upgradeTarget(s, u)) return 'No upgrade is available.';
  if (hexFaction(s, u.hex) !== u.owner) return 'The unit must be inside your borders.';
  const cost = upgradeCost(s, u);
  if (s.factions[u.owner].credits < cost) return `The upgrade costs ${cost} credits.`;
  return null;
}

export function upgrade(s: GameState, u: Unit): boolean {
  if (upgradeBlocker(s, u)) return false;
  const f = s.factions[u.owner];
  const to = upgradeTarget(s, u)!;
  f.credits -= upgradeCost(s, u);
  u.type = to.id;
  u.moves = 0;
  return true;
}

export function disband(s: GameState, u: Unit) {
  removeUnit(s, u);
}

// Start of turn for the units of one faction: station work, repair, new moves.
export function refreshUnits(s: GameState, f: Faction) {
  const heal = sumMod(f, 'unitHeal');
  for (const u of s.units) {
    if (u.owner !== f.id) continue;
    if (u.order?.kind === 'build') {
      u.order.turnsLeft -= 1;
      if (u.order.turnsLeft <= 0) {
        const h = s.hexes[u.hex];
        if (hexFaction(s, u.hex) === f.id && !h.station) {
          h.station = true;
          log(s, f.id, `Your ${UNITS[u.type].name} completed a ${TERRAIN[h.terrain].stationName}.`, u.hex, 'good');
          const owner = h.owner;
          if (owner !== undefined) assignWorkers(s, s.planets[owner]);
        }
        u.order = undefined;
      }
    }
    if (!u.attacked && u.moves >= unitMove(f, UNITS[u.type]) && u.hp < 100) {
      const home = hexFaction(s, u.hex) === f.id;
      u.hp = Math.min(100, u.hp + (home ? 20 : 10) + heal);
    }
    u.moves = unitMove(f, UNITS[u.type]);
    u.attacked = false;
  }
}

// Units that stand inside borders which are now closed to them move to the nearest permitted hex.
export function expelUnits(s: GameState, a: number, b: number) {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const f = s.factions[x];
    for (const u of s.units.filter((o) => o.owner === x)) {
      if (hexFaction(s, u.hex) !== y || canEnter(s, f, u.hex)) continue;
      const occ = occupancy(s);
      const spot = within(s, u.hex, 6)
        .filter((i) => canEnter(s, f, i) && canStop(s, u, i, occ))
        .sort((p, q) => distance(s, u.hex, p) - distance(s, u.hex, q))[0];
      if (spot !== undefined) {
        emit(s, { kind: 'unitMoved', unit: u.id, owner: u.owner, from: u.hex, to: spot });
        u.hex = spot;
      } else {
        removeUnit(s, u);
        emit(s, { kind: 'unitDestroyed', unit: u.id, owner: u.owner, type: u.type, hex: u.hex, by: -1 });
      }
      u.order = undefined;
    }
  }
}

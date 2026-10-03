import { BUILDINGS, BUILDING_LIST, PROJECTS, type ProjectId } from './data/buildings';
import { SPECIES } from './data/species';
import { PLANET_TYPES, RESOURCES, TERRAIN } from './data/terrain';
import { UNITS, UNIT_LIST, type UnitDef } from './data/units';
import { growthThreshold, hexYield, planetMaxHp, planetModSum, planetYields, popCap, routeValid, tradeSlots } from './economy';
import type { MoraleInfo } from './economy';
import { ENGINE, debug, factionLabel } from './debug';
import { emit } from './events';
import { distance, neighbors, within } from './hex';
import {
  buildingAllowed,
  canColonizeType,
  factionResources,
  hasTech,
  itemCost,
  itemName,
  log,
  ownedPlanets,
  purchaseCost,
  resourceVisible,
  sameItem,
  sumMod,
  unitAllowed,
  unitMove,
  unitsAt,
} from './rules';
import type { BuildItem, Faction, GameState, Planet, ResourceId, Unit, Yields } from './types';

export const BORDER_RADIUS = 3;

export function ownedHexes(s: GameState, p: Planet): number[] {
  return within(s, p.hex, BORDER_RADIUS).filter((i) => s.hexes[i].owner === p.id);
}

function hexValue(yl: Yields, p: Planet, cap: number): number {
  const foodWeight = p.pop >= cap ? 0.4 : 1.3;
  return yl.food * foodWeight + yl.prod * 1.1 + yl.sci * 0.9 + yl.cred * 0.7 + yl.inf * 0.7;
}

// Population works the best hexes. Locked hexes are kept first.
export function assignWorkers(s: GameState, p: Planet) {
  if (p.owner < 0) return;
  const f = s.factions[p.owner];
  const cap = popCap(s, p);
  const options = ownedHexes(s, p).filter((i) => i !== p.hex && TERRAIN[s.hexes[i].terrain].workable);
  p.locked = p.locked.filter((i) => options.includes(i)).slice(0, p.pop);
  const rest = options
    .filter((i) => !p.locked.includes(i))
    .map((i) => ({ i, v: hexValue(hexYield(s, f, i), p, cap) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  p.worked = [...p.locked];
  for (const o of rest) {
    if (p.worked.length >= p.pop) break;
    if (o.v <= 0.7) break; // an idle citizen gives 1 credit
    p.worked.push(o.i);
  }
}

export function toggleWorked(s: GameState, p: Planet, hex: number) {
  if (s.hexes[hex].owner !== p.id || hex === p.hex || !TERRAIN[s.hexes[hex].terrain].workable) return;
  if (p.locked.includes(hex)) p.locked = p.locked.filter((i) => i !== hex);
  else if (p.locked.length < p.pop) p.locked.push(hex);
  else p.locked = [...p.locked.slice(1), hex];
  assignWorkers(s, p);
}

export function claimHex(s: GameState, p: Planet, hex: number) {
  s.hexes[hex].owner = p.id;
  emit(s, { kind: 'borderGrew', planet: p.id, owner: p.owner, hex });
}

export function borderCost(s: GameState, p: Planet): number {
  const extra = Math.max(0, ownedHexes(s, p).length - 7);
  return 10 + 5 * extra;
}

export function hexBuyCost(s: GameState, p: Planet): number {
  return 30 + 12 * Math.max(0, ownedHexes(s, p).length - 7);
}

export function claimOptions(s: GameState, p: Planet): number[] {
  const f = s.factions[p.owner];
  return within(s, p.hex, BORDER_RADIUS)
    .filter((i) => s.hexes[i].owner === undefined && s.hexes[i].terrain !== 'planet')
    .filter((i) => neighbors(s, i).some((n) => s.hexes[n].owner === p.id))
    .map((i) => {
      const h = s.hexes[i];
      const yl = hexYield(s, f, i);
      let v = yl.food + yl.prod + yl.sci + yl.cred * 0.7;
      if (h.resource && resourceVisible(f, h.resource)) v += 4;
      v -= distance(s, p.hex, i) * 1.5;
      return { i, v };
    })
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((o) => o.i);
}

export function growBorder(s: GameState, p: Planet): boolean {
  const options = claimOptions(s, p);
  if (!options.length) return false;
  claimHex(s, p, options[0]);
  return true;
}

export function buyHex(s: GameState, p: Planet, hex: number): boolean {
  const f = s.factions[p.owner];
  const cost = hexBuyCost(s, p);
  if (f.credits < cost || !claimOptions(s, p).includes(hex)) return false;
  f.credits -= cost;
  claimHex(s, p, hex);
  assignWorkers(s, p);
  return true;
}

function nextPlanetName(s: GameState, f: Faction, fallback: string): string {
  const used = new Set(s.planets.map((p) => p.name));
  return SPECIES[f.species].planetNames.find((n) => !used.has(n)) ?? fallback;
}

export function settle(s: GameState, p: Planet, owner: number, pop = 1) {
  const f = s.factions[owner];
  p.owner = owner;
  p.pop = pop;
  p.food = 0;
  p.prodStore = 0;
  p.queue = [];
  p.buildings = [];
  p.routes = [];
  p.locked = [];
  p.borderProgress = 0;
  p.founded = s.turn;
  p.hp = planetMaxHp(s, p);
  p.garrisonHp = 100;
  if (p.homeOf !== owner) p.name = nextPlanetName(s, f, p.name);
  for (const i of within(s, p.hex, 1)) if (s.hexes[i].owner === undefined) claimHex(s, p, i);
  s.hexes[p.hex].owner = p.id;
  assignWorkers(s, p);
}

export function canSettle(s: GameState, f: Faction, p: Planet): boolean {
  return p.owner < 0 && canColonizeType(f, p.type);
}

// Build options

export interface BuildOption {
  item: BuildItem;
  name: string;
  cost: number;
  ok: boolean;
  reason?: string;
}

// hideQueued removes buildings and projects that are in the queue. The planet screen and enqueue use it.
export function buildOptions(s: GameState, p: Planet, hideQueued = true): BuildOption[] {
  const f = s.factions[p.owner];
  const res = factionResources(s, f.id);
  const out: BuildOption[] = [];
  const queued = (item: BuildItem) => hideQueued && p.queue.some((q) => sameItem(q, item));
  for (const def of UNIT_LIST) {
    if (!unitAllowed(f, def)) continue;
    if (def.upgradesTo && obsolete(f, def, res)) continue;
    const item: BuildItem = { kind: 'unit', id: def.id };
    let reason: string | undefined;
    if (def.resource && !res.has(def.resource)) reason = `Needs ${RESOURCES[def.resource].name}`;
    if (def.canColonize && p.pop < 2) reason = 'Needs population 2';
    out.push({ item, name: def.name, cost: itemCost(s, f, item), ok: !reason, reason });
  }
  for (const def of BUILDING_LIST) {
    if (!buildingAllowed(f, def) || p.buildings.includes(def.id)) continue;
    const item: BuildItem = { kind: 'building', id: def.id };
    if (queued(item)) continue;
    let reason: string | undefined;
    if (def.resource && !res.has(def.resource)) reason = `Needs ${RESOURCES[def.resource].name}`;
    out.push({ item, name: def.name, cost: itemCost(s, f, item), ok: !reason, reason });
  }
  for (const def of Object.values(PROJECTS)) {
    if (!hasTech(f, def.tech)) continue;
    const item: BuildItem = { kind: 'project', id: def.id };
    if (queued(item)) continue;
    let reason: string | undefined;
    if (def.id === 'forum_station') {
      if (s.forum) continue;
      if (ownedPlanets(s, f.id).some((o) => o.id !== p.id && o.queue.some((q) => sameItem(q, item)))) continue;
    }
    if (def.id === 'exodus_gate') {
      if (ownedPlanets(s, f.id).some((o) => o.id !== p.id && o.queue.some((q) => sameItem(q, item)))) continue;
    }
    if (def.id === 'terraform' && !PLANET_TYPES[p.type].terraformTo) continue;
    if (def.resource && !res.has(def.resource)) reason = `Needs ${RESOURCES[def.resource].name}`;
    out.push({ item, name: def.name, cost: itemCost(s, f, item), ok: !reason, reason });
  }
  return out;
}

// A unit is obsolete when the faction can build the unit that directly replaces it: it has the technology and the
// resource of that unit. A later unit in the line does not count. A faction that can build the Battleship but not the
// Cruiser keeps the Frigate, so that a cheap warship stays on the list.
// A unit of the faction's own species is never obsolete: it stays on the list, dimmed while its resource is missing.
function obsolete(f: Faction, def: UnitDef, res: Set<ResourceId>): boolean {
  if (!def.upgradesTo || def.species) return false;
  const target = UNIT_LIST.find((u) => u.replaces === def.upgradesTo && u.species === f.species) ?? UNITS[def.upgradesTo];
  return hasTech(f, target.tech) && (!target.resource || res.has(target.resource));
}

export function canBuildItem(s: GameState, p: Planet, item: BuildItem, hideQueued = false): boolean {
  return buildOptions(s, p, hideQueued).some((o) => o.ok && sameItem(o.item, item));
}

export function enqueue(s: GameState, p: Planet, item: BuildItem, front = false): boolean {
  if (!canBuildItem(s, p, item, true)) return false;
  if (front) p.queue.unshift(item);
  else p.queue.push(item);
  return true;
}

// Moves the item at "from" in the queue to the position "to".
export function moveQueued(p: Planet, from: number, to: number): boolean {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < p.queue.length;
  if (!ok(from) || !ok(to) || from === to) return false;
  const [item] = p.queue.splice(from, 1);
  p.queue.splice(to, 0, item);
  return true;
}

// Removes the item at the position from the queue. Stored production stays for the next item.
export function cancelQueued(p: Planet, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= p.queue.length) return false;
  p.queue.splice(index, 1);
  return true;
}

export function spawnHex(s: GameState, p: Planet, def: UnitDef): number {
  const spots = [p.hex, ...neighbors(s, p.hex), ...within(s, p.hex, 2)];
  for (const i of spots) {
    const t = s.hexes[i].terrain;
    if (t === 'star' || t === 'rift') continue;
    if (t === 'planet' && i !== p.hex) continue;
    const here = unitsAt(s, i);
    if (here.some((u) => u.owner !== p.owner)) continue;
    if (here.some((u) => UNITS[u.type].cls === def.cls)) continue;
    return i;
  }
  return -1;
}

export function createUnit(s: GameState, owner: number, type: string, hex: number): Unit {
  const f = s.factions[owner];
  const u: Unit = { id: s.nextUnitId++, type, owner, hex, hp: 100, moves: unitMove(f, UNITS[type]), attacked: false };
  s.units.push(u);
  return u;
}

function complete(s: GameState, p: Planet, item: BuildItem): boolean {
  const f = s.factions[p.owner];
  if (item.kind === 'unit') {
    const def = UNITS[item.id];
    const hex = spawnHex(s, p, def);
    if (hex < 0) return false;
    createUnit(s, p.owner, def.id, hex);
    emit(s, { kind: 'itemCompleted', planet: p.id, owner: p.owner, item });
    if (def.canColonize && p.pop > 1) {
      p.pop -= 1;
      assignWorkers(s, p);
    }
    log(s, f.id, `${p.name} completed a ${def.name}.`, p.hex, 'good');
    return true;
  }
  if (item.kind === 'building') {
    p.buildings.push(item.id);
    p.hp = Math.min(planetMaxHp(s, p), p.hp + planetModSum(p, 'planetHp'));
    emit(s, { kind: 'itemCompleted', planet: p.id, owner: p.owner, item });
    log(s, f.id, `${p.name} completed the ${BUILDINGS[item.id].name}.`, p.hex, 'good');
    return true;
  }
  emit(s, { kind: 'itemCompleted', planet: p.id, owner: p.owner, item });
  PROJECT_EFFECTS[PROJECTS[item.id].id](s, p, f);
  return true;
}

// What each project does on completion. A new project does not compile without an entry here.
const PROJECT_EFFECTS: Record<ProjectId, (s: GameState, p: Planet, f: Faction) => void> = {
  forum_station(s, p, f) {
    if (s.forum) return;
    s.forum = { founder: f.id, host: p.id, members: [f.id], leader: -1, nextElection: s.turn + 10, lastVotes: {} };
    log(s, -1, `${f.name} founded the Interstellar Forum at ${p.name}.`, p.hex, 'info');
  },
  // The Science victory is immediate. A winner that exists already keeps the victory.
  exodus_gate(s, p, f) {
    log(s, -1, `${f.name} opened the Exodus Gate at ${p.name}.`, p.hex, 'info');
    if (s.winner) return;
    s.winner = { faction: f.id, kind: 'science', turn: s.turn };
    debug(s, 'major', ENGINE, () => `${factionLabel(f)} wins by Science`);
  },
  terraform(s, p, f) {
    const to = PLANET_TYPES[p.type].terraformTo;
    if (!to) return;
    log(s, f.id, `${p.name} is now a ${PLANET_TYPES[to].name} world.`, p.hex, 'good');
    p.type = to;
  },
};

export function purchase(s: GameState, p: Planet, item: BuildItem): boolean {
  const f = s.factions[p.owner];
  if (item.kind === 'project' || !canBuildItem(s, p, item)) return false;
  const cost = purchaseCost(s, f, p, item);
  if (f.credits < cost) return false;
  if (item.kind === 'unit' && spawnHex(s, p, UNITS[item.id]) < 0) return false;
  f.credits -= cost;
  if (sameItem(p.queue[0], item)) {
    p.queue.shift();
    p.prodStore = 0;
  } else {
    const at = p.queue.findIndex((q) => sameItem(q, item));
    if (at >= 0 && item.kind === 'building') p.queue.splice(at, 1);
  }
  complete(s, p, item);
  return true;
}

export const GATE_SCIENCE_SHARE = 0.5;

// Production that goes to an item per shift. Units get the unit bonus. The Exodus Gate also gets the empire science.
export function itemProduction(s: GameState, p: Planet, item: BuildItem, prod: number, empireScience: number): number {
  const f = s.factions[p.owner];
  if (item.kind === 'unit') return prod * (1 + planetModSum(p, 'unitProdMult') + sumMod(f, 'unitProdMult'));
  if (item.kind === 'project' && item.id === 'exodus_gate') return prod + empireScience * GATE_SCIENCE_SHARE;
  return prod;
}

export function removeInvalidRoutes(s: GameState, p: Planet) {
  p.routes = p.routes.filter((r) => routeValid(s, p, s.planets[r])).slice(0, Math.max(0, tradeSlots(s, p)));
}

// One turn of growth, production and border growth for a planet. The caller gives the morale level and the empire
// science of this turn. The yields use the technologies that the faction has now.
export function processPlanet(s: GameState, p: Planet, level: MoraleInfo['level'], empireScience: number) {
  const f = s.factions[p.owner];
  removeInvalidRoutes(s, p);
  assignWorkers(s, p);
  const info = planetYields(s, p, level);

  // Growth
  p.food += info.foodSurplus;
  const cap = popCap(s, p);
  const need = growthThreshold(p.pop);
  if (p.food >= need && p.pop < cap) {
    p.food -= need;
    p.pop += 1;
    emit(s, { kind: 'planetGrew', planet: p.id, owner: p.owner, pop: p.pop });
    assignWorkers(s, p);
  } else if (p.food >= need) {
    p.food = need;
  } else if (p.food < 0) {
    if (p.pop > 1) {
      p.pop -= 1;
      log(s, f.id, `${p.name} lost population. The planet has too little food.`, p.hex, 'bad');
      assignWorkers(s, p);
    }
    p.food = 0;
  }

  // Production
  p.queue = p.queue.filter((q, i) => i === 0 || canBuildItem(s, p, q) || q.kind === 'unit');
  const item = p.queue[0];
  if (item) {
    p.prodStore += itemProduction(s, p, item, info.yields.prod, empireScience);
    const cost = itemCost(s, f, item);
    if (p.prodStore >= cost) {
      if (!canBuildItem(s, p, item)) {
        p.queue.shift();
        log(s, f.id, `${p.name} cannot build ${itemName(item)} now. The item was removed.`, p.hex, 'bad');
      } else if (complete(s, p, item)) {
        p.prodStore -= cost;
        p.queue.shift();
      }
    }
  } else {
    p.prodStore = 0;
  }

  // Borders
  p.borderProgress += info.yields.inf;
  const cost = borderCost(s, p);
  if (p.borderProgress >= cost) {
    if (growBorder(s, p)) p.borderProgress -= cost;
    else p.borderProgress = cost;
  }

  // Repair
  const maxHp = planetMaxHp(s, p);
  p.hp = Math.min(maxHp, p.hp + Math.round(maxHp * 0.06));
  p.garrisonHp = Math.min(100, p.garrisonHp + 10);
}

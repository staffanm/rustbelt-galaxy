import { BUILDINGS } from './data/buildings';
import { LUXURY_MORALE, PLANET_TYPES, RESOURCES, TERRAIN, YIELD_KEYS, y } from './data/terrain';
import { UNITS } from './data/units';
import { distance, within } from './hex';
import {
  atWar,
  difficulty,
  driveLevel,
  factionMods,
  factionResources,
  hexFaction,
  ownedPlanets,
  resourceVisible,
  sumMod,
} from './rules';
import type { BudgetKey, Faction, GameState, Planet, PlanetMod, PlanetModKind, Yields } from './types';

export function addYields(a: Yields, b: Partial<Yields>, k = 1): Yields {
  for (const key of YIELD_KEYS) a[key] += (b[key] ?? 0) * k;
  return a;
}

export function hexYield(s: GameState, f: Faction, hex: number): Yields {
  const h = s.hexes[hex];
  const def = TERRAIN[h.terrain];
  const out = { ...def.yields };
  if (h.station) addYields(out, def.station);
  if (h.resource && h.station && resourceVisible(f, h.resource)) addYields(out, RESOURCES[h.resource].bonus);
  for (const m of factionMods(f)) {
    if (m.kind === 'terrainYield' && m.terrain === h.terrain) out[m.yield] += m.value;
  }
  return out;
}

export function planetMods(p: Planet): PlanetMod[] {
  const out: PlanetMod[] = [];
  for (const b of p.buildings) out.push(...(BUILDINGS[b].mods ?? []));
  return out;
}

export function planetModSum(p: Planet, kind: PlanetModKind): number {
  let total = 0;
  for (const m of planetMods(p)) if (m.kind === kind) total += m.value;
  return total;
}

export function capital(s: GameState, f: number): Planet | undefined {
  const mine = ownedPlanets(s, f);
  return mine.find((p) => p.homeOf === f) ?? mine.sort((a, b) => a.founded - b.founded || a.id - b.id)[0];
}

export function popCap(s: GameState, p: Planet): number {
  const f = s.factions[p.owner];
  return PLANET_TYPES[p.type].popCap + planetModSum(p, 'popCap') + (p.homeOf === p.owner ? 2 : 0) + sumMod(f, 'popCap');
}

export const FOOD_PER_POP = 1;
export const MORALE_PER_PLANET = 3;

export function growthThreshold(pop: number): number {
  return Math.round(8 + 4 * pop + Math.pow(pop, 1.5));
}

// Trade routes

// The empire limit on trade routes. Technologies and species traits raise it.
export function routeCap(f: Faction): number {
  return 1 + sumMod(f, 'tradeSlots');
}

export function empireRoutes(s: GameState, f: number): number {
  return s.planets.reduce((a, p) => a + (p.owner === f ? p.routes.length : 0), 0);
}

// Routes that the planet can have now: its buildings give the slots, and the empire limit applies.
export function tradeSlots(s: GameState, p: Planet): number {
  const local = planetModSum(p, 'tradeSlots');
  const left = routeCap(s.factions[p.owner]) - empireRoutes(s, p.owner) + p.routes.length;
  return Math.max(0, Math.min(local, left));
}

export function tradeRange(f: Faction): number {
  return 10 + 4 * driveLevel(f);
}

export function routeValid(s: GameState, from: Planet, to: Planet): boolean {
  if (from.id === to.id || to.owner < 0 || from.owner < 0) return false;
  const f = s.factions[from.owner];
  if (to.owner !== from.owner) {
    if (atWar(s, from.owner, to.owner) || !f.met.includes(to.owner)) return false;
  }
  if (!f.explored[to.hex]) return false;
  return distance(s, from.hex, to.hex) <= tradeRange(f);
}

// Starts a route from the planet. The planet needs a free slot and a valid destination.
export function addRoute(s: GameState, p: Planet, to: number): boolean {
  const target = s.planets[to];
  if (!target || p.owner < 0 || p.routes.includes(to)) return false;
  if (p.routes.length >= tradeSlots(s, p) || !routeValid(s, p, target)) return false;
  p.routes.push(to);
  return true;
}

export function removeRoute(p: Planet, to: number): boolean {
  if (!p.routes.includes(to)) return false;
  p.routes = p.routes.filter((r) => r !== to);
  return true;
}

export function blockaded(s: GameState, p: Planet): boolean {
  if (p.owner < 0) return false;
  const near = within(s, p.hex, 1);
  return s.units.some(
    (u) => near.includes(u.hex) && UNITS[u.type].cls === 'military' && u.owner !== p.owner && atWar(s, u.owner, p.owner),
  );
}

export function routeYield(s: GameState, from: Planet, to: Planet): { cred: number; inf: number } {
  if (!routeValid(s, from, to) || blockaded(s, from) || blockaded(s, to)) return { cred: 0, inf: 0 };
  const f = s.factions[from.owner];
  const foreign = to.owner !== from.owner;
  const d = Math.min(12, distance(s, from.hex, to.hex));
  let cred = 1.5 + 0.2 * (from.pop + to.pop) + 0.15 * d;
  let inf = 0.5;
  if (foreign) {
    cred *= 1.5;
    inf = 1.5;
  }
  cred *= Math.max(0.1, 1 + sumMod(f, 'tradeYieldMult'));
  inf *= 1 + sumMod(f, 'tradeInfluenceMult');
  return { cred, inf };
}

// Credits that a faction receives because other factions have routes to its planets.
export function incomingRouteCredits(s: GameState, f: number): number {
  let total = 0;
  const each = 1 + sumMod(s.factions[f], 'hostCredits');
  for (const p of s.planets) {
    if (p.owner < 0 || p.owner === f) continue;
    for (const r of p.routes) {
      const to = s.planets[r];
      if (to.owner === f && routeYield(s, p, to).cred > 0) total += each;
    }
  }
  return total;
}

// Morale

export interface MoraleInfo {
  total: number;
  parts: { label: string; value: number }[];
  level: 'Inspired' | 'Steady' | 'Restless' | 'Unrest';
}

export function morale(s: GameState, f: Faction): MoraleInfo {
  const mine = ownedPlanets(s, f.id);
  const d = difficulty(s);
  const parts: { label: string; value: number }[] = [];
  parts.push({ label: 'Base', value: f.isHuman ? d.playerMorale : d.aiMorale });
  const perPlanet = Math.max(0.5, MORALE_PER_PLANET + sumMod(f, 'moralePerPlanet'));
  parts.push({ label: `Planets (${mine.length})`, value: -perPlanet * mine.length });
  const pop = mine.reduce((a, p) => a + p.pop, 0);
  parts.push({ label: `Population (${pop})`, value: -Math.floor(pop * Math.max(0, 0.5 + sumMod(f, 'moralePerPop'))) });
  // Buildings on a planet cannot give more morale than the planet has population.
  const buildings = mine.reduce((a, p) => a + Math.min(p.pop, planetModSum(p, 'morale')), 0);
  if (buildings) parts.push({ label: 'Buildings', value: buildings });
  let lux = 0;
  for (const r of factionResources(s, f.id)) if (RESOURCES[r].kind === 'luxury') lux += LUXURY_MORALE + sumMod(f, 'luxuryMorale');
  if (lux) parts.push({ label: 'Luxury resources', value: lux });
  const tech = sumMod(f, 'morale');
  if (tech) parts.push({ label: 'Traits and technologies', value: tech });
  const welfare = welfareMorale(s, f);
  if (welfare) parts.push({ label: 'Welfare budget', value: welfare });
  const wars = s.factions.filter((o) => !o.isPirate && o.alive && o.id !== f.id && atWar(s, f.id, o.id)).length;
  if (wars) parts.push({ label: `Wars (${wars})`, value: -wars });
  const total = Math.round(parts.reduce((a, p) => a + p.value, 0));
  return { total, parts, level: moraleLevel(total) };
}

// The level of a morale total. The interface and the turn log use it for the level of the last shift too.
export function moraleLevel(total: number): MoraleInfo['level'] {
  return total >= 8 ? 'Inspired' : total >= 0 ? 'Steady' : total >= -5 ? 'Restless' : 'Unrest';
}

// What a morale level does to the empire, in words for the player.
export const MORALE_TEXT: Record<MoraleInfo['level'], string> = {
  Inspired: '+10% growth, production and science.',
  Steady: 'No effect.',
  Restless: 'Growth is halved.',
  Unrest: 'No growth. Production and science -25%. Unit strength -10%.',
};

export function moraleEffects(level: MoraleInfo['level']) {
  switch (level) {
    case 'Inspired':
      return { growth: 1.1, output: 1.1, combat: 1 };
    case 'Steady':
      return { growth: 1, output: 1, combat: 1 };
    case 'Restless':
      return { growth: 0.5, output: 1, combat: 1 };
    case 'Unrest':
      return { growth: 0, output: 0.75, combat: 0.9 };
  }
}

// Planet yields

export interface PlanetYieldInfo {
  yields: Yields; // after multipliers
  foodSurplus: number;
  upkeep: number;
  trade: { cred: number; inf: number };
}

export function planetYields(s: GameState, p: Planet, moraleLevel?: MoraleInfo['level']): PlanetYieldInfo {
  const f = s.factions[p.owner];
  const out = y();
  addYields(out, PLANET_TYPES[p.type].yields);
  if (p.homeOf === p.owner) addYields(out, y(1, 3, 3, 1, 1));
  out.inf += 1;
  out.prod += 1; // every colony has some industry of its own
  for (const h of p.worked) addYields(out, hexYield(s, f, h));
  const idle = Math.max(0, p.pop - p.worked.length);
  out.cred += idle;
  out.sci += p.pop * 0.5;

  const flatMult = y();
  const mult = y();
  for (const m of factionMods(f)) {
    if (m.kind === 'buildingFlatMult') flatMult[m.yield] += m.value;
    else if (m.kind === 'yieldMult') mult[m.yield] += m.value;
    else if (m.kind === 'yieldFlat') out[m.yield] += m.value;
  }
  let upkeep = 0;
  for (const id of p.buildings) {
    const b = BUILDINGS[id];
    upkeep += b.upkeep;
    for (const k of YIELD_KEYS) {
      if (b.flat?.[k]) out[k] += b.flat[k]! * (1 + flatMult[k]);
      if (b.mult?.[k]) mult[k] += b.mult[k]!;
    }
  }

  const trade = { cred: 0, inf: 0 };
  for (const r of p.routes) {
    const t = routeYield(s, p, s.planets[r]);
    trade.cred += t.cred;
    trade.inf += t.inf;
  }
  out.cred += trade.cred;
  out.inf += trade.inf;

  const fx = moraleEffects(moraleLevel ?? morale(s, f).level);
  const ai = f.isHuman ? 1 : difficulty(s).aiYieldMult;
  out.food *= 1 + mult.food;
  out.prod *= (1 + mult.prod) * fx.output * ai;
  out.sci *= (1 + mult.sci) * fx.output * ai;
  out.cred *= (1 + mult.cred) * ai;
  out.inf *= 1 + mult.inf;

  let foodSurplus = out.food - p.pop * Math.max(0, FOOD_PER_POP + sumMod(f, 'foodPerPop'));
  if (foodSurplus > 0) foodSurplus *= fx.growth * (1 + sumMod(f, 'growthMult'));
  return { yields: out, foodSurplus, upkeep, trade };
}

export function unitUpkeep(s: GameState, f: Faction): number {
  let total = 0;
  for (const u of s.units) {
    if (u.owner !== f.id) continue;
    const def = UNITS[u.type];
    if (def.cls === 'civilian' && !def.ground) continue;
    total += def.cost >= 250 ? 3 : def.cost >= 100 ? 2 : 1;
  }
  const free = 3 + ownedPlanets(s, f.id).length;
  return Math.max(0, total - free) * Math.max(0.1, 1 + sumMod(f, 'unitUpkeepMult'));
}

export interface Income {
  cred: number; // credits that reach the treasury
  sci: number;
  inf: number;
  morale: MoraleInfo;
  buildingUpkeep: number;
  unitUpkeep: number;
  surplus: number; // credits before the budget
  toResearch: number; // credits turned into science
  toWelfare: number; // credits spent on welfare
}

export const WELFARE_PER_MORALE = 3; // credits per shift for one point of morale
export const WELFARE_MAX_MORALE = 8;

// Sets one share of the budget: 0 to 100 in steps of 10. The other share goes down when the sum is more than 100.
export function setBudget(f: Faction, key: BudgetKey, value: number): boolean {
  if (!Number.isInteger(value) || value < 0 || value > 100 || value % 10 !== 0) return false;
  const other: BudgetKey = key === 'research' ? 'welfare' : 'research';
  f.budget[key] = value;
  if (f.budget[other] > 100 - value) f.budget[other] = 100 - value;
  return true;
}

// Morale that the welfare share of the budget gives. It needs a positive credit surplus.
export function welfareMorale(s: GameState, f: Faction): number {
  const surplus = grossIncome(s, f);
  if (surplus <= 0 || !f.budget?.welfare) return 0;
  return Math.min(WELFARE_MAX_MORALE, Math.floor((surplus * f.budget.welfare) / 100 / WELFARE_PER_MORALE));
}

// Credits per shift before the budget, with a neutral morale level for the planet output.
function grossIncome(s: GameState, f: Faction): number {
  let cred = 0;
  let buildingUpkeep = 0;
  for (const p of ownedPlanets(s, f.id)) {
    const info = planetYields(s, p, 'Steady');
    cred += info.yields.cred;
    buildingUpkeep += info.upkeep;
    if (!p.queue.length) cred += info.yields.prod * 0.5;
  }
  cred += incomingRouteCredits(s, f.id);
  return cred - buildingUpkeep - unitUpkeep(s, f);
}

export function empireIncome(s: GameState, f: Faction): Income {
  const m = morale(s, f);
  let cred = 0;
  let sci = 0;
  let inf = 0;
  let buildingUpkeep = 0;
  for (const p of ownedPlanets(s, f.id)) {
    const info = planetYields(s, p, m.level);
    cred += info.yields.cred;
    sci += info.yields.sci;
    inf += info.yields.inf;
    buildingUpkeep += info.upkeep;
    if (!p.queue.length) cred += info.yields.prod * 0.5;
  }
  cred += incomingRouteCredits(s, f.id);
  const uu = unitUpkeep(s, f);
  cred -= buildingUpkeep + uu;
  const surplus = cred;
  let toResearch = 0;
  let toWelfare = 0;
  if (surplus > 0 && f.budget) {
    toResearch = (surplus * f.budget.research) / 100;
    toWelfare = (surplus * f.budget.welfare) / 100;
    cred -= toResearch + toWelfare;
    sci += toResearch;
  }
  return { cred, sci, inf, morale: m, buildingUpkeep, unitUpkeep: uu, surplus, toResearch, toWelfare };
}

// Planet defence

export function planetMaxHp(s: GameState, p: Planet): number {
  return 100 + planetModSum(p, 'planetHp') + (p.owner >= 0 ? sumMod(s.factions[p.owner], 'planetHp') : 0);
}

// A home planet that its first owner still holds has the old fortifications of the species: more planet strength
// and more garrison strength.
export const HOME_DEFENCE = 1.08;

function homeDefence(p: Planet): number {
  return p.homeOf === p.owner ? HOME_DEFENCE : 1;
}

export function planetStrength(s: GameState, p: Planet): number {
  const f = s.factions[p.owner];
  const base = 8 + p.pop * 1.5 + f.techs.length * 0.6;
  return base * (1 + planetModSum(p, 'planetStrengthMult') + sumMod(f, 'planetStrengthMult')) * homeDefence(p);
}

export function garrisonStrength(s: GameState, p: Planet): number {
  const f = s.factions[p.owner];
  const base = 12 + p.pop * 1.5 + f.techs.length * 0.4 + planetModSum(p, 'garrison') + sumMod(f, 'garrison');
  return base * (1 + sumMod(f, 'groundMult')) * homeDefence(p);
}

export function ownerOfHex(s: GameState, hex: number): number {
  return hexFaction(s, hex);
}

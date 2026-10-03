// Advisors for the player: one suggestion for production and one for research in each field. The advisors read the
// state of the own faction only and do not change it.
import { BUILDINGS, BUILDING_LIST, type BuildingDef } from './data/buildings';
import { TECH_LIST, type TechDef } from './data/techs';
import { YIELD_KEYS } from './data/terrain';
import { UNITS, UNIT_LIST } from './data/units';
import { morale, planetYields, popCap } from './economy';
import { buildOptions, canSettle } from './planet';
import { researchPath } from './research';
import { atWar, buildingAllowed, ownedPlanets, realFactions, sumMod, techAvailable, techCost, unitAllowed } from './rules';
import type { BuildItem, Faction, GameState, Mod, Planet, YieldKey } from './types';

export type Field = 'military' | 'economy' | 'science' | 'growth' | 'morale';

export const FIELDS: { id: Field; name: string }[] = [
  { id: 'military', name: 'Military' },
  { id: 'economy', name: 'Economy' },
  { id: 'science', name: 'Science' },
  { id: 'growth', name: 'Growth' },
  { id: 'morale', name: 'Morale' },
];

export interface ProductionAdvice {
  field: Field;
  item: BuildItem;
  name: string;
  reason: string;
}

export interface ResearchAdvice {
  field: Field;
  tech: string; // the target. The research path can have more technologies before it.
  steps: number; // technologies on the path, the target included
  cost: number; // science for the path
  reason: string;
}

const num = (v: number) => (Math.round(v * 10) / 10).toString();
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The yields that a building adds on this planet now.
function buildingGain(s: GameState, p: Planet, def: BuildingDef): Record<YieldKey, number> {
  const f = s.factions[p.owner];
  const y = planetYields(s, p).yields;
  const out = { food: 0, prod: 0, sci: 0, cred: 0, inf: 0 };
  for (const k of YIELD_KEYS) {
    const flat = (def.flat?.[k] ?? 0) * (1 + sumMod(f, 'buildingFlatMult', (m) => m.yield === k));
    out[k] = flat + (def.mult?.[k] ?? 0) * y[k];
  }
  return out;
}

function gainText(gain: Record<YieldKey, number>, keys: YieldKey[]): string {
  const names: Record<YieldKey, string> = { food: 'food', prod: 'production', sci: 'science', cred: 'credits', inf: 'influence' };
  return keys
    .filter((k) => gain[k] >= 0.05)
    .map((k) => `+${num(gain[k])} ${names[k]}`)
    .join(', ');
}

function warships(s: GameState, f: number): number {
  return s.units.filter((u) => u.owner === f && UNITS[u.type].cls === 'military' && UNITS[u.type].strength >= 10).length;
}

function wars(s: GameState, f: number): number {
  return realFactions(s).filter((o) => o.alive && o.id !== f && atWar(s, f, o.id)).length;
}

// One suggestion for each field in which the planet can build something useful. The list can be empty.
export function productionAdvice(s: GameState, p: Planet): ProductionAdvice[] {
  const f = s.factions[p.owner];
  const options = buildOptions(s, p).filter((o) => o.ok);
  const buildings = options.filter((o) => o.item.kind === 'building').map((o) => ({ o, def: BUILDINGS[o.item.id], gain: buildingGain(s, p, BUILDINGS[o.item.id]) }));
  const out: ProductionAdvice[] = [];
  const add = (field: Field, o: { item: BuildItem; name: string } | undefined, reason: string) => {
    if (o) out.push({ field, item: o.item, name: o.name, reason });
  };
  const best = <T>(list: T[], value: (x: T) => number): T | undefined => {
    let pick: T | undefined;
    let top = 0;
    for (const x of list) {
      const v = value(x);
      if (v > top) {
        top = v;
        pick = x;
      }
    }
    return pick;
  };
  const modSum = (def: BuildingDef, kind: Mod['kind']) => (def.mods ?? []).reduce((a, m) => a + (m.kind === kind ? m.value : 0), 0);

  // Military: a warship while the fleet is small for the empire, then the defence of the planet.
  const fleet = warships(s, f.id);
  const planets = ownedPlanets(s, f.id).length;
  const enemies = wars(s, f.id);
  const ship = best(
    options.filter((o) => o.item.kind === 'unit' && UNITS[o.item.id].cls === 'military' && UNITS[o.item.id].strength >= 10),
    (o) => Math.max(UNITS[o.item.id].strength, UNITS[o.item.id].ranged ?? 0),
  );
  const fort = best(
    buildings.filter((b) => b.def.category === 'military'),
    (b) => 1 / b.o.cost,
  );
  const wanted = planets + 1 + 2 * enemies;
  if (ship && (fleet < wanted || !fort)) {
    const d = UNITS[ship.item.id];
    add('military', ship, `Your strongest warship: strength ${Math.max(d.strength, d.ranged ?? 0)}. You have ${count(fleet, 'warship')} for ${count(planets, 'planet')}${enemies ? ` and ${count(enemies, 'war')}` : ''}.`);
  } else if (fort) add('military', fort.o, `Your fleet is large enough. This raises the defence of ${p.name}.`);

  // Economy: production and credits for each point of cost, less the upkeep.
  const eco = best(buildings, (b) => (b.gain.prod + 0.8 * b.gain.cred + 3 * modSum(b.def, 'tradeSlots') - 0.8 * b.def.upkeep) / b.o.cost);
  if (eco) {
    const slots = modSum(eco.def, 'tradeSlots');
    const parts = [gainText(eco.gain, ['prod', 'cred']), slots ? `+${slots} trade routes` : ''].filter(Boolean).join(', ');
    add('economy', eco.o, `${parts} each shift, upkeep ${eco.def.upkeep} credits. The best return for its cost.`);
  }

  // Science: the Exodus Gate when it is possible, else the best science building.
  const gate = options.find((o) => o.item.kind === 'project' && o.item.id === 'exodus_gate');
  const sci = best(buildings, (b) => b.gain.sci / b.o.cost);
  if (gate) add('science', gate, 'The Exodus Gate gives the Science victory. It gets the production of the planet and half of your science.');
  else if (sci) add('science', sci.o, `${gainText(sci.gain, ['sci'])} each shift. The best science for its cost.`);

  // Growth: a colony ship when a free planet is known, else food and room for population.
  const colony = options.find((o) => o.item.kind === 'unit' && UNITS[o.item.id].canColonize);
  const haveColony = s.units.some((u) => u.owner === f.id && UNITS[u.type].canColonize) || ownedPlanets(s, f.id).some((o) => o.queue.some((q) => q.kind === 'unit' && UNITS[q.id].canColonize));
  const free = s.planets.filter((q) => canSettle(s, f, q) && f.explored[q.hex]).length;
  const cap = popCap(s, p);
  const grow = best(buildings, (b) => (b.gain.food + (p.pop >= cap - 1 ? 2 : 0.3) * modSum(b.def, 'popCap')) / b.o.cost);
  if (colony && free && !haveColony && p.pop >= 3) add('growth', colony, `You know ${free} free ${free === 1 ? 'planet' : 'planets'} that you can colonize, and you have no colony ship.`);
  else if (grow) {
    const room = modSum(grow.def, 'popCap');
    const parts = [gainText(grow.gain, ['food']), room ? `+${room} population limit` : ''].filter(Boolean).join(', ');
    add('growth', grow.o, `${parts}. Population ${p.pop} of ${cap}.`);
  }

  // Morale: the building with the most morale. A planet cannot use more building morale than it has population.
  const m = morale(s, f);
  const happy = best(buildings, (b) => modSum(b.def, 'morale') / b.o.cost);
  if (happy) add('morale', happy.o, `+${modSum(happy.def, 'morale')} morale. Your morale is ${m.total} (${m.level})${m.total < 0 ? ', which lowers your yields' : ''}.`);
  return out;
}

const MORALE_KINDS: Mod['kind'][] = ['morale', 'moralePerPlanet', 'moralePerPop', 'luxuryMorale'];
const GROWTH_KINDS: Mod['kind'][] = ['growthMult', 'popCap', 'foodPerPop', 'colonize'];

// What the technology unlocks for the faction. The check ignores the technology requirement itself.
function unlocked(f: Faction, t: TechDef) {
  const known = { ...f, techs: [...f.techs, t.id] } as Faction;
  return {
    units: UNIT_LIST.filter((u) => u.tech === t.id && unitAllowed(known, u)),
    buildings: BUILDING_LIST.filter((b) => b.tech === t.id && buildingAllowed(known, b)),
  };
}

// How much the technology helps a field: 0 for no help.
function relevance(s: GameState, f: Faction, t: TechDef, field: Field): number {
  const u = unlocked(f, t);
  const has = (kinds: Mod['kind'][]) => t.effects.some((m) => kinds.includes(m.kind));
  const yields = (k: YieldKey) => t.effects.some((m) => (m.kind === 'yieldMult' || m.kind === 'yieldFlat') && m.yield === k) || u.buildings.some((b) => b.category === k);
  switch (field) {
    case 'military':
      return (t.category === 'military' ? 1 : 0) + (u.units.some((d) => d.cls === 'military' && d.strength >= 10) ? 1 : 0);
    case 'economy':
      return (t.category === 'economy' ? 1 : 0) + (yields('prod') || yields('cred') ? 1 : 0);
    case 'science':
      return (t.category === 'science' ? 1 : 0) + (yields('sci') ? 1 : 0);
    case 'growth': {
      const opens = t.effects.some((m) => m.kind === 'colonize' && s.planets.some((p) => p.owner < 0 && f.explored[p.hex] && m.types.includes(p.type)));
      return (t.category === 'colonization' ? 1 : 0) + (has(GROWTH_KINDS) || yields('food') || u.buildings.some((b) => b.category === 'growth') ? 1 : 0) + (opens ? 1 : 0);
    }
    case 'morale':
      return (has(MORALE_KINDS) ? 1 : 0) + (u.buildings.some((b) => b.category === 'morale' || (b.mods ?? []).some((m) => m.kind === 'morale')) ? 1 : 0);
  }
}

// One research target for each field: the technology with the most help for the science that its path costs.
export function researchAdvice(s: GameState, f: Faction): ResearchAdvice[] {
  const out: ResearchAdvice[] = [];
  const open = TECH_LIST.filter((t) => techAvailable(f, t.id) && !f.techs.includes(t.id)).map((t) => {
    const path = researchPath(f, t.id);
    const cost = path.reduce((a, id) => a + Math.max(0, techCost(s, f, id) - (f.researchProgress[id] ?? 0)), 0);
    return { t, path, cost };
  });
  for (const { id: field } of FIELDS) {
    let pick: (typeof open)[number] | undefined;
    let top = 0;
    for (const c of open) {
      const v = relevance(s, f, c.t, field) / Math.max(1, c.cost);
      if (v > top) {
        top = v;
        pick = c;
      }
    }
    if (!pick) continue;
    const u = unlocked(f, pick.t);
    const names = [...u.units, ...u.buildings].map((d) => d.name);
    const what = names.length ? `Unlocks ${names.join(', ')}.` : pick.t.text;
    const before = pick.path.length > 1 ? ` It needs ${pick.path.length - 1} more ${pick.path.length === 2 ? 'technology' : 'technologies'} first.` : '';
    out.push({ field, tech: pick.t.id, steps: pick.path.length, cost: Math.round(pick.cost), reason: `${what}${before}` });
  }
  return out;
}

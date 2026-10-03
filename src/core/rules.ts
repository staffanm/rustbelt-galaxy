import { BUILDINGS, BUILDING_LIST, PROJECTS, type BuildingDef } from './data/buildings';
import { DIFFICULTIES, SPECIES } from './data/species';
import { TECHS, TECH_LIST, type TechDef } from './data/techs';
import { UNITS, UNIT_LIST, type UnitDef } from './data/units';
import type { BuildItem, Faction, GameState, Mod, PairState, Planet, PlanetTypeId, ResourceId, TerrainId } from './types';
import { distance } from './hex';

const modCache = new WeakMap<Faction, { species: string; techs: string[]; mods: Mod[] }>();

// All empire modifiers of a faction: species traits plus the effects of researched technologies.
// The cache is valid only while the species and the list of technologies are the same.
export function factionMods(f: Faction): Mod[] {
  const hit = modCache.get(f);
  if (hit && hit.species === f.species && hit.techs.length === f.techs.length && hit.techs.every((id, i) => id === f.techs[i])) {
    return hit.mods;
  }
  const mods: Mod[] = [...SPECIES[f.species].traits];
  for (const id of f.techs) mods.push(...TECHS[id].effects);
  modCache.set(f, { species: f.species, techs: [...f.techs], mods });
  return mods;
}

type ValueMod = Extract<Mod, { value: number }>;

export function sumMod<K extends ValueMod['kind']>(
  f: Faction,
  kind: K,
  pred?: (m: Extract<Mod, { kind: K }>) => boolean,
): number {
  let total = 0;
  for (const m of factionMods(f)) {
    if (m.kind === kind && (!pred || pred(m as Extract<Mod, { kind: K }>))) total += (m as ValueMod).value;
  }
  return total;
}

export function difficulty(s: GameState) {
  return DIFFICULTIES[s.settings.difficulty];
}

export function hasTech(f: Faction, id: string | undefined): boolean {
  return !id || f.techs.includes(id);
}

export function techAvailable(f: Faction, id: string): boolean {
  const def = TECHS[id];
  if (!def) return false;
  if (def.species && def.species !== f.species) return false;
  return !SPECIES[f.species].excludedTechs.includes(id);
}

// Prerequisites that exist for this faction. An excluded prerequisite counts as met.
export function techPrereqs(f: Faction, id: string): string[] {
  return TECHS[id].prereqs.filter((p) => techAvailable(f, p));
}

export function canResearch(f: Faction, id: string): boolean {
  return techAvailable(f, id) && !f.techs.includes(id) && techPrereqs(f, id).every((p) => f.techs.includes(p));
}

export function factionTechs(f: Faction): TechDef[] {
  return TECH_LIST.filter((d) => techAvailable(f, d.id));
}

export function techCost(s: GameState, f: Faction, id: string): number {
  const def = TECHS[id];
  let mult = 1 + sumMod(f, 'techCostMult', (m) => m.category === def.category);
  if (!f.isHuman) mult *= difficulty(s).aiCostMult;
  return Math.max(1, Math.round(def.cost * mult));
}

export function driveLevel(f: Faction): number {
  return sumMod(f, 'driveLevel');
}

export const DRIVE_NAMES = ['Jump Drive', 'Warp Drive', 'Hyperdrive', 'Fold Drive'];

export function canColonizeType(f: Faction, type: PlanetTypeId): boolean {
  if (type === 'terran' || type === 'ocean') return true;
  return factionMods(f).some((m) => m.kind === 'colonize' && m.types.includes(type));
}

// The technology that permits colonies on a planet type, or undefined when none is needed.
export function colonizeTech(type: PlanetTypeId): TechDef | undefined {
  return TECH_LIST.find((t) => t.effects.some((m) => m.kind === 'colonize' && m.types.includes(type)));
}

export function canStation(f: Faction, terrain: TerrainId): boolean {
  return factionMods(f).some((m) => m.kind === 'station' && m.terrains.includes(terrain));
}

// The technology that shows a resource on the map, or undefined when the resource is always visible.
export function revealTech(r: ResourceId): TechDef | undefined {
  return TECH_LIST.find((t) => t.effects.some((m) => m.kind === 'reveal' && m.resource === r));
}

const HIDDEN_RESOURCES = new Set(TECH_LIST.flatMap((t) => t.effects.flatMap((m) => (m.kind === 'reveal' ? [m.resource] : []))));

// The "reveal" modifier is the one source for this rule.
export function resourceVisible(f: Faction, r: ResourceId): boolean {
  return !HIDDEN_RESOURCES.has(r) || factionMods(f).some((m) => m.kind === 'reveal' && m.resource === r);
}

export function ownedPlanets(s: GameState, f: number): Planet[] {
  return s.planets.filter((p) => p.owner === f);
}

export function hexFaction(s: GameState, hex: number): number {
  const o = s.hexes[hex].owner;
  return o === undefined ? -1 : s.planets[o].owner;
}

// Resources that the faction has connected: the hex is inside its borders and has a station.
export function factionResources(s: GameState, f: number): Set<ResourceId> {
  const out = new Set<ResourceId>();
  for (let i = 0; i < s.hexes.length; i++) {
    const h = s.hexes[i];
    if (h.resource && h.station && h.owner !== undefined && s.planets[h.owner].owner === f) out.add(h.resource);
  }
  return out;
}

// A unit or building of another species is permitted when the faction has the species technology that it needs.
// A faction gets such a technology when it captures the home planet of that species.
function speciesOk(def: { species?: string; tech?: string }, f: Faction): boolean {
  if (!def.species || def.species === f.species) return true;
  return !!def.tech && TECHS[def.tech].species === def.species && f.techs.includes(def.tech);
}

// The unit that this faction builds in place of a base unit.
export function resolveUnit(f: Faction, baseId: string): UnitDef {
  const repl = UNIT_LIST.find((u) => u.replaces === baseId && u.species === f.species);
  return repl ?? UNITS[baseId];
}

function replacedFor(f: Faction, id: string, list: { replaces?: string; species?: string }[]): boolean {
  return list.some((u) => u.replaces === id && u.species === f.species);
}

export function unitAllowed(f: Faction, def: UnitDef): boolean {
  if (def.species === 'pirates') return false;
  return speciesOk(def, f) && !replacedFor(f, def.id, UNIT_LIST) && hasTech(f, def.tech);
}

export function buildingAllowed(f: Faction, def: BuildingDef): boolean {
  return speciesOk(def, f) && !replacedFor(f, def.id, BUILDING_LIST) && hasTech(f, def.tech);
}

export function unitCost(s: GameState, f: Faction, def: UnitDef): number {
  let mult = 1 + sumMod(f, 'unitCostMult');
  if (!f.isHuman) mult *= difficulty(s).aiCostMult;
  return Math.max(1, Math.round(def.cost * mult));
}

export function buildingCost(s: GameState, f: Faction, def: BuildingDef): number {
  let mult = 1 + sumMod(f, 'buildingCostMult');
  if (!f.isHuman) mult *= difficulty(s).aiCostMult;
  return Math.max(1, Math.round(def.cost * mult));
}

export function itemCost(s: GameState, f: Faction, item: BuildItem): number {
  if (item.kind === 'unit') return unitCost(s, f, UNITS[item.id]);
  if (item.kind === 'building') return buildingCost(s, f, BUILDINGS[item.id]);
  const mult = f.isHuman ? 1 : difficulty(s).aiCostMult;
  return Math.round(PROJECTS[item.id].cost * mult);
}

export function itemName(item: BuildItem): string {
  if (item.kind === 'unit') return UNITS[item.id].name;
  if (item.kind === 'building') return BUILDINGS[item.id].name;
  return PROJECTS[item.id].name;
}

// Credits for each point of production that an item still needs.
export const PURCHASE_FACTOR = 4;

export function purchaseCost(s: GameState, f: Faction, p: Planet, item: BuildItem): number {
  const left = Math.max(0, itemCost(s, f, item) - (sameItem(p.queue[0], item) ? p.prodStore : 0));
  const mult = Math.max(0.3, 1 + sumMod(f, 'purchaseCostMult'));
  return Math.ceil(left * PURCHASE_FACTOR * mult);
}

export function sameItem(a: BuildItem | undefined, b: BuildItem | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

export function unitMove(f: Faction, def: UnitDef): number {
  return def.move + (f.isPirate ? 0 : driveLevel(f));
}

export function unitSight(f: Faction, def: UnitDef): number {
  return def.sight + sumMod(f, 'sight');
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

const NO_RELATION: Readonly<PairState> = Object.freeze({ atWar: false, openBorders: false, lastChange: 0 });

// The state between two factions, for reading. It does not change the game state.
export function relation(s: GameState, a: number, b: number): Readonly<PairState> {
  return s.pairs[pairKey(a, b)] ?? NO_RELATION;
}

// The state between two factions, for a change. It creates the entry when none exists.
export function pair(s: GameState, a: number, b: number): PairState {
  const k = pairKey(a, b);
  let p = s.pairs[k];
  if (!p) {
    p = { atWar: false, openBorders: false, lastChange: 0 };
    s.pairs[k] = p;
  }
  return p;
}

export function atWar(s: GameState, a: number, b: number): boolean {
  if (a === b || a < 0 || b < 0) return false;
  if (s.factions[a].isPirate || s.factions[b].isPirate) return true;
  return relation(s, a, b).atWar;
}

export function hasMet(s: GameState, a: number, b: number): boolean {
  return s.factions[a].met.includes(b);
}

export function pirateFaction(s: GameState): number {
  return s.factions.length - 1;
}

export function realFactions(s: GameState): Faction[] {
  return s.factions.filter((f) => !f.isPirate);
}

export function log(s: GameState, faction: number, text: string, hex?: number, tone: 'good' | 'bad' | 'info' = 'info') {
  s.log.push({ turn: s.turn, faction, text, hex, tone });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

// Where a hex is, in words: "at Maaz II", "near Maaz II" or "in deep space".
export function placeName(s: GameState, hex: number): string {
  let best: Planet | undefined;
  let bestD = Infinity;
  for (const p of s.planets) {
    const d = distance(s, p.hex, hex);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  if (!best || bestD > 8) return 'in deep space';
  return bestD === 0 ? `at ${best.name}` : `near ${best.name}`;
}

export function unitAt(s: GameState, hex: number, cls?: 'military' | 'civilian') {
  return s.units.find((u) => u.hex === hex && (!cls || UNITS[u.type].cls === cls));
}

export function unitsAt(s: GameState, hex: number) {
  return s.units.filter((u) => u.hex === hex);
}

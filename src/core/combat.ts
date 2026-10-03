import { BUILDINGS, BUILDING_LIST } from './data/buildings';
import { TERRAIN } from './data/terrain';
import { UNITS } from './data/units';
import { garrisonStrength, morale, moraleEffects, planetMaxHp, planetStrength } from './economy';
import { emit } from './events';
import { distance } from './hex';
import { canEnter, findPath, moveToward, occupancy, removeUnit, step } from './movement';
import { assignWorkers } from './planet';
import { nextFloat, pick } from './rng';
import { addScience, forget, learn, losableTechs } from './research';
import { SPECIES } from './data/species';
import { TECHS } from './data/techs';
import { atWar, canResearch, hexFaction, log, ownedPlanets, placeName, realFactions, sumMod, unitCost } from './rules';
import type { Faction, GameState, Planet, Unit } from './types';
import { checkConquest } from './victory';
import { updateExplored } from './visibility';

export type TargetKind = 'planet' | 'unit' | 'civilian';

export interface Target {
  kind: TargetKind;
  planet?: Planet;
  unit?: Unit;
}

export function targetAt(s: GameState, attacker: Unit, hex: number): Target | null {
  const h = s.hexes[hex];
  if (h.planetId !== undefined) {
    const p = s.planets[h.planetId];
    if (p.owner >= 0 && p.owner !== attacker.owner && atWar(s, attacker.owner, p.owner)) return { kind: 'planet', planet: p };
    return null;
  }
  const occ = occupancy(s);
  const m = occ.military.get(hex);
  if (m && m.owner !== attacker.owner && atWar(s, attacker.owner, m.owner)) return { kind: 'unit', unit: m };
  const c = occ.civilian.get(hex);
  if (c && c.owner !== attacker.owner && atWar(s, attacker.owner, c.owner)) return { kind: 'civilian', unit: c };
  return null;
}

function hpFactor(hp: number): number {
  return 0.5 + 0.5 * (hp / 100);
}

function factionCombatMult(s: GameState, owner: number): number {
  const f = s.factions[owner];
  if (f.isPirate) return 1;
  return (1 + sumMod(f, 'strengthMult')) * moraleEffects(morale(s, f).level).combat;
}

// "from" is the hex that the unit attacks from. The default is the hex of the unit.
export function attackStrength(s: GameState, u: Unit, target: Target, from = u.hex): number {
  const def = UNITS[u.type];
  const f = s.factions[u.owner];
  let str = def.ranged ?? def.strength;
  let mult = factionCombatMult(s, u.owner);
  if (def.ranged && !f.isPirate) mult += sumMod(f, 'rangedStrengthMult');
  if (target.kind === 'planet' && def.vsPlanet) mult += def.vsPlanet;
  if (hexFaction(s, from) === u.owner) mult += (def.homeBonus ?? 0) + (f.isPirate ? 0 : sumMod(f, 'homeStrengthMult'));
  str *= mult * hpFactor(u.hp);
  return str;
}

// "at" is the hex where the unit defends. The default is the hex of the unit.
export function defenceStrength(s: GameState, u: Unit, at = u.hex): number {
  const def = UNITS[u.type];
  let mult = factionCombatMult(s, u.owner);
  mult += TERRAIN[s.hexes[at].terrain].defence;
  if (u.order?.kind === 'fortify') mult += 0.25;
  if (def.defenceBonus) mult += def.defenceBonus;
  const f = s.factions[u.owner];
  if (hexFaction(s, at) === u.owner) mult += (def.homeBonus ?? 0) + (f.isPirate ? 0 : sumMod(f, 'homeStrengthMult'));
  return Math.max(1, def.strength) * mult * hpFactor(u.hp);
}

function damage(a: number, d: number, roll: number): number {
  return Math.max(1, Math.round(30 * Math.exp(0.04 * (a - d)) * roll));
}

export interface AttackPreview {
  target: Target;
  ranged: boolean;
  attack: number;
  defence: number;
  toDefender: number; // expected damage
  toAttacker: number;
}

// Can the unit attack the hex from the hex "from"? The AI gives a hex that the unit can reach, to plan an attack.
export function canAttack(s: GameState, u: Unit, hex: number, from = u.hex): boolean {
  const def = UNITS[u.type];
  if (def.cls !== 'military' || u.attacked || u.moves <= 0) return false;
  const t = targetAt(s, u, hex);
  if (!t) return false;
  const d = distance(s, from, hex);
  if (def.ranged) return d >= 1 && d <= (def.range ?? 1);
  if (d !== 1) return false;
  if (t.kind === 'planet' && t.planet!.hp <= 0) return false;
  return s.hexes[hex].terrain !== 'rift' || canEnter(s, s.factions[u.owner], hex);
}

// A command on an enemy that is out of reach: the unit moves next to it along the shortest path and attacks with the
// moves that remain. Returns null when the unit is not a warship, the hex holds no enemy, or no path leads next to it.
export function engage(s: GameState, u: Unit, hex: number): { path: number[]; result: AttackResult | null } | null {
  if (UNITS[u.type].cls !== 'military' || !targetAt(s, u, hex)) return null;
  const path = findPath(s, u, hex, true);
  if (!path) return null;
  moveToward(s, u, hex, true);
  return { path, result: canAttack(s, u, hex) ? attack(s, u, hex) : null };
}

export function preview(s: GameState, u: Unit, hex: number, from = u.hex): AttackPreview | null {
  const target = targetAt(s, u, hex);
  if (!target) return null;
  const ranged = !!UNITS[u.type].ranged;
  const attack = attackStrength(s, u, target, from);
  const defence = target.kind === 'planet' ? planetStrength(s, target.planet!) : defenceStrength(s, target.unit!);
  const retaliation =
    target.kind === 'planet' ? planetStrength(s, target.planet!) : target.kind === 'unit' ? defenceStrength(s, target.unit!) : 0;
  return {
    target,
    ranged,
    attack,
    defence,
    toDefender: damage(attack, defence, 1),
    toAttacker: ranged || target.kind === 'civilian' ? 0 : damage(retaliation, defenceStrength(s, u, from), 1),
  };
}

function roll(s: GameState): number {
  return 0.8 + nextFloat(s) * 0.4;
}

function bounty(s: GameState, killer: Unit, victim: Unit) {
  const f = s.factions[killer.owner];
  if (f.isPirate) return;
  const share = (UNITS[killer.type].bounty ?? 0) + sumMod(f, 'killBounty');
  if (share <= 0) return;
  const n = Math.round(UNITS[victim.type].cost * share);
  f.credits += n;
  log(s, f.id, `Bounty: +${n} credits for the ${UNITS[victim.type].name}.`, victim.hex, 'good');
}

// Some species learn from the wrecks of their enemies.
function salvageScience(s: GameState, killer: Unit, victim: Unit) {
  const f = s.factions[killer.owner];
  if (f.isPirate) return;
  const share = sumMod(f, 'killScience');
  if (share <= 0) return;
  const n = Math.round(UNITS[victim.type].cost * share);
  addScience(s, f, n);
  log(s, f.id, `Salvage: +${n} science from the ${UNITS[victim.type].name}.`, victim.hex, 'good');
}

function kill(s: GameState, killer: Unit, victim: Unit) {
  removeUnit(s, victim);
  emit(s, { kind: 'unitDestroyed', unit: victim.id, owner: victim.owner, type: victim.type, hex: victim.hex, by: killer.owner });
  bounty(s, killer, victim);
  salvageScience(s, killer, victim);
  const kf = s.factions[killer.owner];
  const vf = s.factions[victim.owner];
  log(s, victim.owner, `Your ${UNITS[victim.type].name} was destroyed by a ${kf.isPirate ? '' : kf.name + ' '}${UNITS[killer.type].name} ${placeName(s, victim.hex)}.`, victim.hex, 'bad');
  if (UNITS[victim.type].voidborn && !kf.isPirate) {
    const n = 15 + Math.round(UNITS[victim.type].cost / 6);
    addScience(s, kf, n);
    log(s, killer.owner, `Your ${UNITS[killer.type].name} destroyed a ${UNITS[victim.type].name}. The wreck is not there. Sensors insist it never was. +${n} science.`, victim.hex, 'good');
    return;
  }
  log(s, killer.owner, `Your ${UNITS[killer.type].name} destroyed a ${vf.isPirate ? '' : vf.name + ' '}${UNITS[victim.type].name}.`, victim.hex, 'good');
}

export interface AttackResult {
  toDefender: number;
  toAttacker: number;
  defenderDied: boolean;
  attackerDied: boolean;
  hex: number;
}

export function attack(s: GameState, u: Unit, hex: number): AttackResult | null {
  if (!canAttack(s, u, hex)) return null;
  const p = preview(s, u, hex)!;
  const t = p.target;
  const res: AttackResult = { toDefender: 0, toAttacker: 0, defenderDied: false, attackerDied: false, hex };
  u.attacked = true;
  u.moves = 0;
  if (u.order) u.order = undefined;

  if (t.kind === 'civilian') {
    const victim = t.unit!;
    if (p.ranged) {
      res.toDefender = damage(p.attack, p.defence, roll(s));
      victim.hp -= res.toDefender;
      emit(s, { kind: 'unitDamaged', unit: victim.id, owner: victim.owner, hex: victim.hex, amount: res.toDefender });
      if (victim.hp <= 0) {
        res.defenderDied = true;
        kill(s, u, victim);
      }
    } else {
      res.toDefender = victim.hp;
      res.defenderDied = true;
      kill(s, u, victim);
      u.moves = 1;
      step(s, u, hex);
      u.moves = 0;
    }
    return res;
  }

  res.toDefender = damage(p.attack, p.defence, roll(s));
  if (!p.ranged) {
    const back = t.kind === 'planet' ? planetStrength(s, t.planet!) : defenceStrength(s, t.unit!);
    res.toAttacker = damage(back, defenceStrength(s, u), roll(s));
  }

  if (t.kind === 'planet') {
    const planet = t.planet!;
    const wasUp = planet.hp > 0;
    planet.hp = Math.max(0, planet.hp - res.toDefender);
    u.hp -= res.toAttacker;
    emit(s, { kind: 'planetDamaged', planet: planet.id, owner: planet.owner, amount: res.toDefender });
    if (res.toAttacker) emit(s, { kind: 'unitDamaged', unit: u.id, owner: u.owner, hex: u.hex, amount: res.toAttacker });
    // The fall of the defences is one entry. Attacks on a planet that is already down are not news.
    if (planet.hp <= 0 && wasUp) {
      log(s, planet.owner, `The defences of ${planet.name} are down. Ground troops can invade it.`, planet.hex, 'bad');
      log(s, u.owner, `The defences of ${planet.name} are down. Send ground troops.`, planet.hex, 'good');
    } else if (planet.hp > 0) {
      log(s, planet.owner, `${planet.name} is under attack.`, planet.hex, 'bad');
    }
    if (u.hp <= 0) {
      res.attackerDied = true;
      removeUnit(s, u);
      emit(s, { kind: 'unitDestroyed', unit: u.id, owner: u.owner, type: u.type, hex: u.hex, by: planet.owner });
      log(s, u.owner, `Your ${UNITS[u.type].name} was destroyed at ${planet.name}.`, hex, 'bad');
    }
    return res;
  }

  const victim = t.unit!;
  victim.hp -= res.toDefender;
  u.hp -= res.toAttacker;
  emit(s, { kind: 'unitDamaged', unit: victim.id, owner: victim.owner, hex: victim.hex, amount: res.toDefender });
  if (res.toAttacker) emit(s, { kind: 'unitDamaged', unit: u.id, owner: u.owner, hex: u.hex, amount: res.toAttacker });
  if (victim.hp <= 0 && u.hp <= 0) u.hp = 1; // the attacker survives a double kill
  if (victim.hp > 0 && u.hp > 0) {
    // Both sides survive: both owners get a report. The entry points at the attacker.
    const af = s.factions[u.owner];
    const vf = s.factions[victim.owner];
    const who = (f: Faction, unit: Unit) => `${f.isPirate ? '' : f.name + ' '}${UNITS[unit.type].name}`;
    log(s, victim.owner, `Your ${UNITS[victim.type].name} was attacked by a ${who(af, u)} and lost ${res.toDefender} hit points, ${Math.round(victim.hp)} left.${res.toAttacker ? ` The attacker lost ${res.toAttacker} hit points.` : ''}`, u.hex, 'bad');
    log(s, u.owner, `Your ${UNITS[u.type].name} attacked a ${who(vf, victim)}. The enemy lost ${res.toDefender} hit points, ${Math.round(victim.hp)} left.${res.toAttacker ? ` Your unit lost ${res.toAttacker} hit points.` : ''}`, victim.hex, 'info');
  }
  if (victim.hp <= 0) {
    res.defenderDied = true;
    kill(s, u, victim);
    if (!p.ranged) {
      // The winner moves into the hex and destroys a civilian unit there.
      const civ = occupancy(s).civilian.get(hex);
      if (civ && civ.owner !== u.owner) kill(s, u, civ);
      u.moves = 1;
      step(s, u, hex);
      u.moves = 0;
    }
  } else if (u.hp <= 0) {
    res.attackerDied = true;
    kill(s, victim, u);
  }
  return res;
}

// Ground invasion

export function canInvade(s: GameState, u: Unit, hex: number): boolean {
  const def = UNITS[u.type];
  const h = s.hexes[hex];
  if (!def.ground || u.moves <= 0 || h.planetId === undefined || distance(s, u.hex, hex) !== 1) return false;
  const p = s.planets[h.planetId];
  if (p.owner < 0 || p.owner === u.owner || !atWar(s, u.owner, p.owner)) return false;
  // The defences must be down. Infiltrators go through defences that are up.
  return p.hp <= 0 || sumMod(s.factions[u.owner], 'infiltrate') > 0;
}

export function groundStrength(s: GameState, u: Unit): number {
  const f = s.factions[u.owner];
  return (UNITS[u.type].ground ?? 0) * (1 + sumMod(f, 'groundMult')) * factionCombatMult(s, u.owner);
}

// The strength of the troops against this planet. Troops that go through defences that are up fight at a share of
// their strength.
export function invasionStrength(s: GameState, u: Unit, p: Planet): number {
  const base = groundStrength(s, u);
  return p.hp > 0 ? base * sumMod(s.factions[u.owner], 'infiltrate') : base;
}

export interface InvasionResult {
  won: boolean;
  planet: Planet;
}

export function invade(s: GameState, u: Unit, hex: number): InvasionResult | null {
  if (!canInvade(s, u, hex)) return null;
  const p = s.planets[s.hexes[hex].planetId!];
  const a = invasionStrength(s, u, p);
  const d = garrisonStrength(s, p);
  let troops = u.hp;
  let garrison = p.garrisonHp;
  while (troops > 0 && garrison > 0) {
    garrison -= damage(a * hpFactor(troops), d * hpFactor(garrison), roll(s));
    troops -= damage(d * hpFactor(Math.max(1, garrison)), a * hpFactor(troops), roll(s));
  }
  const attackerName = s.factions[u.owner].name;
  removeUnit(s, u);
  if (garrison > 0 || troops <= 0) emit(s, { kind: 'unitDestroyed', unit: u.id, owner: u.owner, type: u.type, hex: u.hex, by: p.owner });
  if (garrison <= 0 && troops > 0) {
    capture(s, p, u.owner);
    return { won: true, planet: p };
  }
  p.garrisonHp = Math.max(1, Math.round(garrison));
  log(s, u.owner, `The invasion of ${p.name} failed. The garrison has ${p.garrisonHp}% strength left.`, hex, 'bad');
  log(s, p.owner, `${p.name} defeated ground troops of the ${attackerName}.`, hex, 'good');
  return { won: false, planet: p };
}

export function capture(s: GameState, p: Planet, newOwner: number) {
  const old = p.owner;
  const nf = s.factions[newOwner];
  const of = s.factions[old];
  for (const u of s.units.filter((x) => x.hex === p.hex && x.owner !== newOwner)) {
    removeUnit(s, u);
    emit(s, { kind: 'unitDestroyed', unit: u.id, owner: u.owner, type: u.type, hex: u.hex, by: newOwner });
  }
  p.owner = newOwner;
  emit(s, { kind: 'planetCaptured', planet: p.id, from: old, by: newOwner });
  p.pop = Math.max(1, Math.floor(p.pop * 0.85));
  p.queue = [];
  p.prodStore = 0;
  p.routes = [];
  p.locked = [];
  p.buildings = p.buildings
    .filter((id) => BUILDINGS[id].category !== 'military')
    .map((id) => {
      const base = BUILDINGS[id].replaces ?? id;
      return BUILDING_LIST.find((b) => b.replaces === base && b.species === nf.species)?.id ?? base;
    });
  p.hp = Math.round(planetMaxHp(s, p) * 0.25);
  p.garrisonHp = 50;
  assignWorkers(s, p);
  if (!nf.isPirate && !of.isPirate) takeKnowledge(s, p, nf, of);
  const loot = 30 + 10 * p.pop;
  nf.credits += loot;
  log(s, newOwner, `You captured ${p.name} from the ${of.name}. Plunder: +${loot} credits.`, p.hex, 'good');
  log(s, old, `The ${nf.name} captured ${p.name}.`, p.hex, 'bad');
  for (const f of realFactions(s)) {
    if (f.id === newOwner || f.id === old || !f.alive) continue;
    s.attitude[f.id][newOwner] = Math.max(-100, s.attitude[f.id][newOwner] - 6);
    if (f.met.includes(newOwner)) log(s, f.id, `The ${nf.name} captured ${p.name} from the ${of.name}.`, p.hex, 'info');
  }
  s.attitude[old][newOwner] = Math.max(-100, s.attitude[old][newOwner] - 25);
  if (!ownedPlanets(s, old).length) eliminate(s, old, newOwner);
  if (!nf.isPirate) updateExplored(s, newOwner);
  checkConquest(s);
}

export const CAPTURE_TECHS = 1;

// The knowledge of a planet goes with it. The new owner learns technologies of the old owner. A home planet also
// gives one species technology of the old owner, with its units and buildings. The old owner loses one technology.
function takeKnowledge(s: GameState, p: Planet, nf: Faction, of: Faction) {
  const count = CAPTURE_TECHS + sumMod(nf, 'captureTech');
  for (let k = 0; k < count; k++) {
    const options = of.techs.filter((id) => canResearch(nf, id));
    if (!options.length) break;
    const id = pick(s, options);
    learn(s, nf, id);
    log(s, nf.id, `Your engineers took ${TECHS[id].name} from the archives of ${p.name}.`, p.hex, 'good');
  }
  if (p.homeOf === of.id) {
    const own = of.techs.filter((id) => TECHS[id].species === of.species && !nf.techs.includes(id));
    if (own.length) {
      const id = pick(s, own);
      learn(s, nf, id);
      log(s, nf.id, `At the capture of the ${SPECIES[of.species].adjective} home planet ${p.name}, you gained knowledge of ${TECHS[id].name}.`, p.hex, 'good');
    }
  }
  const losable = losableTechs(of);
  if (losable.length) {
    const id = pick(s, losable);
    forget(s, of, id);
    log(s, of.id, `With ${p.name} you lost the knowledge and the infrastructure for ${TECHS[id].name}. You must research it again.`, p.hex, 'bad');
  }
}

export function eliminate(s: GameState, f: number, by: number) {
  const fac = s.factions[f];
  fac.alive = false;
  emit(s, { kind: 'factionEliminated', faction: f, by });
  s.units = s.units.filter((u) => u.owner !== f);
  if (s.forum) {
    s.forum.members = s.forum.members.filter((m) => m !== f);
    if (s.forum.leader === f) s.forum.leader = -1;
  }
  log(s, -1, `The ${fac.name} is no more. The ${s.factions[by].name} took its last planet.`, undefined, 'info');
}

export function unitValue(s: GameState, u: Unit): number {
  const def = UNITS[u.type];
  return Math.max(def.strength, def.ranged ?? 0) * hpFactor(u.hp);
}

export function unitBuildValue(s: GameState, u: Unit): number {
  return unitCost(s, s.factions[u.owner], UNITS[u.type]);
}

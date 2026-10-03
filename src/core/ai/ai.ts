import { BUILDINGS, PROJECTS } from '../data/buildings';
import { SPECIES, type AiWeights } from '../data/species';
import { TECHS } from '../data/techs';
import { TERRAIN, YIELD_KEYS } from '../data/terrain';
import { UNITS, UNIT_LIST, type UnitDef } from '../data/units';
import { debug, debugOn, hexLabel, itemLabel, planetLabel, playerLabel, unitLabel, factionLabel, type DebugLevel } from '../debug';
import { attack, canAttack, canInvade, invade, invasionStrength, preview } from '../combat';
import {
  aiAcceptsOpenBorders,
  aiAcceptsPeace,
  canDeclareWar,
  declareWar,
  makePeace,
  militaryStrength,
  canSendEnvoys,
  sendEnvoys,
  setOpenBorders,
} from '../diplomacy';
import {
  addRoute,
  capital,
  empireIncome,
  garrisonStrength,
  hexYield,
  morale,
  planetStrength,
  planetYields,
  popCap,
  routeValid,
  routeYield,
  setBudget,
  tradeSlots,
} from '../economy';
import { acceptsInvitation, invite, INVITE_COST, lobby, lobbyCost, support, voteOf } from '../forum';
import { distance, neighbors, within } from '../hex';
import {
  buildStation,
  canBuildStation,
  canColonizeHere,
  canEnter,
  canStop,
  colonize,
  findPath,
  moveToward,
  occupancy,
  reachable,
  upgrade,
  upgradeCost,
  upgradeTarget,
} from '../movement';
import { buildOptions, canSettle, enqueue, purchase, type BuildOption } from '../planet';
import { researchOptions, researchPath, setResearch } from '../research';
import { nextFloat } from '../rng';
import {
  atWar,
  canStation,
  hexFaction,
  log,
  ownedPlanets,
  pair,
  purchaseCost,
  realFactions,
  relation,
  resourceVisible,
  sumMod,
  techAvailable,
  unitAllowed,
  unitSight,
} from '../rules';
import type { BuildItem, Faction, GameState, Planet, PlanetTypeId, TechCategory, Unit } from '../types';
import { computeVisible } from '../visibility';

interface Ctx {
  s: GameState;
  f: Faction;
  ai: AiWeights;
  planets: Planet[];
  vis: Uint8Array;
  enemies: number[]; // real factions at war with this faction
  morale: number;
  claimed: Set<number>; // hexes or planets that a unit already has as its target
  prey: Planet | null; // in peace: the home planet where an infiltrator places its troops before it declares war
}

const TYPE_VALUE: Record<PlanetTypeId, number> = {
  terran: 10,
  ocean: 9,
  desert: 6,
  ice: 6,
  volcanic: 6,
  barren: 4,
  gas: 6,
};

// A line of the debug log from this AI faction.
function say(c: Ctx, l: Exclude<DebugLevel, 'off'>, text: () => string) {
  if (debugOn(l)) debug(c.s, l, playerLabel(c.f), text);
}

function myUnits(c: Ctx): Unit[] {
  return c.s.units.filter((u) => u.owner === c.f.id);
}

function isWarship(u: Unit): boolean {
  const def = UNITS[u.type];
  return def.cls === 'military' && def.strength >= 10;
}

function isScout(u: Unit): boolean {
  const def = UNITS[u.type];
  return def.cls === 'military' && def.strength < 10;
}

// Research

function categoryWeight(ai: AiWeights, cat: TechCategory): number {
  switch (cat) {
    case 'military':
      return ai.military;
    case 'economy':
      return ai.commerce;
    case 'science':
      return ai.science;
    case 'society':
      return ai.diplomacy;
    case 'colonization':
      return ai.expansion;
    case 'propulsion':
      return 1.15;
  }
}

function chooseResearch(c: Ctx) {
  const { s, f, ai } = c;
  if (f.researching || f.researchQueue.length) return;
  const options = researchOptions(f);
  if (!options.length) return;
  const goals: string[] = [];
  if (ai.science >= 1.5 || f.techs.length >= 16) goals.push('gate_theory');
  if (ai.diplomacy >= 1.2 && !s.forum) goals.push('interstellar_forum');
  if (c.enemies.length || ai.military >= 1.5 || infiltrator(f)) goals.push('ground_forces');
  const onPath = new Set<string>();
  for (const g of goals) if (techAvailable(f, g)) for (const id of researchPath(f, g)) onPath.add(id);
  let best = options[0];
  let bestScore = -1;
  for (const id of options) {
    const def = TECHS[id];
    let w = categoryWeight(ai, def.category);
    if (def.species) w *= 1.4;
    if (c.enemies.length && def.category === 'military') w *= 1.6;
    if (onPath.has(id)) w *= 1.6;
    if (id === 'orbital_mining' || id === 'hydroponics') w *= 1.3;
    const colonizes = def.effects.find((m) => m.kind === 'colonize');
    if (colonizes && colonizes.kind === 'colonize') {
      const types = colonizes.types;
      if (s.planets.some((p) => p.owner < 0 && f.explored[p.hex] && types.includes(p.type))) w *= 1.5;
    }
    const score = (w * 100 * (0.8 + nextFloat(s) * 0.4)) / def.cost;
    say(c, 'trace', () => `research option ${id}: value ${score.toFixed(2)}`);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  say(c, 'major', () => `Evaluated ${options.length} research options - ${best} has the highest value (${bestScore.toFixed(2)})${goals.length ? `, goals: ${goals.join(', ')}` : ''}`);
  setResearch(s, f, best);
}

// Planets

function threatNear(c: Ctx, hex: number, radius: number): number {
  let total = 0;
  for (const u of c.s.units) {
    if (u.owner === c.f.id || !atWar(c.s, c.f.id, u.owner) || c.vis[u.hex] !== 2) continue;
    if (UNITS[u.type].cls !== 'military') continue;
    if (distance(c.s, u.hex, hex) <= radius) total += Math.max(UNITS[u.type].strength, UNITS[u.type].ranged ?? 0);
  }
  return total;
}

function settleTargets(c: Ctx): Planet[] {
  const { s, f } = c;
  return s.planets.filter((p) => {
    if (!canSettle(s, f, p) || !f.explored[p.hex]) return false;
    const owner = hexFaction(s, p.hex);
    return owner < 0 || owner === f.id;
  });
}

function improvable(c: Ctx): number[] {
  const { s, f } = c;
  const out: number[] = [];
  for (const p of c.planets) {
    for (const i of within(s, p.hex, 3)) {
      const h = s.hexes[i];
      if (h.owner !== p.id || h.station || !TERRAIN[h.terrain].stationName || !canStation(f, h.terrain)) continue;
      out.push(i);
    }
  }
  return out;
}

function buildingScore(c: Ctx, p: Planet, id: string, cost: number): number {
  const { ai, f } = c;
  const def = BUILDINGS[id];
  const y = planetYields(c.s, p).yields;
  const w = { food: 1.2, prod: 1.3, sci: 1.1 * ai.science, cred: 0.9 * ai.commerce, inf: 0.8 * ai.diplomacy };
  let v = 0;
  for (const k of YIELD_KEYS) {
    if (def.flat?.[k]) v += def.flat[k]! * w[k];
    if (def.mult?.[k]) v += def.mult[k]! * y[k] * w[k];
  }
  const threat = threatNear(c, p.hex, 5) > 0 || c.enemies.length > 0;
  for (const m of def.mods ?? []) {
    if (m.kind === 'morale') v += m.value * (c.morale < 2 ? 3 : c.morale < 6 ? 1.2 : 0.4);
    else if (m.kind === 'tradeSlots') v += m.value * 4 * ai.commerce;
    else if (m.kind === 'popCap') v += p.pop >= popCap(c.s, p) - 1 ? m.value * 2 : m.value * 0.2;
    else if (m.kind === 'planetHp') v += (m.value / 25) * (threat ? 1.5 : 0.4);
    else if (m.kind === 'planetStrengthMult') v += m.value * (threat ? 8 : 2);
    else if (m.kind === 'garrison') v += (m.value / 4) * (threat ? 1.5 : 0.3);
    else if (m.kind === 'unitProdMult') v += m.value * y.prod * ai.military;
  }
  if (f.lastIncome.cred < 2) v -= def.upkeep * 0.8;
  if (f.lastIncome.cred < 0 && def.category === 'cred') v *= 1.5;
  return (v / cost) * 100;
}

function bestWarship(c: Ctx, p: Planet, options: BuildOption[]): BuildOption | null {
  const prod = Math.max(1, planetYields(c.s, p).yields.prod);
  let best: BuildOption | null = null;
  let bestScore = -1;
  const wantRanged = nextFloat(c.s) < 0.3;
  for (const o of options) {
    if (o.item.kind !== 'unit' || !o.ok) continue;
    const def = UNITS[o.item.id];
    if (def.cls !== 'military' || def.strength < 10) continue;
    let score = Math.max(def.strength, (def.ranged ?? 0) * 1.1);
    if (wantRanged && def.ranged) score *= 1.4;
    if (o.cost / prod > 14) score *= 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

interface Counts {
  scouts: number;
  colony: number;
  constructors: number;
  warships: number;
  transports: number;
}

function countUnits(c: Ctx): Counts {
  const n: Counts = { scouts: 0, colony: 0, constructors: 0, warships: 0, transports: 0 };
  const add = (def: UnitDef) => {
    if (def.canColonize) n.colony++;
    else if (def.canBuild) n.constructors++;
    else if (def.ground) n.transports++;
    else if (def.strength < 10) n.scouts++;
    else n.warships++;
  };
  for (const u of myUnits(c)) add(UNITS[u.type]);
  for (const p of c.planets) for (const q of p.queue) if (q.kind === 'unit') add(UNITS[q.id]);
  return n;
}

function desiredWarships(c: Ctx): number {
  const base = (1.5 + c.planets.length) * c.ai.military * (c.enemies.length ? 1.6 : 1);
  return Math.ceil(base * (c.s.turn < 20 ? 0.6 : 1));
}

function chooseBuild(c: Ctx, p: Planet, counts: Counts): BuildItem | null {
  const { s, f, ai } = c;
  const options = buildOptions(s, p).filter((o) => o.ok);
  const find = (pred: (d: UnitDef) => boolean) => options.find((o) => o.item.kind === 'unit' && pred(UNITS[o.item.id]));
  const scored: { item: BuildItem; score: number }[] = [];
  const prod = planetYields(s, p).yields.prod;
  const best = c.planets.every((o) => planetYields(s, o).yields.prod <= prod + 0.01);

  for (const o of options) {
    if (o.item.kind === 'building') scored.push({ item: o.item, score: buildingScore(c, p, o.item.id, o.cost) });
    if (o.item.kind === 'project') {
      if (o.item.id === 'exodus_gate' && best) scored.push({ item: o.item, score: 40 });
      if (o.item.id === 'forum_station' && best) scored.push({ item: o.item, score: 11 * ai.diplomacy });
      if (o.item.id === 'terraform' && p.pop >= popCap(s, p) - 1) scored.push({ item: o.item, score: 4 });
    }
  }

  const desired = desiredWarships(c);
  const warship = bestWarship(c, p, options);
  if (warship && counts.warships < desired) {
    let score = 4 + (10 * (desired - counts.warships)) / desired;
    if (threatNear(c, p.hex, 4) > 0) score += 8;
    if (prod < 3) score *= 0.5;
    scored.push({ item: warship.item, score });
  }

  const colony = find((d) => !!d.canColonize);
  if (colony && c.morale >= 0) {
    const targets = settleTargets(c).filter((t) => distance(s, t.hex, p.hex) <= 16);
    const max = ai.expansion > 1.2 ? 2 : 1;
    if (targets.length > counts.colony && counts.colony < max && p.pop >= 3) {
      const few = c.planets.length < 4 ? 5 : 0;
      scored.push({ item: colony.item, score: Math.max(3, 10 * ai.expansion + few - c.planets.length * 0.6) });
    }
  }

  const constructor = find((d) => !!d.canBuild);
  if (constructor && counts.constructors < Math.ceil(c.planets.length * 0.7) && improvable(c).length > counts.constructors * 2) {
    scored.push({ item: constructor.item, score: 9 });
  }

  const scout = find((d) => d.cls === 'military' && d.strength < 10);
  if (scout && s.turn < 50 && counts.scouts < 2) {
    const explored = f.explored.reduce((a, b) => a + b, 0) / f.explored.length;
    if (explored < 0.6) scored.push({ item: scout.item, score: counts.scouts ? 4 : 7 });
  }

  const transport = find((d) => !!d.ground);
  // An infiltrator at peace builds the troops that it places at its prey.
  const troopsWanted = c.enemies.length ? (counts.warships >= 2 ? Math.max(1, Math.floor(counts.warships / 2)) : 0) : c.prey ? INFILTRATION_TROOPS : 0;
  if (transport && counts.transports < troopsWanted) {
    scored.push({ item: transport.item, score: 11 });
  }

  if (!scored.length) return warship?.item ?? null;
  scored.sort((a, b) => b.score - a.score);
  say(c, 'trace', () => `production options for ${p.name}: ${scored.map((x) => `${itemLabel(x.item)} ${x.score.toFixed(1)}`).join(', ')}`);
  return scored[0].score > 0.5 ? scored[0].item : null;
}

function bump(counts: Counts, item: BuildItem) {
  if (item.kind !== 'unit') return;
  const def = UNITS[item.id];
  if (def.canColonize) counts.colony++;
  else if (def.canBuild) counts.constructors++;
  else if (def.ground) counts.transports++;
  else if (def.strength < 10) counts.scouts++;
  else counts.warships++;
}

// The AI puts spare credits into research or welfare.
function manageBudget(c: Ctx) {
  const { s, f, ai } = c;
  const inc = empireIncome(s, f);
  setBudget(f, 'research', 0);
  setBudget(f, 'welfare', 0);
  if (inc.surplus >= 6) {
    if (c.morale < 0) setBudget(f, 'welfare', 40);
    if (f.credits > 150 + 20 * c.planets.length) setBudget(f, 'research', ai.science >= 1.4 || ai.commerce >= 1.5 ? 50 : 30);
  }
  say(c, 'minor', () => `budget: research ${f.budget.research}%, welfare ${f.budget.welfare}% (surplus ${inc.surplus.toFixed(1)}, credits ${Math.round(f.credits)}, morale ${c.morale})`);
}

function managePlanets(c: Ctx) {
  const { s, f, ai } = c;
  manageBudget(c);
  const counts = countUnits(c);
  for (const p of c.planets) {
    if (!p.queue.length) {
      const item = chooseBuild(c, p, counts);
      if (item && enqueue(s, p, item)) {
        bump(counts, item);
        say(c, 'major', () => `${planetLabel(s, p)} starts production of ${itemLabel(item)}`);
      } else say(c, 'minor', () => `${planetLabel(s, p)} has no item to produce`);
    }
    // Trade routes
    const slots = tradeSlots(s, p);
    while (p.routes.length < slots) {
      let best: Planet | null = null;
      let bestValue = 0;
      for (const to of s.planets) {
        if (p.routes.includes(to.id) || !routeValid(s, p, to)) continue;
        const r = routeYield(s, p, to);
        const value = r.cred * ai.commerce + r.inf * ai.diplomacy * 1.5;
        if (value > bestValue) {
          bestValue = value;
          best = to;
        }
      }
      if (!best || !addRoute(s, p, best.id)) break;
      const to = best;
      say(c, 'minor', () => `${planetLabel(s, p)} starts a trade route to ${planetLabel(s, to)} (value ${bestValue.toFixed(1)})`);
    }
  }

  // Purchases
  const reserve = (80 + 20 * c.planets.length) * (ai.commerce >= 1.5 ? 0.6 : 1);
  const order = [...c.planets].sort((a, b) => threatNear(c, b.hex, 4) - threatNear(c, a.hex, 4));
  for (const p of order) {
    const item = p.queue[0];
    if (!item || item.kind === 'project') continue;
    const cost = purchaseCost(s, f, p, item);
    if (cost > 0 && f.credits - cost >= reserve && purchase(s, p, item)) {
      say(c, 'major', () => `${planetLabel(s, p)} buys ${itemLabel(item)} for ${cost} credits (reserve ${Math.round(reserve)}, ${Math.round(f.credits)} left)`);
    }
  }
}

// Units

function exploreTarget(c: Ctx, u: Unit): number | null {
  const { s, f } = c;
  const sight = unitSight(f, UNITS[u.type]);
  const reach = reachable(s, u);
  let best = -1;
  let bestScore = 0;
  for (const [hex] of reach) {
    if (c.claimed.has(hex)) continue;
    let score = 0;
    for (const i of within(s, hex, sight)) if (!f.explored[i]) score++;
    if (s.hexes[hex].anomaly) score += 12;
    if (threatNear(c, hex, 2) > 0) score -= 8;
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }
  if (best >= 0) return best;
  // The nearest explored hex that touches unexplored space, or a known anomaly.
  const occ = occupancy(s);
  const options: { i: number; d: number }[] = [];
  for (let i = 0; i < s.hexes.length; i++) {
    if (!f.explored[i] || c.claimed.has(i) || !canEnter(s, f, i) || !canStop(s, u, i, occ)) continue;
    const frontier = s.hexes[i].anomaly || neighbors(s, i).some((n) => !f.explored[n]);
    if (frontier) options.push({ i, d: distance(s, u.hex, i) });
  }
  options.sort((a, b) => a.d - b.d);
  for (const o of options.slice(0, 6)) if (findPath(s, u, o.i)) return o.i;
  return null;
}

function goHome(c: Ctx, u: Unit) {
  const { s } = c;
  const home = [...c.planets].sort((a, b) => distance(s, u.hex, a.hex) - distance(s, u.hex, b.hex))[0];
  if (!home) return;
  say(c, 'minor', () => `${unitLabel(s, u)} goes back to ${planetLabel(s, home)}`);
  if (distance(s, u.hex, home.hex) > 1) moveToward(s, u, home.hex, true);
}

function scoutTurn(c: Ctx, u: Unit) {
  const target = exploreTarget(c, u);
  if (target === null) {
    say(c, 'minor', () => `${unitLabel(c.s, u)} has nothing more to explore and sleeps`);
    goHome(c, u);
    u.order = { kind: 'sleep' };
    return;
  }
  say(c, 'minor', () => `Evaluated exploration options for ${unitLabel(c.s, u)} - move to ${hexLabel(c.s, target)} shows the most unexplored hexes`);
  c.claimed.add(target);
  moveToward(c.s, u, target);
}

function colonyTurn(c: Ctx, u: Unit) {
  const { s } = c;
  if (canColonizeHere(s, u)) {
    say(c, 'minor', () => `${unitLabel(s, u)} founds a colony here`);
    colonize(s, u);
    return;
  }
  if (threatNear(c, u.hex, 3) > 0) {
    say(c, 'minor', () => `${unitLabel(s, u)} sees an enemy within 3 hexes`);
    goHome(c, u);
    return;
  }
  const targets = settleTargets(c)
    .filter((p) => !c.claimed.has(p.hex))
    .map((p) => {
      let score = TYPE_VALUE[p.type] * 2 - distance(s, u.hex, p.hex) * 0.8;
      for (const i of within(s, p.hex, 2)) {
        const h = s.hexes[i];
        if (h.resource && resourceVisible(c.f, h.resource)) score += 2;
        if (h.terrain !== 'space') score += 0.3;
      }
      score -= threatNear(c, p.hex, 3) * 0.5;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  if (targets.length) say(c, 'trace', () => `colony options for ${unitLabel(s, u)}: ${targets.map((t) => `${t.p.name} ${t.score.toFixed(1)}`).join(', ')}`);
  for (const t of targets.slice(0, 5)) {
    if (!findPath(s, u, t.p.hex)) continue;
    say(c, 'minor', () => `Evaluated ${targets.length} colony targets for ${unitLabel(s, u)} - ${planetLabel(s, t.p)} has the highest value (${t.score.toFixed(1)})`);
    c.claimed.add(t.p.hex);
    if (moveToward(s, u, t.p.hex) && s.units.includes(u)) colonize(s, u);
    return;
  }
  goHome(c, u);
}

function constructorTurn(c: Ctx, u: Unit) {
  const { s, f } = c;
  if (u.order?.kind === 'build') return;
  if (threatNear(c, u.hex, 2) > 0) {
    goHome(c, u);
    return;
  }
  if (canBuildStation(s, u) && !c.claimed.has(u.hex)) {
    c.claimed.add(u.hex);
    say(c, 'minor', () => `${unitLabel(s, u)} builds a station here`);
    buildStation(s, u);
    return;
  }
  const occ = occupancy(s);
  const targets = improvable(c)
    .filter((i) => !c.claimed.has(i) && canStop(s, u, i, occ) && threatNear(c, i, 2) === 0)
    .map((i) => {
      const h = s.hexes[i];
      const y = hexYield(s, f, i);
      let score = y.food + y.prod + y.sci + y.cred * 0.6;
      if (h.resource && resourceVisible(f, h.resource)) score += 8;
      const owner = s.planets[h.owner!];
      if (owner.worked.includes(i)) score += 3;
      score -= distance(s, u.hex, i) * 0.7;
      return { i, score };
    })
    .sort((a, b) => b.score - a.score);
  for (const t of targets.slice(0, 5)) {
    if (!findPath(s, u, t.i)) continue;
    say(c, 'minor', () => `Evaluated ${targets.length} station sites for ${unitLabel(s, u)} - ${hexLabel(s, t.i)} has the highest value (${t.score.toFixed(1)})`);
    c.claimed.add(t.i);
    if (moveToward(s, u, t.i) && u.moves > 0) buildStation(s, u);
    return;
  }
}

interface AttackPlan {
  from: number | undefined;
  hex: number;
  score: number;
}

function bestAttack(c: Ctx, u: Unit, stay: boolean): AttackPlan | null {
  const { s } = c;
  const def = UNITS[u.type];
  const range = def.ranged ? (def.range ?? 1) : 1;
  let best: AttackPlan | null = null;
  const caution = 1.3 - c.ai.aggression * 0.6;
  const consider = (from: number | undefined, hex: number) => {
    if (c.vis[hex] !== 2) return;
    if (canAttack(s, u, hex, from)) {
      const p = preview(s, u, hex, from)!;
      const targetHp = p.target.kind === 'planet' ? p.target.planet!.hp : p.target.unit!.hp;
      const killShot = p.toDefender >= targetHp;
      let score = p.toDefender - p.toAttacker * caution;
      if (killShot) score += 30;
      if (p.target.kind === 'civilian') score += 20;
      if (p.target.kind === 'planet') {
        score = p.toDefender * 0.9 - p.toAttacker * caution + 5;
        if (s.factions[p.target.planet!.owner].isPirate) score = -1;
      }
      if (p.toAttacker >= u.hp && !killShot) score = -1;
      say(c, 'trace', () => `attack option for ${unitLabel(s, u)}: target ${hexLabel(s, hex)} from ${hexLabel(s, from ?? u.hex)}, damage ${p.toDefender} for ${p.toAttacker}, value ${score.toFixed(1)}`);
      if (score > 0 && (!best || score > best.score)) best = { from, hex, score };
    }
  };
  for (const n of within(s, u.hex, range)) if (n !== u.hex) consider(undefined, n);
  if (!stay) {
    for (const [hex, left] of reachable(s, u)) {
      if (left <= 0) continue;
      for (const n of within(s, hex, range)) if (n !== hex) consider(hex, n);
    }
  }
  return best;
}

function doAttack(c: Ctx, u: Unit, plan: AttackPlan): boolean {
  const { s } = c;
  say(c, 'major', () => `Evaluated attack options for ${unitLabel(s, u)} - attack on ${hexLabel(s, plan.hex)} from ${hexLabel(s, plan.from ?? u.hex)} has the highest expected value (${plan.score.toFixed(1)})`);
  if (plan.from !== undefined && plan.from !== u.hex) {
    if (!moveToward(s, u, plan.from) || !s.units.includes(u)) return false;
  }
  return !!attack(s, u, plan.hex);
}

function warTarget(c: Ctx): Planet | null {
  const { s, f } = c;
  if (!c.enemies.length) return null;
  const cap = capital(s, f.id);
  if (!cap) return null;
  const options = s.planets.filter((p) => c.enemies.includes(p.owner) && f.explored[p.hex]);
  if (!options.length) return null;
  // Home planets count for the Conquest victory, so they come first when they are in reach.
  const key = (p: Planet) => distance(s, cap.hex, p.hex) - (p.hp <= 0 ? 6 : 0) - (p.homeOf >= 0 ? 14 : 0);
  options.sort((a, b) => key(a) - key(b));
  return options[0];
}

function nearestThreat(c: Ctx, u: Unit, radius: number): Unit | null {
  const { s, f } = c;
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const e of s.units) {
    if (e.owner === f.id || !atWar(s, f.id, e.owner) || c.vis[e.hex] !== 2) continue;
    const nearHome = hexFaction(s, e.hex) === f.id || c.planets.some((p) => distance(s, p.hex, e.hex) <= 3);
    if (!nearHome) continue;
    const d = distance(s, u.hex, e.hex);
    if (d <= radius && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function knownDen(c: Ctx, u: Unit, radius: number): number | null {
  const { s, f } = c;
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of c.planets) {
    for (const i of within(s, p.hex, radius)) {
      if (!s.hexes[i].den || !f.explored[i]) continue;
      const d = distance(s, u.hex, i);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

function militaryTurn(c: Ctx, units: Unit[], target: Planet | null) {
  const { s, f } = c;
  // One guard for each planet: the nearest warship.
  const guards = new Map<number, Planet>();
  const free = new Set(units.map((u) => u.id));
  // In war only threatened planets and the capital keep a guard. The rest of the fleet forms the army.
  const cap = capital(s, f.id);
  for (const p of c.planets) {
    if (c.enemies.length && p.id !== cap?.id && threatNear(c, p.hex, 5) === 0) continue;
    const near = units
      .filter((u) => free.has(u.id))
      .sort((a, b) => distance(s, a.hex, p.hex) - distance(s, b.hex, p.hex))[0];
    if (near && units.length > c.planets.length * 0.5) {
      guards.set(near.id, p);
      free.delete(near.id);
    }
  }
  const field = units.filter((u) => free.has(u.id));
  // The army gathers at the own planet nearest to the target. It advances when enough ships are there.
  const staging = target ? nearestOwnPlanet(c, target.hex) : undefined;
  const needed = target ? Math.max(3, Math.ceil(planetStrength(s, target) / 12)) : 0;
  const nearTarget = (u: Unit) => target !== null && distance(s, u.hex, target.hex) <= 5;
  const gathered = staging ? field.filter((u) => nearTarget(u) || distance(s, u.hex, staging.hex) <= 3).length : 0;
  const ready = !!target && gathered >= needed;
  if (target) say(c, 'major', () => `war target ${planetLabel(s, target)} of ${factionLabel(s.factions[target.owner])}: ${gathered} of ${needed} warships gathered${staging ? ` at ${staging.name}` : ''}, ${ready ? 'the army advances' : 'the army waits'}`);
  say(c, 'minor', () => `${units.length} warships: ${guards.size} guard planets, ${field.length} are free`);

  for (const u of units) {
    if (!s.units.includes(u) || u.moves <= 0) continue;
    look(c);
    const guardOf = guards.get(u.id);

    if (upgradeTarget(s, u) && hexFaction(s, u.hex) === f.id && f.credits >= upgradeCost(s, u) + 60) {
      say(c, 'major', () => `${unitLabel(s, u)} upgrades to ${upgradeTarget(s, u)!.name} for ${upgradeCost(s, u)} credits`);
      upgrade(s, u);
      continue;
    }

    if (u.hp < 35 && threatNear(c, u.hex, 1) === 0) {
      say(c, 'minor', () => `${unitLabel(s, u)} has ${Math.round(u.hp)} hit points and retreats`);
      goHome(c, u);
      continue;
    }

    const plan = bestAttack(c, u, false);
    if (plan) {
      const farFromPost = guardOf && distance(s, plan.from ?? u.hex, guardOf.hex) > 3;
      if (!farFromPost && doAttack(c, u, plan)) continue;
      if (!s.units.includes(u) || u.moves <= 0) continue;
    }

    if (guardOf) {
      say(c, 'minor', () => `${unitLabel(s, u)} guards ${planetLabel(s, guardOf)}`);
      if (u.hex !== guardOf.hex) moveToward(s, u, guardOf.hex);
      if (s.units.includes(u) && u.moves > 0 && u.hp < 100) u.order = { kind: 'fortify' };
      else if (s.units.includes(u)) u.order = { kind: 'fortify' };
      continue;
    }

    const threat = nearestThreat(c, u, 8);
    if (threat) {
      say(c, 'minor', () => `${unitLabel(s, u)} moves against the enemy ${unitLabel(s, threat)} near own planets`);
      moveToward(s, u, threat.hex, true);
      const again = s.units.includes(u) && u.moves > 0 ? bestAttack(c, u, true) : null;
      if (again) doAttack(c, u, again);
      continue;
    }

    if (target && (ready || nearTarget(u))) {
      say(c, 'minor', () => `${unitLabel(s, u)} advances on ${planetLabel(s, target)}`);
      if (distance(s, u.hex, target.hex) > 1) moveToward(s, u, target.hex, true);
      const again = s.units.includes(u) && u.moves > 0 ? bestAttack(c, u, true) : null;
      if (again) doAttack(c, u, again);
      continue;
    }
    if (target && staging) {
      say(c, 'minor', () => `${unitLabel(s, u)} gathers at ${planetLabel(s, staging)}`);
      if (distance(s, u.hex, staging.hex) > 2) moveToward(s, u, staging.hex, true);
      else u.order = { kind: 'fortify' };
      continue;
    }

    const den = knownDen(c, u, 7);
    if (den !== null && UNITS[u.type].strength >= 12) {
      say(c, 'minor', () => `${unitLabel(s, u)} moves against the pirate den ${hexLabel(s, den)}`);
      moveToward(s, u, den);
      continue;
    }

    // Wait near the capital, or near the front when a war target exists.
    const post = target ? nearestOwnPlanet(c, target.hex) : capital(s, f.id);
    say(c, 'minor', () => `${unitLabel(s, u)} has no task and waits${post ? ` at ${planetLabel(s, post)}` : ''}`);
    if (post && distance(s, u.hex, post.hex) > 2) moveToward(s, u, post.hex, true);
    else u.order = { kind: 'fortify' };
  }
}

function nearestOwnPlanet(c: Ctx, hex: number): Planet | undefined {
  return [...c.planets].sort((a, b) => distance(c.s, a.hex, hex) - distance(c.s, b.hex, hex))[0];
}

function transportTurn(c: Ctx, u: Unit, target: Planet | null, warships: Unit[]) {
  const { s } = c;
  for (const n of neighbors(s, u.hex)) {
    if (canInvade(s, u, n)) {
      const p = s.planets[s.hexes[n].planetId!];
      const odds = invasionStrength(s, u, p) / Math.max(1, garrisonStrength(s, p) * (0.5 + p.garrisonHp / 200));
      // A failed infiltration still weakens the garrison for the next troops, so infiltrators accept lower odds.
      const need = p.hp > 0 ? 0.5 : 0.6;
      say(c, odds >= need ? 'major' : 'minor', () => `${unitLabel(s, u)} can invade ${planetLabel(s, p)} with odds ${odds.toFixed(2)} - ${odds >= need ? 'it invades' : `it waits for odds of ${need}`}`);
      if (odds >= need) {
        invade(s, u, n);
        return;
      }
    }
  }
  if (!target) {
    goHome(c, u);
    return;
  }
  if (target.hp <= 0) {
    say(c, 'minor', () => `${unitLabel(s, u)} moves to invade ${planetLabel(s, target)}, the defences are down`);
    moveToward(s, u, target.hex, true);
    if (s.units.includes(u) && u.moves > 0 && canInvade(s, u, target.hex)) invade(s, u, target.hex);
    return;
  }
  // Infiltrators do not wait for the warships. They go to the planet and invade when the odds are good enough.
  if (sumMod(c.f, 'infiltrate') > 0) {
    say(c, 'minor', () => `${unitLabel(s, u)} moves to infiltrate ${planetLabel(s, target)}`);
    moveToward(s, u, target.hex, true);
    return;
  }
  // Wait with a warship near the target, or at the staging planet.
  const occ = occupancy(s);
  const escort = warships
    .filter((w) => s.units.includes(w) && !occ.civilian.has(w.hex) && distance(s, w.hex, target.hex) >= 2 && distance(s, w.hex, target.hex) <= 6)
    .sort((a, b) => distance(s, a.hex, target.hex) - distance(s, b.hex, target.hex))[0];
  say(c, 'minor', () => `${unitLabel(s, u)} waits for the defences of ${planetLabel(s, target)} to go down${escort ? ` with the escort ${unitLabel(s, escort)}` : ''}`);
  if (escort) moveToward(s, u, escort.hex);
  else {
    const staging = nearestOwnPlanet(c, target.hex);
    if (staging && distance(s, u.hex, staging.hex) > 1) moveToward(s, u, staging.hex, true);
  }
}

// Computes the visible hexes again. Each unit decides with what the faction sees after the moves before it.
function look(c: Ctx) {
  c.vis = computeVisible(c.s, c.f.id);
}

function moveUnits(c: Ctx) {
  const { s } = c;
  const mine = myUnits(c);
  const target = warTarget(c);
  const warships = mine.filter(isWarship);
  const each = (units: Unit[], turn: (u: Unit) => void) => {
    for (const u of units) {
      if (s.winner) return;
      if (!s.units.includes(u)) continue;
      look(c);
      turn(u);
    }
  };
  each(mine.filter((x) => UNITS[x.type].canColonize), (u) => colonyTurn(c, u));
  each(mine.filter(isScout), (u) => scoutTurn(c, u));
  // Ranged units attack first. Melee units then finish the damaged targets.
  warships.sort((a, b) => (UNITS[b.type].ranged ?? 0) - (UNITS[a.type].ranged ?? 0));
  militaryTurn(c, warships, target);
  each(mine.filter((x) => UNITS[x.type].ground), (u) => transportTurn(c, u, target ?? c.prey, warships));
  each(mine.filter((x) => UNITS[x.type].canBuild), (u) => constructorTurn(c, u));
}

// Diplomacy

function nearestPlanetDistance(c: Ctx, other: number): number {
  let best = Infinity;
  for (const p of c.planets) {
    for (const q of c.s.planets) {
      if (q.owner === other && c.f.explored[q.hex]) best = Math.min(best, distance(c.s, p.hex, q.hex));
    }
  }
  return best;
}

// The value of a war against "o": lower is better. Null when the faction does not want this war now.
function warValue(c: Ctx, o: Faction, mine: number): number | null {
  const { s, f, ai } = c;
  const att = s.attitude[f.id][o.id];
  const theirs = militaryStrength(s, o.id);
  // An aggressive faction attacks anyone that is not a friend. Others attack only factions that they dislike.
  const limit = ai.aggression >= 0.7 ? 40 : -25 + ai.aggression * 30;
  const canConquer = UNIT_LIST.some((u) => u.ground && unitAllowed(f, u));
  // A very aggressive faction fights two wars when it is much stronger.
  const busy = c.enemies.length > (ai.aggression >= 0.7 && mine > theirs * 2 ? 1 : 0);
  const inForum = s.forum?.members.includes(f.id) && s.forum.members.includes(o.id);
  const dist = nearestPlanetDistance(c, o.id);
  const wants =
    canDeclareWar(s, f.id, o.id) && !busy && canConquer && s.turn > 25 && att < limit - (inForum ? 20 : 0) && mine > theirs * ai.warRatio && mine > 50 && dist <= 18;
  return wants ? theirs / mine + dist / 20 - (o.isHuman ? 0 : 0.1) : null;
}

// A faction whose troops go through planet defences. In peace it places troops next to the home planet of its prey.
// It declares war when the troops are in place, and they invade in the same turn.
function infiltrator(f: Faction): boolean {
  return sumMod(f, 'infiltrate') > 0;
}

const INFILTRATION_TROOPS = 3;

// The planet that an infiltrator at peace prepares to take: the home planet of its best war candidate.
function infiltrationTarget(c: Ctx): Planet | null {
  const { s, f } = c;
  if (!infiltrator(f) || c.enemies.length) return null;
  const mine = militaryStrength(s, f.id);
  const troops = myUnits(c).filter((u) => UNITS[u.type].ground);
  let prey: Planet | null = null;
  let top = Infinity;
  for (const o of realFactions(s)) {
    if (o.id === f.id || !o.alive || !f.met.includes(o.id)) continue;
    const value = warValue(c, o, mine);
    const home = s.planets.find((p) => p.owner === o.id && p.homeOf === o.id && f.explored[p.hex]);
    if (value === null || !home) continue;
    // Troops that are near a home planet keep the plan on that planet.
    const score = value - 0.4 * troops.filter((u) => distance(s, u.hex, home.hex) <= 4).length;
    if (score < top) {
      top = score;
      prey = home;
    }
  }
  return prey;
}

// Are the troops next to the planet strong enough together to take it?
function troopsInPlace(c: Ctx, p: Planet): boolean {
  const { s } = c;
  const garrison = Math.max(1, garrisonStrength(s, p) * (0.5 + p.garrisonHp / 200));
  let odds = 0;
  for (const u of myUnits(c)) if (UNITS[u.type].ground && distance(s, u.hex, p.hex) === 1) odds += invasionStrength(s, u, p) / garrison;
  return odds >= 1.2;
}

function diplomacy(c: Ctx) {
  const { s, f, ai } = c;
  const mine = militaryStrength(s, f.id);
  let warPick: { id: number; score: number } | null = null;
  for (const o of realFactions(s)) {
    if (o.id === f.id || !o.alive || !f.met.includes(o.id)) continue;
    const pr = relation(s, f.id, o.id);
    if (pr.atWar) {
      if (!aiAcceptsPeace(s, f.id, o.id)) {
        if (pr.peaceOfferedBy === f.id) pair(s, f.id, o.id).peaceOfferedBy = undefined;
        continue;
      }
      if (o.isHuman) {
        if (pr.peaceOfferedBy === undefined) {
          pair(s, f.id, o.id).peaceOfferedBy = f.id;
          say(c, 'major', () => `offers peace to ${factionLabel(o)}`);
          log(s, o.id, `The ${f.name} offers peace. Open the Diplomacy screen to answer.`, undefined, 'info');
        }
      } else if (aiAcceptsPeace(s, o.id, f.id)) {
        say(c, 'major', () => `wants peace with ${factionLabel(o)}, and they accept`);
        makePeace(s, f.id, o.id);
      }
      continue;
    }

    const att = s.attitude[f.id][o.id];
    const score = warValue(c, o, mine);
    if (score !== null) {
      say(c, 'minor', () => `${factionLabel(o)} is a war candidate: attitude ${att}, strength ${Math.round(mine)} against ${Math.round(militaryStrength(s, o.id))}, value ${score.toFixed(2)} (lowest is best)`);
      if (!warPick || score < warPick.score) warPick = { id: o.id, score };
    }

    if (!pr.openBorders && att >= 20 && !o.isHuman && aiAcceptsOpenBorders(s, o.id, f.id)) {
      say(c, 'major', () => `opens borders with ${factionLabel(o)} (attitude ${att})`);
      setOpenBorders(s, f.id, o.id, true);
    }
    if (pr.openBorders && att < -10) {
      say(c, 'major', () => `closes borders with ${factionLabel(o)} (attitude ${att})`);
      setOpenBorders(s, f.id, o.id, false);
    }
  }

  // The weakest and nearest candidate gets the war, with a chance that grows with aggression.
  // An infiltrator declares war on the owner of its prey when its troops are in place.
  if (infiltrator(f)) warPick = c.prey && troopsInPlace(c, c.prey) ? { id: c.prey.owner, score: 0 } : null;
  if (warPick && (infiltrator(f) || nextFloat(s) < ai.aggression * 0.15)) {
    const pick = warPick as { id: number; score: number };
    say(c, 'major', () => `chooses war against ${factionLabel(s.factions[pick.id])}, the weakest and nearest candidate (value ${pick.score.toFixed(2)})`);
    declareWar(s, f.id, warPick.id);
    c.enemies.push(warPick.id);
  }

  // Envoys
  if (ai.diplomacy >= 1) {
    const options = realFactions(s)
      .filter((o) => o.id !== f.id && o.alive && canSendEnvoys(s, f.id, o.id) && f.met.includes(o.id))
      .sort((a, b) => s.attitude[a.id][f.id] - s.attitude[b.id][f.id]);
    const needy = options.find((o) => s.attitude[o.id][f.id] < 60);
    if (needy && sendEnvoys(s, f.id, needy.id)) say(c, 'minor', () => `sends envoys to ${factionLabel(needy)}`);
  }
}

function forumActions(c: Ctx) {
  const { s, f, ai } = c;
  const forum = s.forum;
  if (!forum) return;
  if (forum.founder === f.id) {
    for (const o of realFactions(s)) {
      if (o.id === f.id || !o.alive || o.isHuman || forum.members.includes(o.id)) continue;
      if (f.influence >= INVITE_COST && acceptsInvitation(s, o.id)) {
        say(c, 'major', () => `invites ${factionLabel(o)} to the Forum`);
        invite(s, o.id);
      }
    }
  }
  if (!forum.members.includes(f.id)) return;
  if (ai.diplomacy < 1 || forum.nextElection - s.turn > 5) return;
  // Lobby the voter that is closest to a change of vote.
  let guard = 0;
  while (guard++ < 4) {
    let best = -1;
    let bestGap = Infinity;
    for (const v of forum.members) {
      if (v === f.id || s.factions[v].isHuman || voteOf(s, v) === f.id) continue;
      const gap = support(s, v, voteOf(s, v)) - support(s, v, f.id);
      if (gap < bestGap) {
        bestGap = gap;
        best = v;
      }
    }
    if (best < 0 || bestGap > 40 || f.influence < lobbyCost(f, best)) break;
    if (!lobby(s, f.id, best)) break;
    const voter = best;
    const gap = bestGap;
    say(c, 'minor', () => `lobbies ${factionLabel(s.factions[voter])} for the election (support gap ${gap})`);
  }
}

function context(s: GameState, f: Faction): Ctx {
  return {
    s,
    f,
    ai: SPECIES[f.species].ai,
    planets: ownedPlanets(s, f.id),
    vis: computeVisible(s, f.id),
    enemies: realFactions(s)
      .filter((o) => o.alive && o.id !== f.id && atWar(s, f.id, o.id))
      .map((o) => o.id),
    morale: morale(s, f).total,
    claimed: new Set(),
    prey: null,
  };
}

// Moves a unit of the human player that has the "explore" order. Returns false when nothing is left to explore.
export function autoExplore(s: GameState, u: Unit): boolean {
  const c = context(s, s.factions[u.owner]);
  const target = exploreTarget(c, u);
  if (target === null) return false;
  moveToward(s, u, target);
  return true;
}

export function runAI(s: GameState, f: Faction) {
  if (!f.alive || f.isPirate) return;
  const c = context(s, f);
  if (!c.planets.length) return;
  c.prey = infiltrationTarget(c);
  const prey = c.prey;
  if (prey) say(c, 'major', () => `prepares a war in peace: troops go to ${planetLabel(s, prey)}`);
  say(c, 'major', () => `turn starts: ${c.planets.length} planets, ${myUnits(c).length} units, ${Math.round(f.credits)} credits, morale ${c.morale}, at war with ${c.enemies.length ? c.enemies.map((e) => factionLabel(s.factions[e])).join(', ') : 'no faction'}`);
  chooseResearch(c);
  diplomacy(c);
  forumActions(c);
  managePlanets(c);
  moveUnits(c);
  if (s.winner) return;
  c.planets = ownedPlanets(s, f.id);
  managePlanets(c);
}

export { PROJECTS };

import { SPECIES } from './data/species';
import { TECHS } from './data/techs';
import { unitValue } from './combat';
import { routeYield } from './economy';
import { emit } from './events';
import { distance } from './hex';
import { expelUnits } from './movement';
import { learn } from './research';
import { atWar, canResearch, hexFaction, log, ownedPlanets, pair, realFactions, relation, sumMod, techCost } from './rules';
import { UNITS } from './data/units';
import type { Faction, GameState, SpeciesId } from './types';

export const PEACE_TREATY_TURNS = 10;
export const MIN_WAR_TURNS = 6;
export const ENVOY_COST = 30;
export const ENVOY_INTERVAL = 5;

// Envoys cost more for a large empire.
export function envoyCost(s: GameState, from: number): number {
  return Math.round(ENVOY_COST * (1 + 0.15 * Math.max(0, ownedPlanets(s, from).length - 1)));
}

// Envoys help less when the other faction already likes you.
export function envoyGain(s: GameState, from: number, to: number): number {
  const att = s.attitude[to][from];
  return att < 20 ? 9 : att < 45 ? 5 : 2;
}

export function canSendEnvoys(s: GameState, from: number, to: number): boolean {
  const f = s.factions[from];
  const last = f.envoys[to];
  if (last !== undefined && s.turn - last < ENVOY_INTERVAL) return false;
  return f.influence >= envoyCost(s, from) && !atWar(s, from, to);
}

export function clampAttitude(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

export function changeAttitude(s: GameState, of: number, toward: number, delta: number) {
  s.attitude[of][toward] = clampAttitude(s.attitude[of][toward] + delta);
}

export function attitudeLabel(v: number): string {
  if (v >= 50) return 'Friendly';
  if (v >= 20) return 'Warm';
  if (v > -20) return 'Neutral';
  if (v > -50) return 'Cold';
  return 'Hostile';
}

export function militaryStrength(s: GameState, f: number): number {
  let total = 0;
  for (const u of s.units) if (u.owner === f) total += unitValue(s, u);
  return total;
}

export function routesBetween(s: GameState, a: number, b: number): number {
  let n = 0;
  for (const p of s.planets) {
    if (p.owner !== a && p.owner !== b) continue;
    for (const r of p.routes) {
      const to = s.planets[r];
      if (to.owner >= 0 && to.owner !== p.owner && (to.owner === a || to.owner === b) && routeYield(s, p, to).cred > 0) n++;
    }
  }
  return n;
}

export interface AttitudePart {
  label: string;
  value: number;
}

// How much each kind of reason counts for a species. A warrior minds borders and weakness, a trader minds routes,
// a diplomat minds wars against its friends.
export function temperament(species: SpeciesId) {
  const ai = SPECIES[species].ai;
  return {
    borders: 0.7 + ai.aggression * 0.6, // 0.79 for the Seren, 1.24 for the Krogg
    trade: 0.5 + ai.commerce * 0.5,
    friends: 0.5 + ai.diplomacy * 0.5,
    intrusion: 0.5 + ai.aggression, // ships inside the borders
    contempt: ai.aggression >= 0.6, // dislikes a weak fleet
    respect: ai.aggression > 0.5, // likes a strong fleet
  };
}

// The value that the attitude of "a" toward "b" moves to over time.
export function attitudeTarget(s: GameState, a: number, b: number): { total: number; parts: AttitudePart[] } {
  const fa = s.factions[a];
  const fb = s.factions[b];
  const t = temperament(fa.species);
  const parts: AttitudePart[] = [];
  const add = (label: string, value: number) => {
    if (Math.round(value)) parts.push({ label, value: Math.round(value) });
  };
  add('Their reputation', sumMod(fb, 'attitudeBase'));
  add('Our temperament', (SPECIES[fa.species].ai.diplomacy - 1) * 12 - SPECIES[fa.species].ai.aggression * 8);
  let friction = 0;
  for (const p of ownedPlanets(s, a)) for (const q of ownedPlanets(s, b)) if (distance(s, p.hex, q.hex) <= 6) friction++;
  add('Border friction', -Math.min(24, friction * 4) * t.borders);
  add('Trade routes', Math.min(24, routesBetween(s, a, b) * 6) * t.trade);
  let intruders = 0;
  for (const u of s.units) if (u.owner === b && UNITS[u.type].cls === 'military' && hexFaction(s, u.hex) === a) intruders++;
  if (intruders) add('Their warships in our space', -Math.min(12, intruders * 3) * t.intrusion);
  const pr = relation(s, a, b);
  if (pr.openBorders) add('Open borders', 8);
  if (pr.atWar) add('At war', -40);
  let shared = 0;
  let friendsAttacked = 0;
  let partnersAttacked = 0;
  for (const o of realFactions(s)) {
    if (!o.alive || o.id === a || o.id === b) continue;
    if (atWar(s, a, o.id) && atWar(s, b, o.id)) shared++;
    if (atWar(s, b, o.id) && s.attitude[a][o.id] >= 30) friendsAttacked++;
    if (atWar(s, b, o.id) && routesBetween(s, a, o.id) > 0) partnersAttacked++;
  }
  add('Shared enemies', shared * 10);
  add('At war with our friends', -friendsAttacked * 10 * t.friends);
  if (partnersAttacked && SPECIES[fa.species].ai.commerce >= 1.2) add('At war with our trade partners', -partnersAttacked * 6);
  if (s.forum && s.forum.members.includes(a) && s.forum.members.includes(b)) add('Forum members', 10);
  if (s.forum?.leader === b) add('Forum leader', 5);
  const mine = militaryStrength(s, a);
  const theirs = militaryStrength(s, b);
  const strong = theirs > mine * 2 && theirs > 60;
  if (strong) add('Their large fleet', t.respect ? 5 : -8);
  if (t.contempt && mine > 60 && theirs < mine * 0.5) add('Their weak fleet', -8);
  const total = clampAttitude(parts.reduce((x, p) => x + p.value, 0));
  return { total, parts };
}

export function driftAttitudes(s: GameState, a: number) {
  for (const o of realFactions(s)) {
    if (o.id === a || !o.alive || !s.factions[a].met.includes(o.id)) continue;
    const target = attitudeTarget(s, a, o.id).total;
    const cur = s.attitude[a][o.id];
    if (cur < target) s.attitude[a][o.id] = Math.min(target, cur + 1);
    else if (cur > target) s.attitude[a][o.id] = Math.max(target, cur - 1);
  }
}

export function canDeclareWar(s: GameState, a: number, b: number): boolean {
  if (a === b || !s.factions[a].met.includes(b) || !s.factions[b].alive) return false;
  const pr = relation(s, a, b);
  return !pr.atWar && (pr.lastChange === 0 || s.turn - pr.lastChange >= PEACE_TREATY_TURNS);
}

export function declareWar(s: GameState, a: number, b: number): boolean {
  if (!canDeclareWar(s, a, b)) return false;
  const pr = pair(s, a, b);
  pr.atWar = true;
  emit(s, { kind: 'warDeclared', by: a, on: b });
  pr.openBorders = false;
  pr.lastChange = s.turn;
  pr.peaceOfferedBy = undefined;
  changeAttitude(s, b, a, -40);
  changeAttitude(s, a, b, -15);
  const fa = s.factions[a];
  const fb = s.factions[b];
  for (const o of realFactions(s)) {
    if (o.id === a || o.id === b || !o.alive) continue;
    const k = temperament(o.species).friends;
    if (s.attitude[o.id][b] >= 20) changeAttitude(s, o.id, a, Math.round(-10 * k));
    else changeAttitude(s, o.id, a, Math.round(-3 * k));
    if (o.met.includes(a) && o.met.includes(b)) log(s, o.id, `The ${fa.name} declared war on the ${fb.name}.`, undefined, 'info');
  }
  log(s, b, `The ${fa.name} declared war on you.`, undefined, 'bad');
  log(s, a, `You declared war on the ${fb.name}.`, undefined, 'info');
  if (s.forum) {
    const m = s.forum.members;
    if (m.includes(a) && m.includes(b)) {
      // The aggressor leaves the Forum. A founder stays, and the other side leaves.
      const leaver = a === s.forum.founder ? b : a;
      s.forum.members = m.filter((x) => x !== leaver);
      if (s.forum.leader === leaver) s.forum.leader = -1;
      log(s, -1, `The ${s.factions[leaver].name} left the Interstellar Forum.`, undefined, 'info');
    }
  }
  // Routes between the two factions stop.
  for (const p of s.planets) {
    if (p.owner === a || p.owner === b) p.routes = p.routes.filter((r) => !atWar(s, p.owner, s.planets[r].owner));
  }
  return true;
}

export function makePeace(s: GameState, a: number, b: number) {
  if (!atWar(s, a, b)) return;
  const pr = pair(s, a, b);
  pr.atWar = false;
  emit(s, { kind: 'peaceMade', a, b });
  pr.lastChange = s.turn;
  pr.peaceOfferedBy = undefined;
  changeAttitude(s, a, b, 10);
  changeAttitude(s, b, a, 10);
  expelUnits(s, a, b);
  log(s, a, `You made peace with the ${s.factions[b].name}.`, undefined, 'good');
  log(s, b, `You made peace with the ${s.factions[a].name}.`, undefined, 'good');
}

// Does the AI faction "ai" accept peace with "other"?
export function aiAcceptsPeace(s: GameState, ai: number, other: number): boolean {
  const pr = relation(s, ai, other);
  if (!pr.atWar || s.turn - pr.lastChange < MIN_WAR_TURNS) return false;
  const mine = militaryStrength(s, ai);
  const theirs = militaryStrength(s, other);
  const aggression = SPECIES[s.factions[ai].species].ai.aggression;
  const length = s.turn - pr.lastChange;
  // A faction that is winning wants to continue. Long wars make every faction tired, aggressive ones less so.
  const patience = aggression >= 0.6 ? 40 : 25;
  const want = theirs / Math.max(1, mine) + length / patience - aggression * 0.6;
  return want >= 1;
}

export function setOpenBorders(s: GameState, a: number, b: number, open: boolean) {
  if (atWar(s, a, b) || relation(s, a, b).openBorders === open) return;
  pair(s, a, b).openBorders = open;
  if (!open) expelUnits(s, a, b);
}

export function aiAcceptsOpenBorders(s: GameState, ai: number, other: number): boolean {
  return !atWar(s, ai, other) && s.attitude[ai][other] >= 10;
}

export function giftCredits(s: GameState, from: number, to: number, amount: number): boolean {
  const f = s.factions[from];
  if (amount <= 0 || f.credits < amount || atWar(s, from, to)) return false;
  f.credits -= amount;
  s.factions[to].credits += amount;
  changeAttitude(s, to, from, Math.min(20, Math.round(amount / 8)));
  return true;
}

export function sendEnvoys(s: GameState, from: number, to: number): boolean {
  const f = s.factions[from];
  if (!canSendEnvoys(s, from, to)) return false;
  f.influence -= envoyCost(s, from);
  changeAttitude(s, to, from, envoyGain(s, from, to));
  f.envoys[to] = s.turn;
  return true;
}

// Technologies that "from" has and "to" can research now.
export function tradableTechs(s: GameState, from: number, to: number): string[] {
  const ff = s.factions[from];
  const ft = s.factions[to];
  return ff.techs.filter((id) => !TECHS[id].species && canResearch(ft, id));
}

export function techValue(s: GameState, f: Faction, id: string): number {
  return Math.round(techCost(s, f, id) * 1.5);
}

export interface Deal {
  giveCredits: number;
  giveTechs: string[];
  takeCredits: number;
  takeTechs: string[];
}

// The human (or another faction) proposes a deal to an AI faction. Returns the balance as the AI sees it.
export function dealBalance(s: GameState, from: number, ai: number, deal: Deal): number {
  const fa = s.factions[ai];
  const ff = s.factions[from];
  const get = deal.giveCredits + deal.giveTechs.reduce((a, id) => a + techValue(s, fa, id), 0);
  const give = deal.takeCredits + deal.takeTechs.reduce((a, id) => a + techValue(s, ff, id) , 0);
  const margin = 1.3 - s.attitude[ai][from] / 200; // 0.8 when friendly, 1.8 when hostile
  return get - give * margin;
}

export function dealValid(s: GameState, from: number, ai: number, deal: Deal): boolean {
  if (atWar(s, from, ai)) return false;
  const ff = s.factions[from];
  const fa = s.factions[ai];
  if (deal.giveCredits < 0 || deal.takeCredits < 0) return false;
  if (deal.giveCredits > ff.credits || deal.takeCredits > fa.credits) return false;
  const canGive = tradableTechs(s, from, ai);
  const canTake = tradableTechs(s, ai, from);
  if (!deal.giveTechs.every((id) => canGive.includes(id)) || !deal.takeTechs.every((id) => canTake.includes(id))) return false;
  return deal.giveCredits + deal.takeCredits + deal.giveTechs.length + deal.takeTechs.length > 0;
}

export function aiAcceptsDeal(s: GameState, from: number, ai: number, deal: Deal): boolean {
  if (!dealValid(s, from, ai, deal)) return false;
  if (deal.takeTechs.length && s.attitude[ai][from] < -20) return false;
  return dealBalance(s, from, ai, deal) >= 0;
}

// "from" proposes the deal to the AI faction "to". The deal takes effect only when it is valid and the AI accepts it.
export function proposeDeal(s: GameState, from: number, to: number, deal: Deal): boolean {
  if (!aiAcceptsDeal(s, from, to, deal)) return false;
  executeDeal(s, from, to, deal);
  return true;
}

function executeDeal(s: GameState, from: number, to: number, deal: Deal) {
  const ff = s.factions[from];
  const ft = s.factions[to];
  ff.credits += deal.takeCredits - deal.giveCredits;
  ft.credits += deal.giveCredits - deal.takeCredits;
  for (const id of deal.giveTechs) learn(s, ft, id);
  for (const id of deal.takeTechs) learn(s, ff, id);
  const bonus = Math.max(0, Math.min(10, Math.round(dealBalance(s, from, to, deal) / 20)));
  changeAttitude(s, to, from, 2 + bonus);
}

import { autoExplore, runAI } from './ai/ai';
import { empireIncome } from './economy';
import { ENGINE, debug, factionLabel } from './debug';
import { emit } from './events';
import { driftAttitudes } from './diplomacy';
import { forumTick } from './forum';
import { findPath, moveToward, refreshUnits, removeUnit } from './movement';
import { piratesTurn } from './pirates';
import { processPlanet } from './planet';
import { addScience } from './research';
import { log, ownedPlanets } from './rules';
import type { Faction, GameState } from './types';
import { UNITS } from './data/units';
import { checkConquest } from './victory';
import { updateExplored } from './visibility';

export const FORUM_LEADER_INFLUENCE = 3;
export const FORUM_MEMBER_INFLUENCE = 1;

// The start of a faction turn has a fixed order:
// 1. Income. Credits, influence and science come from the state before this turn: morale, technologies, planets.
// 2. Research. The science of step 1 can complete a technology.
// 3. Planets, in the order of their ids. Each planet uses the morale level and the empire science of step 1, and the
//    technologies after step 2. A new technology thus changes growth and production one turn before it changes income.
//    An Exodus Gate that completes here gives the Science victory at once.
// 4. Bankruptcy, then unit repair and new moves, attitude drift, and exploration.
export function startFactionTurn(s: GameState, f: Faction) {
  const inc = empireIncome(s, f);
  f.credits += inc.cred;
  f.influence += inc.inf;
  if (s.forum?.members.includes(f.id)) f.influence += s.forum.leader === f.id ? FORUM_LEADER_INFLUENCE : FORUM_MEMBER_INFLUENCE;
  addScience(s, f, inc.sci);
  f.lastIncome = { cred: inc.cred, sci: inc.sci, inf: inc.inf, morale: inc.morale.total };
  debug(s, 'major', ENGINE, () => `turn of ${factionLabel(f)} starts: income ${inc.cred.toFixed(1)} credits, ${inc.sci.toFixed(1)} science, ${inc.inf.toFixed(1)} influence, morale ${inc.morale.total} (${inc.morale.level})`);
  for (const p of ownedPlanets(s, f.id)) processPlanet(s, p, inc.morale.level, inc.sci);

  if (f.credits < 0) {
    // The faction cannot pay. It loses the unit with the highest cost.
    const mine = s.units.filter((u) => u.owner === f.id && UNITS[u.type].cls === 'military');
    const victim = mine.sort((a, b) => UNITS[b.type].cost - UNITS[a.type].cost)[0];
    if (victim && inc.cred < 0) {
      removeUnit(s, victim);
      emit(s, { kind: 'unitDestroyed', unit: victim.id, owner: f.id, type: victim.type, hex: victim.hex, by: -1 });
      log(s, f.id, `You cannot pay your fleet. Your ${UNITS[victim.type].name} was scrapped.`, victim.hex, 'bad');
    }
    f.credits = 0;
  }
  refreshUnits(s, f);
  if (!f.isHuman) driftAttitudes(s, f.id);
  updateExplored(s, f.id);
}

// Units with a "go to" order continue their move.
export function runOrders(s: GameState, f: Faction) {
  for (const u of s.units.filter((x) => x.owner === f.id)) {
    if (!s.units.includes(u)) continue;
    if (u.order?.kind === 'explore') {
      if (!autoExplore(s, u)) {
        u.order = undefined;
        log(s, f.id, `Your ${UNITS[u.type].name} has nothing more to explore.`, u.hex, 'info');
      }
      continue;
    }
    if (u.order?.kind !== 'goto') continue;
    const target = u.order.target;
    if (!findPath(s, u, target)) {
      u.order = undefined;
      continue;
    }
    const arrived = moveToward(s, u, target);
    if (arrived && s.units.includes(u)) u.order = undefined;
  }
}

// The human player ends the turn. All other factions act, then the next turn of the human starts.
// A victory takes effect at the transition that gives it, and the first victory stays: Conquest when a planet is
// captured, Science when the Exodus Gate completes, Forum at the election. The game stops at that point.
export function endTurn(s: GameState) {
  checkConquest(s);
  if (s.winner) return;
  for (const f of s.factions) {
    if (f.isHuman || f.isPirate || !f.alive) continue;
    startFactionTurn(s, f);
    if (s.winner) return;
    runAI(s, f);
    if (s.winner) return;
  }
  debug(s, 'major', ENGINE, () => 'turn of the pirates starts');
  piratesTurn(s);
  s.turn += 1;
  forumTick(s);
  if (s.winner) return;
  const human = s.factions.find((f) => f.isHuman);
  if (human?.alive) {
    startFactionTurn(s, human);
    if (s.winner) return;
    runOrders(s, human);
  }
}

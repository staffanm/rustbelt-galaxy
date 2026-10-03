// A debug log on the console for the actions of the engine and of the AI. The log shows hidden state, for example
// the positions and plans of other factions, so the level is "off" until the caller sets another level.
import { UNITS } from './data/units';
import type { GameEvent } from './events';
import { col, row } from './hex';
import type { BuildItem, Faction, GameState, Planet, Unit } from './types';

// major: decisions and results (war, research, production, attacks, captures, victory).
// minor: also the order of each unit, damage, growth, budget, routes.
// trace: also each step of a unit and each option that a decision compared.
export const DEBUG_LEVELS = ['off', 'major', 'minor', 'trace'] as const;
export type DebugLevel = (typeof DEBUG_LEVELS)[number];

let level = 0;
let sink: (line: string) => void = (line) => console.log(line);

export function setDebugLevel(l: DebugLevel) {
  level = Math.max(0, DEBUG_LEVELS.indexOf(l));
}

export function debugLevel(): DebugLevel {
  return DEBUG_LEVELS[level];
}

// Sends the lines to another function. Without an argument the lines go to console.log again.
export function setDebugSink(fn?: (line: string) => void) {
  sink = fn ?? ((line) => console.log(line));
}

export function debugOn(l: Exclude<DebugLevel, 'off'>): boolean {
  return level >= DEBUG_LEVELS.indexOf(l);
}

// Writes one line when the level is "l" or more verbose. "text" is a function, so a disabled level builds no text.
export function debug(s: GameState, l: Exclude<DebugLevel, 'off'>, who: string, text: () => string) {
  if (level >= DEBUG_LEVELS.indexOf(l)) sink(`[t${s.turn}] ${who}: ${text()}`);
}

export const ENGINE = 'Engine';

export function hexLabel(s: GameState, hex: number): string {
  return `@ ${col(s, hex)},${row(s, hex)}`;
}

export function factionLabel(f: Faction): string {
  return `#${f.id} (${f.name})`;
}

export function playerLabel(f: Faction): string {
  return `${f.isPirate ? 'Pirates' : f.isHuman ? 'Player' : 'AI player'} ${factionLabel(f)}`;
}

export function unitLabel(s: GameState, u: Unit): string {
  return `unit #${u.id} (${UNITS[u.type].name} ${hexLabel(s, u.hex)})`;
}

export function planetLabel(s: GameState, p: Planet): string {
  return `${p.name} (${hexLabel(s, p.hex)})`;
}

export function itemLabel(item: BuildItem): string {
  return `${item.kind} ${item.id}`;
}

const EVENT_LEVEL: Record<GameEvent['kind'], Exclude<DebugLevel, 'off'>> = {
  unitMoved: 'trace',
  unitDamaged: 'minor',
  unitDestroyed: 'major',
  planetDamaged: 'minor',
  planetCaptured: 'major',
  planetGrew: 'minor',
  borderGrew: 'minor',
  itemCompleted: 'major',
  colonyFounded: 'major',
  techLearned: 'major',
  techLost: 'major',
  warDeclared: 'major',
  peaceMade: 'major',
  forumJoined: 'major',
  factionEliminated: 'major',
};

function eventText(s: GameState, e: GameEvent): string {
  const fac = (id: number) => (id < 0 ? 'no faction' : factionLabel(s.factions[id]));
  const planet = (id: number) => planetLabel(s, s.planets[id]);
  switch (e.kind) {
    case 'unitMoved':
      return `unit #${e.unit} of ${fac(e.owner)} moved from ${hexLabel(s, e.from)} to ${hexLabel(s, e.to)}`;
    case 'unitDamaged':
      return `unit #${e.unit} of ${fac(e.owner)} lost ${e.amount} hit points ${hexLabel(s, e.hex)}`;
    case 'unitDestroyed':
      return `unit #${e.unit} (${UNITS[e.type].name}) of ${fac(e.owner)} was destroyed ${hexLabel(s, e.hex)} by ${fac(e.by)}`;
    case 'planetDamaged':
      return `${planet(e.planet)} of ${fac(e.owner)} lost ${e.amount} hit points, ${s.planets[e.planet].hp} left`;
    case 'planetCaptured':
      return `${fac(e.by)} captured ${planet(e.planet)} from ${fac(e.from)}`;
    case 'planetGrew':
      return `${planet(e.planet)} of ${fac(e.owner)} grew to population ${e.pop}`;
    case 'borderGrew':
      return `${planet(e.planet)} of ${fac(e.owner)} claimed the hex ${hexLabel(s, e.hex)}`;
    case 'itemCompleted':
      return `${planet(e.planet)} of ${fac(e.owner)} completed ${itemLabel(e.item)}`;
    case 'colonyFounded':
      return `${fac(e.owner)} founded a colony on ${planet(e.planet)}`;
    case 'techLearned':
      return `${fac(e.faction)} learned ${e.tech}`;
    case 'techLost':
      return `${fac(e.faction)} lost ${e.tech}`;
    case 'warDeclared':
      return `${fac(e.by)} declared war on ${fac(e.on)}`;
    case 'peaceMade':
      return `${fac(e.a)} and ${fac(e.b)} made peace`;
    case 'forumJoined':
      return `${fac(e.faction)} joined the Forum`;
    case 'factionEliminated':
      return `${fac(e.faction)} was eliminated by ${fac(e.by)}`;
  }
}

// Each event of the engine is also a line of the debug log.
export function debugEvent(s: GameState, e: GameEvent) {
  debug(s, EVENT_LEVEL[e.kind], ENGINE, () => eventText(s, e));
}

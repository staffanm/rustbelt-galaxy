// Events tell a consumer what happened in the core, as data. The user interface makes animations from them and the
// simulator makes statistics from them. Events are not part of the game state and are not saved. No rule reads them.
import { debugEvent, debugOn } from './debug';
import type { BuildItem, GameState } from './types';

type EventBody =
  | { kind: 'unitMoved'; unit: number; owner: number; from: number; to: number }
  | { kind: 'unitDamaged'; unit: number; owner: number; hex: number; amount: number }
  | { kind: 'unitDestroyed'; unit: number; owner: number; type: string; hex: number; by: number } // by: faction, -1 for none
  | { kind: 'planetDamaged'; planet: number; owner: number; amount: number }
  | { kind: 'planetCaptured'; planet: number; from: number; by: number }
  | { kind: 'planetGrew'; planet: number; owner: number; pop: number }
  | { kind: 'borderGrew'; planet: number; owner: number; hex: number }
  | { kind: 'itemCompleted'; planet: number; owner: number; item: BuildItem }
  | { kind: 'colonyFounded'; planet: number; owner: number }
  | { kind: 'techLearned'; faction: number; tech: string }
  | { kind: 'techLost'; faction: number; tech: string }
  | { kind: 'warDeclared'; by: number; on: number }
  | { kind: 'peaceMade'; a: number; b: number }
  | { kind: 'forumJoined'; faction: number }
  | { kind: 'factionEliminated'; faction: number; by: number };

export type GameEvent = EventBody & { turn: number };

const recorders = new WeakMap<GameState, GameEvent[]>();

// Starts to record the events of this state and returns the list. The consumer reads the list and empties it.
export function recordEvents(s: GameState): GameEvent[] {
  let list = recorders.get(s);
  if (!list) {
    list = [];
    recorders.set(s, list);
  }
  return list;
}

// Does nothing when no consumer records the events of this state and the debug log is off.
export function emit(s: GameState, e: EventBody) {
  const list = recorders.get(s);
  if (!list && !debugOn('major')) return;
  const event: GameEvent = { ...e, turn: s.turn };
  list?.push(event);
  debugEvent(s, event);
}

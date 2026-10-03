import { ENGINE, debug, factionLabel } from './debug';
import { realFactions } from './rules';
import type { GameState } from './types';

// Conquest: one faction holds half of all home planets, its own included, and 3 or more.
export function homesNeeded(s: GameState): number {
  const n = realFactions(s).length;
  return Math.min(n, Math.max(3, Math.ceil(n / 2)));
}

export function homesHeld(s: GameState, f: number): number {
  return s.planets.filter((p) => p.homeOf >= 0 && p.owner === f).length;
}

export function checkConquest(s: GameState) {
  if (s.winner || realFactions(s).length < 2) return;
  const need = homesNeeded(s);
  for (const f of realFactions(s)) {
    if (f.alive && homesHeld(s, f.id) >= need) {
      s.winner = { faction: f.id, kind: 'conquest', turn: s.turn };
      debug(s, 'major', ENGINE, () => `${factionLabel(f)} wins by Conquest with ${homesHeld(s, f.id)} home planets`);
      return;
    }
  }
}

export function score(s: GameState, f: number): number {
  const fac = s.factions[f];
  let total = fac.techs.length * 6;
  for (const p of s.planets) if (p.owner === f) total += 10 + p.pop * 3 + p.buildings.length * 2;
  return total;
}

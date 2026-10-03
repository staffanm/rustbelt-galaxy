import { SPECIES } from './data/species';
import { TECHS } from './data/techs';
import { emit } from './events';
import { canResearch, log, techAvailable, techCost, techPrereqs } from './rules';
import type { Faction, GameState } from './types';

// The technologies that the faction must research to get the target, in a valid order, the target last.
export function researchPath(f: Faction, target: string): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    if (f.techs.includes(id) || out.includes(id) || !techAvailable(f, id)) return;
    for (const p of techPrereqs(f, id)) visit(p);
    out.push(id);
  };
  visit(target);
  return out;
}

export function setResearch(s: GameState, f: Faction, target: string) {
  const path = researchPath(f, target);
  if (!path.length) return;
  f.researching = path[0];
  f.researchQueue = path.slice(1);
  usePool(f);
}

function usePool(f: Faction) {
  const pool = f.researchProgress._pool ?? 0;
  if (pool && f.researching) {
    f.researchProgress[f.researching] = (f.researchProgress[f.researching] ?? 0) + pool;
    f.researchProgress._pool = 0;
  }
}

export function learn(s: GameState, f: Faction, id: string) {
  if (f.techs.includes(id)) return;
  f.techs.push(id);
  emit(s, { kind: 'techLearned', faction: f.id, tech: id });
  delete f.researchProgress[id];
  f.researchQueue = f.researchQueue.filter((q) => q !== id);
  if (f.researching === id) f.researching = undefined;
}

// A technology that the faction can lose: no other technology of the faction needs it, and it is not a start technology.
export function losableTechs(f: Faction): string[] {
  const start = SPECIES[f.species].startTechs ?? [];
  return f.techs.filter((id) => !start.includes(id) && !f.techs.some((o) => TECHS[o].prereqs.includes(id)));
}

// Removes a technology. Research that needs it starts again from the lost technology.
export function forget(s: GameState, f: Faction, id: string) {
  if (!f.techs.includes(id)) return;
  f.techs = f.techs.filter((t) => t !== id);
  emit(s, { kind: 'techLost', faction: f.id, tech: id });
  const target = f.researchQueue[f.researchQueue.length - 1] ?? f.researching;
  if (target && [f.researching, ...f.researchQueue].some((t) => t && TECHS[t].prereqs.includes(id))) {
    f.researching = undefined;
    f.researchQueue = [];
    setResearch(s, f, target);
  }
}

export function addScience(s: GameState, f: Faction, amount: number) {
  if (!f.researching) {
    while (f.researchQueue.length && !f.researching) {
      const next = f.researchQueue.shift()!;
      if (canResearch(f, next)) f.researching = next;
    }
  }
  if (!f.researching) {
    f.researchProgress._pool = (f.researchProgress._pool ?? 0) + amount;
    return;
  }
  usePool(f);
  const id = f.researching;
  f.researchProgress[id] = (f.researchProgress[id] ?? 0) + amount;
  const cost = techCost(s, f, id);
  if (f.researchProgress[id] >= cost) {
    const over = f.researchProgress[id] - cost;
    learn(s, f, id);
    log(s, f.id, `Research complete: ${TECHS[id].name}.`, undefined, 'good');
    f.researchProgress._pool = (f.researchProgress._pool ?? 0) + over;
    while (f.researchQueue.length && !f.researching) {
      const next = f.researchQueue.shift()!;
      if (canResearch(f, next)) f.researching = next;
    }
    usePool(f);
  }
}

export function researchOptions(f: Faction): string[] {
  return Object.keys(TECHS).filter((id) => canResearch(f, id));
}

import type { GameState } from './types';

// mulberry32. The state is one integer stored in the game state, so a loaded game continues the same sequence.
export function nextFloat(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(s: GameState | { rng: number }): number {
  return nextFloat(s);
}

export function randInt(s: { rng: number }, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}

export function pick<T>(s: { rng: number }, items: readonly T[]): T {
  return items[Math.floor(nextFloat(s) * items.length)];
}

export function shuffle<T>(s: { rng: number }, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(s) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

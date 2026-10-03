import { decodeSave, encodeSave, type SaveFile } from '../core/persist';
import type { GameState } from '../core/types';

const PREFIX = 'rustbelt-galaxy:';
export const AUTOSAVE = 'autosave';
export const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4'];

export interface SaveInfo {
  slot: string;
  turn: number;
  faction: string;
  date: string;
}

export function saveGame(slot: string, s: GameState): boolean {
  const file = encodeSave(s, new Date().toISOString());
  try {
    localStorage.setItem(PREFIX + slot, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

function read(slot: string): SaveFile | null {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    return decodeSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadGame(slot: string): GameState | null {
  return read(slot)?.state ?? null;
}

export function saveInfo(slot: string): SaveInfo | null {
  const file = read(slot);
  if (!file) return null;
  const human = file.state.factions.find((f) => f.isHuman);
  return { slot, turn: file.state.turn, faction: human?.name ?? '', date: file.date };
}

export function deleteSave(slot: string) {
  localStorage.removeItem(PREFIX + slot);
}

export function exportGame(s: GameState) {
  const file = encodeSave(s, new Date().toISOString());
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rustbelt-galaxy-turn-${s.turn}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importGame(file: File): Promise<GameState | null> {
  return file
    .text()
    .then((text) => decodeSave(JSON.parse(text))?.state ?? null)
    .catch(() => null);
}

// Save files: encode, decode, migrate and validate. This module has no dependency on the browser.
import { BUILDINGS, PROJECTS } from './data/buildings';
import { DIFFICULTIES, GALAXY_SIZES, SPECIES } from './data/species';
import { TECHS } from './data/techs';
import { PLANET_TYPES, RESOURCES, TERRAIN } from './data/terrain';
import { UNITS } from './data/units';
import { SAVE_VERSION } from './game';
import type { GameState } from './types';

export interface SaveFile {
  version: number;
  date: string;
  state: GameState;
}

export function encodeSave(s: GameState, date: string): SaveFile {
  return { version: SAVE_VERSION, date, state: s };
}

const RENAMED_TECHS: Record<string, string> = { warrior_caste: 'blessed_hulls' };

// MIGRATIONS[n] changes a state of version n into a state of version n + 1. A change of the state format adds one
// entry here and adds 1 to SAVE_VERSION.
const MIGRATIONS: Record<number, (s: GameState) => void> = {
  // Version 1 had saves without the budget and with the old id of Blessed Hulls.
  1(s) {
    for (const f of s.factions) {
      f.budget ??= { research: 0, welfare: 0 };
      f.techs = f.techs.map((t) => RENAMED_TECHS[t] ?? t);
      f.researchQueue = f.researchQueue.map((t) => RENAMED_TECHS[t] ?? t);
      if (f.researching && RENAMED_TECHS[f.researching]) f.researching = RENAMED_TECHS[f.researching];
      for (const [a, b] of Object.entries(RENAMED_TECHS)) {
        if (f.researchProgress[a] !== undefined) {
          f.researchProgress[b] = f.researchProgress[a];
          delete f.researchProgress[a];
        }
      }
    }
  },
};

// Reads the data of a save file. Returns null when the data is not a save of this game, is from a later version, or
// fails the validation after the migrations.
export function decodeSave(data: unknown): SaveFile | null {
  const file = data as SaveFile | null;
  if (!file || typeof file !== 'object' || !file.state || typeof file.state !== 'object') return null;
  if (!Number.isInteger(file.version) || file.version < 1 || file.version > SAVE_VERSION) return null;
  try {
    for (let v = file.version; v < SAVE_VERSION; v++) MIGRATIONS[v](file.state);
  } catch {
    return null;
  }
  file.version = SAVE_VERSION;
  file.state.version = SAVE_VERSION;
  if (validateState(file.state)) return null;
  return file;
}

// The first problem in the state, or null when the state is valid.
export function validateState(s: GameState): string | null {
  try {
    check(s);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function need(ok: boolean, what: string): asserts ok {
  if (!ok) throw new Error(what);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isBudget = (v: unknown) => isInt(v) && v >= 0 && v <= 100;

function check(s: GameState) {
  const index = (v: unknown, length: number) => isInt(v) && v >= 0 && v < length;
  const list = (v: unknown, what: string): unknown[] => {
    need(Array.isArray(v), `${what} is not a list`);
    return v as unknown[];
  };

  need(isInt(s.turn) && s.turn >= 1, 'turn');
  need(isInt(s.rng), 'rng');
  need(isInt(s.width) && s.width > 0 && isInt(s.height) && s.height > 0, 'dimensions');
  need(isInt(s.nextUnitId) && s.nextUnitId >= 1, 'nextUnitId');
  need(!!s.settings && s.settings.galaxy in GALAXY_SIZES, 'settings.galaxy');
  need(index(s.settings.difficulty, DIFFICULTIES.length), 'settings.difficulty');
  need(s.settings.playerSpecies in SPECIES, 'settings.playerSpecies');

  const hexes = list(s.hexes, 'hexes').length;
  need(hexes === s.width * s.height, 'hex count');
  const planets = list(s.planets, 'planets').length;
  const factions = list(s.factions, 'factions').length;
  need(factions >= 2 && s.factions[factions - 1].isPirate === true, 'the last faction is the pirate faction');
  const owner = (v: unknown) => v === -1 || index(v, factions);

  s.hexes.forEach((h, i) => {
    need(!!h && h.terrain in TERRAIN, `hex ${i} terrain`);
    need(h.resource === undefined || h.resource in RESOURCES, `hex ${i} resource`);
    need(h.owner === undefined || index(h.owner, planets), `hex ${i} owner`);
    need(h.planetId === undefined || (index(h.planetId, planets) && s.planets[h.planetId].hex === i), `hex ${i} planet`);
  });

  s.planets.forEach((p, i) => {
    const what = `planet ${i}`;
    need(!!p && p.id === i, `${what} id`);
    need(index(p.hex, hexes) && s.hexes[p.hex].planetId === i, `${what} hex`);
    need(p.type in PLANET_TYPES, `${what} type`);
    need(owner(p.owner) && owner(p.homeOf), `${what} owner`);
    need(isInt(p.pop) && p.pop >= (p.owner >= 0 ? 1 : 0), `${what} population`);
    for (const v of [p.food, p.prodStore, p.borderProgress, p.hp, p.garrisonHp, p.founded]) need(isNum(v), `${what} numbers`);
    need(typeof p.name === 'string', `${what} name`);
    for (const b of list(p.buildings, `${what} buildings`)) need((b as string) in BUILDINGS, `${what} building ${b}`);
    for (const q of list(p.queue, `${what} queue`) as GameState['planets'][number]['queue']) {
      const table = q?.kind === 'unit' ? UNITS : q?.kind === 'building' ? BUILDINGS : q?.kind === 'project' ? PROJECTS : null;
      need(!!table && q.id in table, `${what} queue item`);
    }
    for (const r of list(p.routes, `${what} routes`)) need(index(r, planets) && r !== i, `${what} route`);
    for (const h of [...list(p.worked, `${what} worked`), ...list(p.locked, `${what} locked`)]) need(index(h, hexes), `${what} worked hex`);
  });

  const unitIds = new Set<number>();
  list(s.units, 'units');
  s.units.forEach((u, i) => {
    const what = `unit ${i}`;
    need(!!u && isInt(u.id) && u.id >= 1 && u.id < s.nextUnitId && !unitIds.has(u.id), `${what} id`);
    unitIds.add(u.id);
    need(u.type in UNITS, `${what} type`);
    need(index(u.owner, factions), `${what} owner`);
    need(index(u.hex, hexes), `${what} hex`);
    need(isNum(u.hp) && u.hp > 0 && isNum(u.moves) && u.moves >= 0 && typeof u.attacked === 'boolean', `${what} numbers`);
    const o = u.order;
    need(o === undefined || ['goto', 'build', 'sleep', 'fortify', 'explore'].includes(o.kind), `${what} order`);
    need(o?.kind !== 'goto' || index(o.target, hexes), `${what} order target`);
    need(o?.kind !== 'build' || isInt(o.turnsLeft), `${what} order turns`);
  });

  s.factions.forEach((f, i) => {
    const what = `faction ${i}`;
    need(!!f && f.id === i, `${what} id`);
    need(f.species in SPECIES && f.isPirate === (f.species === 'pirates'), `${what} species`);
    need(typeof f.isHuman === 'boolean' && typeof f.alive === 'boolean', `${what} flags`);
    need(typeof f.name === 'string' && typeof f.leader === 'string' && typeof f.color === 'string', `${what} texts`);
    need(isNum(f.credits) && isNum(f.influence), `${what} numbers`);
    const techs = list(f.techs, `${what} techs`);
    need(new Set(techs).size === techs.length, `${what} has a technology twice`);
    for (const t of [...techs, ...list(f.researchQueue, `${what} research queue`)]) need((t as string) in TECHS, `${what} technology ${t}`);
    need(f.researching === undefined || f.researching in TECHS, `${what} researching`);
    need(!!f.researchProgress && Object.values(f.researchProgress).every(isNum), `${what} research progress`);
    const explored = list(f.explored, `${what} explored`).length;
    need(explored === hexes || (f.isPirate && explored === 0), `${what} explored length`);
    for (const m of list(f.met, `${what} met`)) need(index(m, factions) && m !== i, `${what} met`);
    need(!!f.lobby && !!f.envoys && typeof f.lobby === 'object' && typeof f.envoys === 'object', `${what} lobby and envoys`);
    need(!!f.budget && isBudget(f.budget.research) && isBudget(f.budget.welfare), `${what} budget`);
    need(f.budget.research + f.budget.welfare <= 100, `${what} budget sum`);
    need(!!f.lastIncome && [f.lastIncome.cred, f.lastIncome.sci, f.lastIncome.inf, f.lastIncome.morale].every(isNum), `${what} last income`);
  });

  need(!!s.pairs && typeof s.pairs === 'object', 'pairs');
  for (const [key, p] of Object.entries(s.pairs)) {
    const [a, b] = key.split('-').map(Number);
    need(index(a, factions) && index(b, factions) && a < b && key === `${a}-${b}`, `pair ${key}`);
    need(!!p && typeof p.atWar === 'boolean' && typeof p.openBorders === 'boolean' && isInt(p.lastChange), `pair ${key} state`);
    need(p.peaceOfferedBy === undefined || p.peaceOfferedBy === a || p.peaceOfferedBy === b, `pair ${key} offer`);
  }

  need(list(s.attitude, 'attitude').length === factions, 'attitude size');
  for (const row of s.attitude) need(Array.isArray(row) && row.length === factions && row.every(isNum), 'attitude row');

  if (s.forum !== null) {
    const m = s.forum;
    need(!!m && index(m.founder, factions) && index(m.host, planets), 'forum founder and host');
    for (const id of list(m.members, 'forum members')) need(index(id, factions), 'forum member');
    need(m.leader === -1 || index(m.leader, factions), 'forum leader');
    need(isInt(m.nextElection) && !!m.lastVotes && typeof m.lastVotes === 'object', 'forum election');
  }
  if (s.winner !== null) {
    need(!!s.winner && index(s.winner.faction, factions) && isInt(s.winner.turn), 'winner');
    need(['conquest', 'science', 'forum'].includes(s.winner.kind), 'winner kind');
  }
  for (const l of list(s.log, 'log') as GameState['log']) need(!!l && typeof l.text === 'string' && isInt(l.turn), 'log entry');
}

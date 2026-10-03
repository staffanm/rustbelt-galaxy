import { GALAXY_SIZES, PLAYABLE, SPECIES } from './data/species';
import { generateMap } from './mapgen';
import { createUnit, settle, spawnHex } from './planet';
import { shuffle } from './rng';
import { resolveUnit } from './rules';
import type { Faction, GameSettings, GameState, SpeciesId } from './types';
import { updateExplored } from './visibility';

// The version of the state format. A change of the format needs a migration in persist.ts.
export const SAVE_VERSION = 3;

function newFaction(id: number, species: SpeciesId, isHuman: boolean, hexCount: number): Faction {
  const def = SPECIES[species];
  return {
    id,
    species,
    name: def.name,
    leader: def.leader,
    color: def.color,
    isHuman,
    isPirate: species === 'pirates',
    alive: true,
    credits: species === 'pirates' ? 0 : 60,
    influence: 0,
    techs: [],
    researchProgress: {},
    researchQueue: [],
    explored: new Array(hexCount).fill(0),
    met: [],
    lobby: {},
    envoys: {},
    budget: { research: 0, welfare: 0 },
    lastIncome: { cred: 0, sci: 0, inf: 0, morale: 0 },
  };
}

export function newGame(settings: GameSettings): GameState {
  const size = GALAXY_SIZES[settings.galaxy];
  const opponents = Math.max(1, Math.min(size.maxOpponents, settings.opponents));
  const count = opponents + 1;
  const r = { rng: settings.seed | 0 };
  const map = generateMap(r, size.width, size.height, size.systems, count);
  const others = shuffle(r, PLAYABLE.filter((sp) => sp !== settings.playerSpecies)).slice(0, opponents);
  const species: SpeciesId[] = [settings.playerSpecies, ...others];
  const n = map.hexes.length;
  const factions = species.map((sp, i) => newFaction(i, sp, i === 0, n));
  factions.push(newFaction(count, 'pirates', false, 0));

  const s: GameState = {
    version: SAVE_VERSION,
    settings: { ...settings, opponents },
    rng: r.rng,
    turn: 1,
    width: map.width,
    height: map.height,
    hexes: map.hexes,
    planets: map.planets,
    units: [],
    factions,
    nextUnitId: 1,
    pairs: {},
    attitude: factions.map(() => factions.map(() => 0)),
    forum: null,
    winner: null,
    log: [],
    scores: [],
  };

  for (let f = 0; f < count; f++) {
    for (const id of SPECIES[species[f]].startTechs ?? []) s.factions[f].techs.push(id);
    const home = s.planets[map.homes[f]];
    home.name = SPECIES[species[f]].homeName;
    settle(s, home, f, 2);
    home.buildings.push('cantina');
    for (const base of ['scout', 'corvette', 'colony_ship']) {
      const def = resolveUnit(s.factions[f], base);
      const hex = spawnHex(s, home, def);
      if (hex >= 0) createUnit(s, f, def.id, hex);
    }
  }
  for (let f = 0; f < count; f++) updateExplored(s, f);
  return s;
}

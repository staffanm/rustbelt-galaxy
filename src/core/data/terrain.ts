import type { PlanetTypeId, ResourceId, TerrainId, YieldKey, Yields } from '../types';

export function y(food = 0, prod = 0, sci = 0, cred = 0, inf = 0): Yields {
  return { food, prod, sci, cred, inf };
}

export const YIELD_KEYS: YieldKey[] = ['food', 'prod', 'sci', 'cred', 'inf'];

export const YIELD_NAMES: Record<YieldKey, string> = {
  food: 'Food',
  prod: 'Production',
  sci: 'Science',
  cred: 'Credits',
  inf: 'Influence',
};

export interface TerrainDef {
  id: TerrainId;
  name: string;
  yields: Yields;
  station: Yields; // added when a station is on the hex
  stationName: string;
  moveCost: number; // 0 = impassable
  defence: number; // strength bonus for a defender, as a share
  blocksSight: boolean; // units inside are hidden from more than 1 hex away
  workable: boolean;
  text: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  space: {
    id: 'space',
    name: 'Open Space',
    yields: y(0, 0, 0, 1),
    station: y(0, 0, 0, 2),
    stationName: 'Solar Array',
    moveCost: 1,
    defence: 0,
    blocksSight: false,
    workable: true,
    text: 'Mostly nothing. The little that exists pays a toll.',
  },
  asteroids: {
    id: 'asteroids',
    name: 'Asteroid Field',
    yields: y(0, 2),
    station: y(0, 2),
    stationName: 'Mining Rig',
    moveCost: 2,
    defence: 0.25,
    blocksSight: false,
    workable: true,
    text: 'Rocks with metal in them. Good cover, bad paintwork.',
  },
  nebula: {
    id: 'nebula',
    name: 'Nebula',
    yields: y(0, 0, 2),
    station: y(0, 0, 2),
    stationName: 'Sensor Buoy',
    moveCost: 2,
    defence: 0.25,
    blocksSight: true,
    workable: true,
    text: 'Glowing gas. Scientists love it. Navigators file complaints.',
  },
  ice: {
    id: 'ice',
    name: 'Ice Field',
    yields: y(2, 0),
    station: y(2, 0),
    stationName: 'Ice Harvester',
    moveCost: 1,
    defence: 0,
    blocksSight: false,
    workable: true,
    text: 'Frozen water and comet dust. It becomes lunch after treatment.',
  },
  debris: {
    id: 'debris',
    name: 'Debris Field',
    yields: y(0, 1, 1),
    station: y(0, 1, 1),
    stationName: 'Salvage Dock',
    moveCost: 1,
    defence: 0.1,
    blocksSight: false,
    workable: true,
    text: 'The remains of an older and more confident civilization.',
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    yields: y(1, 1),
    station: y(1, 1),
    stationName: 'Moon Base',
    moveCost: 1,
    defence: 0.1,
    blocksSight: false,
    workable: true,
    text: 'A small grey rock with a good view of a better rock.',
  },
  star: {
    id: 'star',
    name: 'Star',
    yields: y(0, 0, 1, 2),
    station: y(),
    stationName: '',
    moveCost: 0,
    defence: 0,
    blocksSight: false,
    workable: true,
    text: 'Large, hot, and not open to visitors. Its energy sells well.',
  },
  rift: {
    id: 'rift',
    name: 'Void Rift',
    yields: y(),
    station: y(),
    stationName: '',
    moveCost: 1,
    defence: 0,
    blocksSight: false,
    workable: false,
    text: 'Space with the bottom fallen out. A ship needs a Hyperdrive to cross. Something lives in it, and it does not need a drive.',
  },
  planet: {
    id: 'planet',
    name: 'Planet',
    yields: y(),
    station: y(),
    stationName: '',
    moveCost: 1,
    defence: 0,
    blocksSight: false,
    workable: false,
    text: 'A place to live, with gravity included in the price.',
  },
};

export interface PlanetTypeDef {
  id: PlanetTypeId;
  name: string;
  yields: Yields;
  popCap: number;
  terraformTo?: PlanetTypeId;
  text: string;
}

export const PLANET_TYPES: Record<PlanetTypeId, PlanetTypeDef> = {
  terran: {
    id: 'terran',
    name: 'Terran',
    yields: y(3, 2, 0, 2),
    popCap: 10,
    text: 'Air, water, and soil. The previous tenants left it in fair condition.',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    yields: y(4, 1, 1, 1),
    popCap: 9,
    terraformTo: 'terran',
    text: 'Water from pole to pole. The fishing is good and the basements are not.',
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    yields: y(1, 3, 0, 1),
    popCap: 6,
    terraformTo: 'terran',
    text: 'Sand, ore, and sunburn.',
  },
  ice: {
    id: 'ice',
    name: 'Ice World',
    yields: y(1, 1, 2, 0),
    popCap: 6,
    terraformTo: 'ocean',
    text: 'Cold enough to preserve samples and colonists equally well.',
  },
  volcanic: {
    id: 'volcanic',
    name: 'Volcanic',
    yields: y(0, 4, 0, 0),
    popCap: 5,
    terraformTo: 'desert',
    text: 'The ground is rich in metals and occasionally airborne.',
  },
  barren: {
    id: 'barren',
    name: 'Barren',
    yields: y(0, 2, 1, 0),
    popCap: 4,
    terraformTo: 'desert',
    text: 'No air, no water, no complaints from the neighbours.',
  },
  gas: {
    id: 'gas',
    name: 'Gas Giant',
    yields: y(0, 1, 1, 3),
    popCap: 5,
    text: 'No surface. Colonists live in floating platforms and sell fuel.',
  },
};

export interface ResourceDef {
  id: ResourceId;
  name: string;
  kind: 'strategic' | 'luxury';
  terrains: TerrainId[];
  bonus: Yields; // added when a station is on the hex
  text: string;
}

export const LUXURY_MORALE = 3;

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  helium3: {
    id: 'helium3',
    name: 'Helium-3',
    kind: 'strategic',
    terrains: ['nebula', 'ice', 'moon'],
    bonus: y(0, 1, 0, 1),
    text: 'Fuel for cruiser reactors. It also makes voices funny, which is not the main use.',
  },
  neutronium: {
    id: 'neutronium',
    name: 'Neutronium',
    kind: 'strategic',
    terrains: ['asteroids', 'debris'],
    bonus: y(0, 2),
    text: 'Very dense metal for very large hulls. Do not drop it on a foot.',
  },
  antimatter: {
    id: 'antimatter',
    name: 'Antimatter',
    kind: 'strategic',
    terrains: ['nebula', 'space', 'debris'],
    bonus: y(0, 0, 2, 1),
    text: 'Power for dreadnoughts and gates. Storage instructions are one word: carefully.',
  },
  void_coffee: {
    id: 'void_coffee',
    name: 'Void Coffee',
    kind: 'luxury',
    terrains: ['ice', 'moon'],
    bonus: y(1, 0, 0, 1),
    text: 'Grown in low gravity. Crews refuse to fly without it.',
  },
  singing_crystals: {
    id: 'singing_crystals',
    name: 'Singing Crystals',
    kind: 'luxury',
    terrains: ['asteroids'],
    bonus: y(0, 0, 0, 2),
    text: 'They hum one note for ever. Collectors pay well for a second note.',
  },
  vintage_scrap: {
    id: 'vintage_scrap',
    name: 'Vintage Scrap',
    kind: 'luxury',
    terrains: ['debris'],
    bonus: y(0, 1, 0, 1),
    text: 'Antique machine parts. Rust is part of the value.',
  },
  spice_gas: {
    id: 'spice_gas',
    name: 'Spice Gas',
    kind: 'luxury',
    terrains: ['nebula'],
    bonus: y(0, 0, 0, 2),
    text: 'A nebula extract that makes ration bars taste of something.',
  },
};

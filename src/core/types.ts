// All game state is plain JSON data. Save and load is JSON.stringify and JSON.parse.

export type TerrainId =
  | 'space'
  | 'asteroids'
  | 'nebula'
  | 'ice'
  | 'debris'
  | 'moon'
  | 'star'
  | 'rift'
  | 'planet';

export type PlanetTypeId = 'terran' | 'ocean' | 'desert' | 'ice' | 'volcanic' | 'barren' | 'gas';

export type ResourceId =
  | 'helium3'
  | 'neutronium'
  | 'antimatter'
  | 'void_coffee'
  | 'singing_crystals'
  | 'vintage_scrap'
  | 'spice_gas';

export type YieldKey = 'food' | 'prod' | 'sci' | 'cred' | 'inf';
export type Yields = Record<YieldKey, number>;

export type TechCategory = 'propulsion' | 'military' | 'economy' | 'science' | 'society' | 'colonization';

export type SpeciesId =
  | 'terran'
  | 'krogg'
  | 'ilthari'
  | 'ozmok'
  | 'seren'
  | 'plodd'
  | 'vessani'
  | 'sarn'
  | 'nullset'
  | 'manyfold'
  | 'ashari'
  | 'halcyon'
  | 'pirates';

export type VictoryKind = 'conquest' | 'science' | 'forum';

// A modifier is one numeric effect. Species traits and technologies use all kinds. Buildings use the PlanetMod kinds.
export type Mod =
  | { kind: 'yieldMult'; yield: YieldKey; value: number } // empire: +value share of that yield
  | { kind: 'yieldFlat'; yield: YieldKey; value: number } // per planet flat yield
  | { kind: 'buildingFlatMult'; yield: YieldKey; value: number } // multiplies flat building yields of that type
  | { kind: 'unitCostMult'; value: number }
  | { kind: 'buildingCostMult'; value: number }
  | { kind: 'purchaseCostMult'; value: number }
  | { kind: 'techCostMult'; category: TechCategory; value: number }
  | { kind: 'strengthMult'; value: number } // all units
  | { kind: 'rangedStrengthMult'; value: number }
  | { kind: 'planetStrengthMult'; value: number }
  | { kind: 'planetHp'; value: number }
  | { kind: 'groundMult'; value: number }
  | { kind: 'driveLevel'; value: number } // +1 move per level, level 2 crosses rifts
  | { kind: 'sight'; value: number }
  | { kind: 'morale'; value: number } // empire flat (tech, trait) or planet flat (building)
  | { kind: 'moralePerPlanet'; value: number } // changes the penalty per planet
  | { kind: 'tradeSlots'; value: number }
  | { kind: 'tradeYieldMult'; value: number }
  | { kind: 'tradeInfluenceMult'; value: number }
  | { kind: 'unitUpkeepMult'; value: number }
  | { kind: 'unitHeal'; value: number }
  | { kind: 'killBounty'; value: number } // share of the unit cost paid in credits for a kill
  | { kind: 'anomalyMult'; value: number }
  | { kind: 'attitudeBase'; value: number } // other factions like this faction more or less
  | { kind: 'lobbyCostMult'; value: number }
  | { kind: 'growthMult'; value: number }
  | { kind: 'popCap'; value: number }
  | { kind: 'garrison'; value: number }
  | { kind: 'unitProdMult'; value: number } // production bonus when the planet builds units
  | { kind: 'stationSpeed'; value: number } // turns removed from station build time
  | { kind: 'terrainYield'; terrain: TerrainId; yield: YieldKey; value: number }
  | { kind: 'killScience'; value: number } // share of the destroyed unit cost paid in science
  | { kind: 'captureTech'; value: number } // technologies learned from the old owner when a planet is captured
  | { kind: 'ignoreBorders'; value: number } // units enter closed borders in peace
  | { kind: 'infiltrate'; value: number } // ground troops invade a planet with its defences up, at this share of their strength
  | { kind: 'foodPerPop'; value: number } // change of the food that each population unit eats
  | { kind: 'moralePerPop'; value: number } // change of the morale penalty per population unit
  | { kind: 'homeStrengthMult'; value: number } // strength bonus for all units inside own borders
  | { kind: 'luxuryMorale'; value: number } // extra morale for each luxury resource
  | { kind: 'hostCredits'; value: number } // extra credits for each foreign trade route that ends at one of your planets
  | { kind: 'colonize'; types: PlanetTypeId[] }
  | { kind: 'reveal'; resource: ResourceId }
  | { kind: 'station'; terrains: TerrainId[] };

// The modifiers that a building can have. Each kind has a planet rule that reads it with planetModSum.
export type PlanetModKind = 'morale' | 'tradeSlots' | 'popCap' | 'planetHp' | 'planetStrengthMult' | 'garrison' | 'unitProdMult';
export type PlanetMod = Extract<Mod, { kind: PlanetModKind }>;

export interface Hex {
  terrain: TerrainId;
  resource?: ResourceId;
  station?: boolean;
  owner?: number; // planet id that owns this hex
  planetId?: number; // planet located on this hex
  anomaly?: boolean;
  den?: boolean; // pirate den
}

export type BuildItem =
  | { kind: 'unit'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'project'; id: string };

export interface Planet {
  id: number;
  name: string;
  hex: number;
  type: PlanetTypeId;
  owner: number; // faction index, -1 when not colonized
  homeOf: number; // faction index whose home planet this was at game start, -1 for none
  pop: number;
  food: number;
  prodStore: number;
  queue: BuildItem[];
  buildings: string[];
  worked: number[]; // hex indices worked by population
  locked: number[]; // hex indices the player fixed by hand
  borderProgress: number;
  hp: number;
  garrisonHp: number;
  routes: number[]; // destination planet ids
  founded: number; // turn
}

export type UnitOrder =
  | { kind: 'goto'; target: number }
  | { kind: 'build'; turnsLeft: number }
  | { kind: 'sleep' }
  | { kind: 'fortify' }
  | { kind: 'explore' };

export interface Unit {
  id: number;
  type: string;
  owner: number;
  hex: number;
  hp: number;
  moves: number;
  attacked: boolean;
  order?: UnitOrder;
}

export type BudgetKey = 'research' | 'welfare';

export interface Faction {
  id: number;
  species: SpeciesId;
  name: string;
  leader: string;
  color: string;
  isHuman: boolean;
  isPirate: boolean;
  alive: boolean;
  credits: number;
  influence: number;
  techs: string[];
  researching?: string;
  researchProgress: Record<string, number>;
  researchQueue: string[];
  explored: number[]; // 0 or 1 per hex
  met: number[]; // faction ids
  lobby: Record<number, number>; // influence spent on each voter before the next election
  envoys: Record<number, number>; // turn of the last envoy mission to each faction
  budget: Record<BudgetKey, number>; // shares of the credit surplus, 0 to 100 in steps of 10
  vote?: number; // a human player's choice for the next Forum election, undefined for itself
  lastIncome: { cred: number; sci: number; inf: number; morale: number };
}

export interface PairState {
  atWar: boolean;
  openBorders: boolean;
  lastChange: number; // turn of the last war or peace change
  peaceOfferedBy?: number; // faction that offered peace and waits for an answer
}

export interface Forum {
  founder: number;
  host: number; // planet id
  members: number[];
  leader: number; // -1 when no leader
  nextElection: number; // turn
  lastVotes: Record<number, number>; // voter -> candidate
}

export interface LogEntry {
  turn: number;
  faction: number; // receiver, -1 for all
  text: string;
  hex?: number;
  tone?: 'good' | 'bad' | 'info';
}

export interface GameSettings {
  galaxy: 'small' | 'medium' | 'large';
  opponents: number;
  difficulty: number; // index into DIFFICULTIES
  playerSpecies: SpeciesId;
  seed: number;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  rng: number;
  turn: number;
  width: number;
  height: number;
  hexes: Hex[];
  planets: Planet[];
  units: Unit[];
  factions: Faction[];
  nextUnitId: number;
  pairs: Record<string, PairState>; // key "a-b" with a < b
  attitude: number[][]; // attitude[a][b] = how much a likes b, -100 to 100
  forum: Forum | null;
  winner: { faction: number; kind: VictoryKind; turn: number } | null;
  log: LogEntry[];
  scores: number[][]; // the score of each real faction at the end of each turn, for the graph at the end
}

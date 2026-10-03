import { RESOURCES } from './data/terrain';
import { distance, index, neighbors, ring, within, type Grid } from './hex';
import { nextFloat, pick, randInt, shuffle } from './rng';
import type { Hex, Planet, PlanetTypeId, ResourceId, TerrainId } from './types';

export interface GeneratedMap {
  width: number;
  height: number;
  hexes: Hex[];
  planets: Planet[];
  homes: number[]; // planet id per faction
  starNames: Record<number, string>;
}

const STAR_NAMES = [
  'Vega', 'Altair', 'Rigel', 'Mira', 'Deneb', 'Kochab', 'Sabik', 'Thuban', 'Merak', 'Izar', 'Naos', 'Alya',
  'Hadar', 'Wezen', 'Tarf', 'Zosma', 'Acrux', 'Gomeisa', 'Pherkad', 'Rasalas', 'Sadr', 'Tania', 'Ukdah', 'Yildun',
  'Botein', 'Chara', 'Dabih', 'Furud', 'Giedi', 'Homam', 'Jabbah', 'Keid', 'Lesath', 'Maaz', 'Nashira', 'Okab',
  'Praecipua', 'Rana', 'Sham', 'Tegmine', 'Unuk', 'Wasat', 'Zaniah', 'Alkes', 'Baten', 'Cursa',
];
const NUMERALS = ['I', 'II', 'III', 'IV'];

const TYPE_WEIGHTS: [PlanetTypeId, number][] = [
  ['terran', 12],
  ['ocean', 14],
  ['desert', 18],
  ['ice', 16],
  ['volcanic', 12],
  ['barren', 16],
  ['gas', 12],
];

function weighted<T>(r: { rng: number }, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = nextFloat(r) * total;
  for (const [item, w] of items) {
    x -= w;
    if (x <= 0) return item;
  }
  return items[0][0];
}

function newPlanet(id: number, name: string, hex: number, type: PlanetTypeId): Planet {
  return {
    id,
    name,
    hex,
    type,
    owner: -1,
    homeOf: -1,
    pop: 0,
    food: 0,
    prodStore: 0,
    queue: [],
    buildings: [],
    worked: [],
    locked: [],
    borderProgress: 0,
    hp: 100,
    garrisonHp: 100,
    routes: [],
    founded: 0,
  };
}

export function generateMap(r: { rng: number }, width: number, height: number, systems: number, factions: number): GeneratedMap {
  const g: Grid = { width, height };
  const n = width * height;
  const hexes: Hex[] = Array.from({ length: n }, () => ({ terrain: 'space' as TerrainId }));
  const planets: Planet[] = [];
  const stars: number[] = [];
  const starNames: Record<number, string> = {};
  const names = shuffle(r, [...STAR_NAMES]);

  const free = (i: number) => hexes[i].terrain === 'space' && !hexes[i].resource;
  const edge = (i: number, margin: number) => {
    const c = i % width;
    const rr = Math.floor(i / width);
    return c < margin || rr < margin || c >= width - margin || rr >= height - margin;
  };

  function addPlanet(star: number, type: PlanetTypeId | null, dist: number): Planet | null {
    const options = shuffle(r, ring(g, star, dist)).filter(
      (i) => free(i) && !edge(i, 1) && planets.every((p) => distance(g, p.hex, i) >= 3),
    );
    if (!options.length) return null;
    const hex = options[0];
    const count = planets.filter((p) => p.name.startsWith(starNames[star] + ' ')).length;
    const p = newPlanet(planets.length, `${starNames[star]} ${NUMERALS[count] ?? count + 1}`, hex, type ?? weighted(r, TYPE_WEIGHTS));
    hexes[hex].terrain = 'planet';
    hexes[hex].planetId = p.id;
    planets.push(p);
    // Moons
    const moons = nextFloat(r) < 0.55 ? 1 : nextFloat(r) < 0.3 ? 2 : 0;
    const spots = shuffle(r, neighbors(g, hex)).filter(free);
    for (let m = 0; m < moons && m < spots.length; m++) hexes[spots[m]].terrain = 'moon';
    return p;
  }

  function addStar(hex: number): number {
    hexes[hex].terrain = 'star';
    stars.push(hex);
    starNames[hex] = names[stars.length - 1] ?? `Star ${stars.length}`;
    return hex;
  }

  function scatter(center: number, radius: number, terrain: TerrainId, count: number) {
    const spots = shuffle(r, within(g, center, radius)).filter(free);
    for (let k = 0; k < count && k < spots.length; k++) hexes[spots[k]].terrain = terrain;
  }

  // Home systems on an ellipse round the map center.
  const homes: number[] = [];
  const angle0 = nextFloat(r) * Math.PI * 2;
  for (let f = 0; f < factions; f++) {
    const a = angle0 + (f / factions) * Math.PI * 2 + (nextFloat(r) - 0.5) * 0.3;
    const c = Math.round(width / 2 + Math.cos(a) * (width / 2 - 6));
    const rr = Math.round(height / 2 + Math.sin(a) * (height / 2 - 5));
    const star = addStar(index(g, c, rr));
    const home = addPlanet(star, 'terran', 2)!;
    home.homeOf = f;
    homes.push(home.id);
    scatter(home.hex, 2, 'ice', 3);
    scatter(home.hex, 2, 'asteroids', 3);
    scatter(home.hex, 2, 'debris', 1);
    scatter(home.hex, 2, 'nebula', 1);
    if (!neighbors(g, home.hex).some((i) => hexes[i].terrain === 'moon')) scatter(home.hex, 1, 'moon', 1);
    // A second planet that the faction can colonize at once.
    addPlanet(star, nextFloat(r) < 0.5 ? 'ocean' : 'terran', 2) ?? addPlanet(star, 'ocean', 3);
    if (nextFloat(r) < 0.6) addPlanet(star, null, 3);
  }

  // Other systems.
  let tries = 0;
  while (stars.length < systems && tries++ < 4000) {
    const hex = randInt(r, 0, n - 1);
    if (!free(hex) || edge(hex, 2)) continue;
    if (stars.some((s) => distance(g, s, hex) < 6)) continue;
    if (planets.some((p) => distance(g, p.hex, hex) < 3)) continue;
    addStar(hex);
    const count = weighted(r, [
      [1, 4],
      [2, 4],
      [3, 2],
    ]);
    for (let k = 0; k < count; k++) addPlanet(hex, null, k === 2 ? 3 : 2);
    scatter(hex, 3, 'asteroids', randInt(r, 1, 4));
    scatter(hex, 3, 'ice', randInt(r, 1, 3));
    scatter(hex, 3, 'debris', randInt(r, 0, 2));
    scatter(hex, 3, 'nebula', randInt(r, 0, 2));
  }

  // Large features between the systems.
  function blob(terrain: TerrainId, size: number, minHomeDist: number) {
    let at = randInt(r, 0, n - 1);
    for (let k = 0; k < size; k++) {
      const homeDist = Math.min(...homes.map((h) => distance(g, planets[h].hex, at)));
      if (free(at) && homeDist >= minHomeDist) hexes[at].terrain = terrain;
      const next = neighbors(g, at);
      at = pick(r, next);
    }
  }
  const scale = n / 1000;
  for (let k = 0; k < Math.round(7 * scale); k++) blob('nebula', randInt(r, 5, 12), 2);
  for (let k = 0; k < Math.round(6 * scale); k++) blob('asteroids', randInt(r, 4, 10), 2);
  for (let k = 0; k < Math.round(4 * scale); k++) blob('debris', randInt(r, 3, 6), 2);
  for (let k = 0; k < Math.round(5 * scale); k++) blob('rift', randInt(r, 8, 18), 5);

  // Rifts must not cut a planet off from the rest of the map.
  const passable = (i: number) => hexes[i].terrain !== 'rift' && hexes[i].terrain !== 'star';
  for (let pass = 0; pass < 20; pass++) {
    const seen = new Uint8Array(n);
    const stack = [planets[homes[0]].hex];
    seen[stack[0]] = 1;
    while (stack.length) {
      const at = stack.pop()!;
      for (const nb of neighbors(g, at)) {
        if (!seen[nb] && passable(nb)) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    if (planets.every((p) => seen[p.hex])) break;
    for (let i = 0; i < n; i++) if (hexes[i].terrain === 'rift' && nextFloat(r) < 0.3) hexes[i].terrain = 'space';
  }

  // Resources.
  function place(res: ResourceId, count: number, near?: number) {
    const def = RESOURCES[res];
    let spots: number[] = [];
    for (let i = 0; i < n; i++) if (def.terrains.includes(hexes[i].terrain) && !hexes[i].resource) spots.push(i);
    if (near !== undefined) spots = spots.filter((i) => distance(g, i, near) <= 3 && distance(g, i, near) >= 1);
    else spots = spots.filter((i) => planets.some((p) => distance(g, p.hex, i) <= 3));
    shuffle(r, spots);
    for (let k = 0; k < count && k < spots.length; k++) hexes[spots[k]].resource = res;
    return Math.min(count, spots.length);
  }
  const luxuries: ResourceId[] = ['void_coffee', 'singing_crystals', 'vintage_scrap', 'spice_gas'];
  homes.forEach((h, f) => {
    if (!place(luxuries[f % luxuries.length], 1, planets[h].hex)) place(pick(r, luxuries), 1, planets[h].hex);
  });
  for (const lux of luxuries) place(lux, Math.max(2, factions - 1));
  place('helium3', factions + 3);
  place('neutronium', factions + 2);
  place('antimatter', factions + 2);

  // Anomalies.
  const anomalySpots = shuffle(
    r,
    hexes
      .map((h, i) => i)
      .filter(
        (i) =>
          ['space', 'debris', 'nebula', 'asteroids'].includes(hexes[i].terrain) &&
          homes.every((h) => distance(g, planets[h].hex, i) >= 3),
      ),
  );
  const anomalies = Math.round(n / 45);
  for (let k = 0; k < anomalies && k < anomalySpots.length; k++) hexes[anomalySpots[k]].anomaly = true;

  // Pirate dens at the start of the game.
  const denSpots = anomalySpots
    .slice(anomalies)
    .filter((i) => hexes[i].terrain !== 'space' && homes.every((h) => distance(g, planets[h].hex, i) >= 7));
  const dens = Math.max(2, Math.round(factions * 0.75));
  const placed: number[] = [];
  for (const i of denSpots) {
    if (placed.length >= dens) break;
    if (placed.every((d) => distance(g, d, i) >= 6)) {
      hexes[i].den = true;
      placed.push(i);
    }
  }

  return { width, height, hexes, planets, homes, starNames };
}

// Placeholder art in a 16-bit pixel style, drawn in code. An image file from public/assets replaces a
// placeholder when assets/manifest.json lists the file.
import { UNITS } from '../core/data/units';
import type { PlanetTypeId, ResourceId, SpeciesId, TerrainId, YieldKey } from '../core/types';

export type Sprite = HTMLCanvasElement | HTMLImageElement;

const cache = new Map<string, Sprite>();
const external = new Map<string, HTMLImageElement>();

// One set of generated images, in public/assets/hd. The player can switch to the placeholders.
export type ArtSet = 'hd' | 'none';
export const ART_SETS: [ArtSet, string][] = [
  ['hd', 'Illustrations'],
  ['none', 'Placeholders drawn in code'],
];
const ART_KEY = 'rustbelt-galaxy:art';

export function artSet(): ArtSet {
  try {
    const v = localStorage.getItem(ART_KEY);
    return v === 'none' ? 'none' : 'hd';
  } catch {
    return 'hd';
  }
}

export function setArtSet(set: ArtSet) {
  try {
    localStorage.setItem(ART_KEY, set);
  } catch {
    // The browser blocks storage. The choice lasts for this page only.
  }
}

// Loads the images of the chosen art set. Returns the number of images.
export async function loadExternalArt(set: ArtSet = artSet()): Promise<number> {
  external.clear();
  cache.clear();
  urls.clear();
  if (set === 'none') return 0;
  try {
    const res = await fetch(`assets/${set}/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return 0;
    const data = (await res.json()) as { files?: string[] };
    const files = data.files ?? [];
    await Promise.all(
      files.map(
        (file) =>
          new Promise<void>((done) => {
            const img = new Image();
            img.onload = () => {
              external.set(file.replace(/\.(png|webp|jpg)$/i, ''), img);
              done();
            };
            img.onerror = () => done();
            img.src = `assets/${set}/${file}`;
          }),
      ),
    );
    cache.clear();
    urls.clear();
    return external.size;
  } catch {
    return 0;
  }
}

export function externalArt(key: string): HTMLImageElement | undefined {
  return external.get(key);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function parse(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(color: string, k: number): string {
  const [r, g, b] = parse(color);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`;
}

const INK = '#14110f';

// Ships

type Shape = 'dart' | 'box' | 'wide' | 'round' | 'beast';

interface ShipSpec {
  size: number;
  shape: Shape;
  hull: string;
}

function shipSpec(type: string): ShipSpec {
  const def = UNITS[type];
  const base = def.replaces ? UNITS[def.replaces] : def;
  const tier = Math.max(def.strength, def.ranged ?? 0);
  let size = tier < 10 ? 11 : tier < 16 ? 13 : tier < 28 ? 15 : tier < 40 ? 17 : tier < 55 ? 19 : 21;
  let shape: Shape = 'dart';
  let hull = '#8d8a80';
  if (def.canColonize) {
    size = 16;
    shape = 'round';
    hull = '#a9a18c';
  } else if (def.canBuild) {
    size = 13;
    shape = 'box';
    hull = '#b08d45';
  } else if (def.ground) {
    size = 15;
    shape = 'box';
    hull = '#6f7a5a';
  } else if (def.ranged && (def.range ?? 0) >= 3) shape = 'wide';
  else if (def.ranged) shape = 'box';
  else if (tier >= 40) shape = 'wide';
  if (type === 'leviathan') return { size: 22, shape: 'beast', hull: '#5b3a6e' };
  if (def.voidborn) return { size: def.ranged ? 21 : 15, shape: 'beast', hull: '#2a1238' };
  if (def.species === 'pirates') hull = '#5c5c5c';
  if (base.id !== def.id) hull = mix(hull, '#6b4a32', 0.25);
  return { size, shape, hull };
}

// A symmetric ship from a seeded random mask, with a dark outline.
function drawShip(type: string, color: string): HTMLCanvasElement {
  const spec = shipSpec(type);
  const n = spec.size;
  const half = Math.ceil(n / 2);
  const r = rng(hash(type));
  const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  // 0 empty, 1 hull, 2 accent, 3 window, 4 engine, 5 rust
  for (let y = 1; y < n - 1; y++) {
    const t = y / (n - 1);
    let width: number;
    switch (spec.shape) {
      case 'dart':
        width = 0.15 + t * 0.85;
        break;
      case 'box':
        width = t < 0.15 ? 0.5 : 0.8;
        break;
      case 'wide':
        width = t < 0.3 ? 0.3 + t : 0.65 + 0.35 * Math.sin(t * Math.PI);
        break;
      case 'round':
        width = 0.35 + 0.65 * Math.sin(t * Math.PI);
        break;
      case 'beast':
        width = 0.3 + 0.7 * Math.sin(Math.pow(t, 0.7) * Math.PI);
        break;
    }
    const reach = Math.max(1, Math.round(width * (half - 1)));
    for (let x = 0; x < half; x++) {
      const fromAxis = half - 1 - x;
      if (fromAxis >= reach) continue;
      const edge = fromAxis === reach - 1;
      if (edge && r() < 0.3 && fromAxis > 0) continue;
      let v = 1;
      const roll = r();
      if (fromAxis <= 1 && t > 0.2 && t < 0.45) v = 3;
      else if (t > 0.88 && fromAxis % 2 === 0) v = 4;
      else if (roll < 0.2) v = 2;
      else if (roll < 0.32) v = 5;
      grid[y][x] = v;
      grid[y][n - 1 - x] = v;
    }
  }
  const [c, ctx] = canvas(n + 2, n + 2);
  const light = shade(spec.hull, 1.35);
  const dark = shade(spec.hull, 0.6);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = grid[y][x];
      if (!v) {
        const near = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => grid[y + dy]?.[x + dx]);
        if (near) px(ctx, x + 1, y + 1, INK);
        continue;
      }
      let col = x < n * 0.35 ? light : x > n * 0.62 ? dark : spec.hull;
      if (v === 2) col = x > n * 0.62 ? shade(color, 0.7) : color;
      if (v === 3) col = spec.shape === 'beast' ? '#ffe36e' : '#8fe3e8';
      if (v === 4) col = spec.shape === 'beast' ? '#3c2549' : '#ff9d3c';
      if (v === 5) col = spec.shape === 'beast' ? '#7b4f93' : mix(spec.hull, '#7a3b1d', 0.6);
      px(ctx, x + 1, y + 1, col);
    }
  }
  // Outline on the canvas border rows.
  for (let x = 0; x < n; x++) {
    if (grid[1][x]) px(ctx, x + 1, 1, INK);
    if (grid[n - 2][x]) px(ctx, x + 1, n, INK);
  }
  return c;
}

export function unitSprite(type: string, color: string): Sprite {
  const ext = external.get(`units/${type}`);
  if (ext) return ext;
  const key = `unit:${type}:${color}`;
  let s = cache.get(key);
  if (!s) {
    s = drawShip(type, color);
    cache.set(key, s);
  }
  return s;
}

// Planets

const PLANET_COLORS: Record<PlanetTypeId, string[]> = {
  terran: ['#2f5d8a', '#3f7a4a', '#6f8f45', '#d9d9c8'],
  ocean: ['#1f3f78', '#2b5fa0', '#3f86b8', '#cfe3ea'],
  desert: ['#9a6a35', '#c08a45', '#d9aa62', '#7a4a28'],
  ice: ['#8fb3c7', '#c4dbe6', '#eef5f8', '#6d8fa6'],
  volcanic: ['#3a2a28', '#5a3328', '#d4532a', '#ffb347'],
  barren: ['#5e5a55', '#7b766f', '#94908a', '#45413d'],
  gas: ['#b3773f', '#d6a15e', '#8a5a36', '#e7c891'],
};

function noise2(seed: number, x: number, y: number): number {
  const h = hash(`${seed}:${x}:${y}`);
  return (h % 1000) / 1000;
}

function smooth(seed: number, x: number, y: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = noise2(seed, x0, y0);
  const b = noise2(seed, x0 + 1, y0);
  const c = noise2(seed, x0, y0 + 1);
  const d = noise2(seed, x0 + 1, y0 + 1);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function drawDisc(size: number, seed: number, colors: string[], bands: boolean, glow?: string): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const r = size / 2 - 1;
  const cx = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cx);
      if (d > r + 0.5) {
        if (glow && d < r + 3 && (x + y) % 2 === 0) px(ctx, x, y, glow);
        continue;
      }
      if (d > r - 0.6) {
        px(ctx, x, y, INK);
        continue;
      }
      let v = bands ? smooth(seed, 0, y + smooth(seed, x, y, 5) * 3, 3) : smooth(seed, x, y, 5) * 0.7 + smooth(seed + 1, x, y, 2) * 0.3;
      let col = colors[v < 0.42 ? 0 : v < 0.6 ? 1 : v < 0.8 ? 2 : 3];
      // Light from the top left, with a dithered edge between light and shadow.
      const lit = (x - cx) * -0.6 + (y - cx) * -0.6;
      const edge = lit / r;
      if (edge < -0.35 || (edge < -0.2 && (x + y) % 2 === 0)) col = shade(parseColor(col), 0.55);
      else if (edge > 0.45 && (x + y) % 2 === 0) col = shade(parseColor(col), 1.25);
      px(ctx, x, y, col);
    }
  }
  return c;
}

function parseColor(c: string): string {
  if (c.startsWith('#')) return c;
  const m = c.match(/\d+/g)!.map(Number);
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function planetSprite(type: PlanetTypeId, id: number): Sprite {
  const ext = external.get(`planets/${type}`);
  if (ext) return ext;
  const key = `planet:${type}:${id % 5}`;
  let s = cache.get(key);
  if (!s) {
    s = drawDisc(28, hash(key), PLANET_COLORS[type], type === 'gas');
    cache.set(key, s);
  }
  return s;
}

const STAR_COLORS = [
  ['#ffd75e', '#ffb338', '#fff2b0', '#ff8f2e'],
  ['#ff8a4a', '#e0522d', '#ffc27a', '#b8361f'],
  ['#9fd4ff', '#6aa9f0', '#e6f4ff', '#4a7fd0'],
  ['#fff1d6', '#ffd9a0', '#ffffff', '#f0b060'],
];

export function starSprite(hex: number): Sprite {
  const ext = external.get('terrain/star');
  if (ext) return ext;
  const v = hex % STAR_COLORS.length;
  const key = `star:${v}`;
  let s = cache.get(key);
  if (!s) {
    const [c, ctx] = canvas(34, 34);
    const colors = STAR_COLORS[v];
    for (let y = 0; y < 34; y++) {
      for (let x = 0; x < 34; x++) {
        const d = Math.hypot(x - 16.5, y - 16.5);
        if (d < 9) px(ctx, x, y, colors[2]);
        else if (d < 11.5) px(ctx, x, y, colors[0]);
        else if (d < 13.5) px(ctx, x, y, (x + y) % 2 ? colors[0] : colors[1]);
        else if (d < 15.5 && (x + y) % 2 === 0) px(ctx, x, y, colors[3]);
        else if (d < 17 && (x % 3 === 0) && (y % 3 === 0)) px(ctx, x, y, colors[3]);
      }
    }
    s = c;
    cache.set(key, s);
  }
  return s;
}

// Terrain. Each terrain has four variants. The hex index selects one.

const TERRAIN_SIZE = 40;

function scatterRocks(ctx: CanvasRenderingContext2D, r: () => number, count: number, colors: string[], min: number, max: number) {
  for (let k = 0; k < count; k++) {
    const x = 6 + Math.floor(r() * (TERRAIN_SIZE - 14));
    const y = 8 + Math.floor(r() * (TERRAIN_SIZE - 16));
    const w = min + Math.floor(r() * (max - min + 1));
    const h = Math.max(2, w - Math.floor(r() * 2));
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y, w + 2, h);
    ctx.fillRect(x, y - 1, w, h + 2);
    ctx.fillStyle = colors[1];
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colors[0];
    ctx.fillRect(x, y, Math.max(1, w - 2), Math.max(1, h - 2));
    ctx.fillStyle = colors[2];
    ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
  }
}

function drawTerrain(terrain: TerrainId, variant: number): HTMLCanvasElement {
  const [c, ctx] = canvas(TERRAIN_SIZE, TERRAIN_SIZE);
  const r = rng(hash(`${terrain}:${variant}`));
  const stars = terrain === 'rift' ? 0 : 3 + Math.floor(r() * 4);
  for (let k = 0; k < stars; k++) {
    const x = Math.floor(r() * TERRAIN_SIZE);
    const y = Math.floor(r() * TERRAIN_SIZE);
    px(ctx, x, y, r() < 0.3 ? '#c9c2b0' : '#5a5f6e');
  }
  switch (terrain) {
    case 'asteroids':
      scatterRocks(ctx, r, 7, ['#8a7f70', '#6b6156', '#453d36'], 3, 6);
      break;
    case 'debris':
      scatterRocks(ctx, r, 5, ['#8b9299', '#5f666d', '#3c4247'], 2, 4);
      for (let k = 0; k < 6; k++) px(ctx, 6 + Math.floor(r() * 28), 8 + Math.floor(r() * 24), '#c8642a');
      break;
    case 'ice':
      scatterRocks(ctx, r, 6, ['#eef7fb', '#b9d9e8', '#7fa9bf'], 2, 5);
      break;
    case 'moon': {
      const d = drawDisc(14, hash(`moon${variant}`), ['#77736d', '#8e8a83', '#a5a19a', '#5c5954'], false);
      ctx.drawImage(d, 13, 13);
      break;
    }
    case 'nebula': {
      const colors = [
        ['#7a3f8f', '#b45fb0', '#e08ac0'],
        ['#2f6f8f', '#4fa3a8', '#8fd6c0'],
      ][variant % 2];
      for (let y = 2; y < TERRAIN_SIZE - 2; y++) {
        for (let x = 2; x < TERRAIN_SIZE - 2; x++) {
          const d = Math.hypot(x - 20, y - 20) / 20;
          const v = smooth(variant * 31 + 7, x, y, 7) * 0.7 + smooth(variant * 31 + 8, x, y, 3) * 0.3 - d * 0.35;
          if (v > 0.42) px(ctx, x, y, colors[2]);
          else if (v > 0.32 && (x + y) % 2 === 0) px(ctx, x, y, colors[1]);
          else if (v > 0.24 && x % 2 === 0 && y % 2 === 0) px(ctx, x, y, colors[0]);
        }
      }
      break;
    }
    case 'rift':
      for (let y = 2; y < TERRAIN_SIZE - 2; y++) {
        for (let x = 2; x < TERRAIN_SIZE - 2; x++) {
          const v = smooth(variant * 17 + 3, x, y, 6);
          const band = Math.abs(Math.sin((x + y * 0.6 + v * 14) / 5));
          if (band < 0.18) px(ctx, x, y, '#4b1f5e');
          else if (band < 0.3 && (x + y) % 2 === 0) px(ctx, x, y, '#2a1238');
        }
      }
      break;
    default:
      break;
  }
  return c;
}

export function terrainSprite(terrain: TerrainId, hex: number): Sprite {
  const variant = hash(`v${hex}`) % 4;
  const ext = external.get(`terrain/${terrain}`);
  if (ext && terrain !== 'space') return ext;
  const key = `terrain:${terrain}:${variant}`;
  let s = cache.get(key);
  if (!s) {
    s = drawTerrain(terrain, variant);
    cache.set(key, s);
  }
  return s;
}

// Small icons from pixel maps

const ICONS: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  food: {
    rows: ['..gg...', '.gGGg..', 'gGGGGg.', 'gGGGGg.', '.gGGg..', '..gb...', '...b...'],
    colors: { g: '#3f7a3a', G: '#7fc25a', b: '#5a3a1e' },
  },
  prod: {
    rows: ['.o.o.o.', 'ooOOOoo', '.OOkOO.', 'oOkkkOo', '.OOkOO.', 'ooOOOoo', '.o.o.o.'],
    colors: { o: '#8a4a1e', O: '#e08a3a', k: '#2a1a10' },
  },
  sci: {
    rows: ['..www..', '..w.w..', '..w.w..', '.wbbbw.', 'wbBBBbw', 'wbBBBbw', '.wwwww.'],
    colors: { w: '#c8d8e8', b: '#2f6fb0', B: '#5fb0f0' },
  },
  cred: {
    rows: ['.yyyyy.', 'yYYYYYy', 'yYyyyYy', 'yYyYYYy', 'yYyyyYy', 'yYYYYYy', '.yyyyy.'],
    colors: { y: '#8a6a14', Y: '#f0c93a' },
  },
  inf: {
    rows: ['...p...', '..pPp..', 'pppPppp', '.pPPPp.', '.pPpPp.', 'pPp.pPp', 'pp...pp'],
    colors: { p: '#5a3a8a', P: '#b88af0' },
  },
  morale: {
    rows: ['.rrrrr.', 'rRRRRRr', 'rRkRkRr', 'rRRRRRr', 'rkRRRkr', 'rRkkkRr', '.rrrrr.'],
    colors: { r: '#8a5a14', R: '#f0d25a', k: '#2a1a10' },
  },
  station: {
    rows: ['...k...', '..kLk..', '.kLAALk', 'kLAAALk', '.kLAALk', '..kLk..', '...k...'],
    colors: { k: INK, L: '#c9c2b0', A: '#e08a3a' },
  },
  anomaly: {
    rows: ['.ccccc.', 'cc...cc', '.....cc', '...ccc.', '...c...', '.......', '...c...'],
    colors: { c: '#6ff0e0' },
  },
  den: {
    rows: ['.wwwww.', 'wwwwwww', 'wkkwkkw', 'wkkwkkw', 'wwwkwww', '.wwwww.', '.wkwkw.'],
    colors: { w: '#e8e0d0', k: '#1a1410' },
  },
  helium3: {
    rows: ['..ccc..', '.cCCCc.', 'cCCwCCc', 'cCwwCCc', 'cCCCCCc', '.cCCCc.', '..ccc..'],
    colors: { c: '#2a7a9a', C: '#6fd0f0', w: '#ffffff' },
  },
  neutronium: {
    rows: ['.kkkkk.', 'kLLLLDk', 'kLLLDDk', 'kLLDDDk', 'kLDDDDk', 'kDDDDDk', '.kkkkk.'],
    colors: { k: INK, L: '#aab0c0', D: '#5a6070' },
  },
  antimatter: {
    rows: ['m.....m', '.m.M.m.', '..MMM..', '.MMwMM.', '..MMM..', '.m.M.m.', 'm.....m'],
    colors: { m: '#a02a8a', M: '#ff5ad0', w: '#ffffff' },
  },
  void_coffee: {
    rows: ['.w.w...', '..w.w..', 'bbbbbb.', 'bBBBBbb', 'bBBBBbb', 'bBBBBb.', '.bbbb..'],
    colors: { w: '#c9c2b0', b: '#3a2416', B: '#7a4a2a' },
  },
  singing_crystals: {
    rows: ['...c...', '..cCc..', '..cCc.c', 'c.cCccC', 'Cc.cCcC', 'CccCCcC', 'ccccccc'],
    colors: { c: '#3a8a7a', C: '#8ff0d0' },
  },
  vintage_scrap: {
    rows: ['..rr...', '.rRRr..', 'rRkRRr.', 'rRRRkRr', '.rRRRRr', '..rkRr.', '...rr..'],
    colors: { r: '#6a3414', R: '#c8642a', k: '#2a1a10' },
  },
  spice_gas: {
    rows: ['.o...o.', 'oOo.oOo', '.oOoOo.', '..oOo..', '.oOoOo.', 'oOo.oOo', '.o...o.'],
    colors: { o: '#a0521a', O: '#ffb060' },
  },
};

export function icon(name: string): HTMLCanvasElement {
  const key = `icon:${name}`;
  let s = cache.get(key) as HTMLCanvasElement | undefined;
  if (!s) {
    const def = ICONS[name] ?? ICONS.station;
    const [c, ctx] = canvas(7, 7);
    def.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = def.colors[row[x]];
        if (col) px(ctx, x, y, col);
      }
    });
    s = c;
    cache.set(key, s);
  }
  return s;
}

const urls = new Map<string, string>();

// A yield, morale or resource icon: the generated image when the art set has one, else the icon drawn in code.
export function iconSprite(name: string): Sprite {
  return external.get(`icons/${name}`) ?? external.get(`resources/${name}`) ?? icon(name);
}

export function iconUrl(name: string): string {
  const ext = external.get(`icons/${name}`) ?? external.get(`resources/${name}`);
  if (ext) return ext.src;
  let u = urls.get(name);
  if (!u) {
    u = icon(name).toDataURL();
    urls.set(name, u);
  }
  return u;
}

export function yieldIcon(k: YieldKey): string {
  return iconUrl(k);
}

// The station of a terrain: a Mining Rig on asteroids, a Sensor Buoy in a nebula, and so on.
export function stationSprite(terrain: TerrainId): Sprite {
  return external.get(`stations/${terrain}`) ?? icon('station');
}

export function stationIconUrl(terrain: TerrainId): string {
  return external.get(`stations/${terrain}`)?.src ?? iconUrl('station');
}

export function resourceIcon(r: ResourceId): Sprite {
  return external.get(`resources/${r}`) ?? icon(r);
}

// Leader portraits

const FACES: Record<SpeciesId, { rows: string[]; colors: Record<string, string> }> = {
  terran: {
    rows: [
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '..hhhssssssshh..',
      '..hhssssssssh...',
      '..hssssssssss...',
      '..hskksssskks...',
      '..sswkssssKws...',
      '..ssssssssss....',
      '...ssssnnsss....',
      '...sssssssss....',
      '...ssmmmmmss....',
      '....ssssssss....',
      '..ooossssssooo..',
      '.ooooaooooaoooo.',
      'ooooooaaaaoooooo',
      'oooooooooooooooo',
    ],
    colors: { h: '#8a8478', s: '#c99a72', k: '#2a1a10', w: '#ffffff', K: '#2a1a10', n: '#a87a55', m: '#7a3a2a', o: '#d9782d', a: '#ffd08a' },
  },
  krogg: {
    rows: [
      '.t............t.',
      '.tt..gggggg..tt.',
      '..ttgggggggggt..',
      '...gggggggggg...',
      '..gggggggggggg..',
      '..gkkkggggkkkg..',
      '..ggyrkggkryGg..',
      '..gggggggggggg..',
      '..ggggnggngggg..',
      '..gGggggggggGg..',
      '..gwgwgwgwgwgg..',
      '...gggggggggg...',
      '.rrrrggggggrrrr.',
      'rrrkrrrrrrrrkrrr',
      'rrrrrrkkkkrrrrrr',
      'rrrrrrrrrrrrrrrr',
    ],
    colors: { t: '#d8d0b8', g: '#5f7a4a', G: '#4a5f3a', k: '#1a1410', y: '#ffd23a', r: '#c0342c', n: '#3a4a2a', w: '#e8e0d0' },
  },
  ilthari: {
    rows: [
      '......cccc......',
      '.....cCCCCc.....',
      '....cCCCCCCc....',
      '....cCCCCCCc....',
      '...cCCCCCCCCc...',
      '...cCwwCCwwCc...',
      '...cCwkCCkwCc...',
      '...cCCCCCCCCc...',
      '....cCCCCCCc....',
      '....cCCccCCc....',
      '.....cCCCCc.....',
      '......cCCc......',
      '...tttcCCcttt...',
      '..ttttttttttttt.',
      '.tttttwtttwtttt.',
      'tttttttttttttttt',
    ],
    colors: { c: '#1f7a78', C: '#7ff0e0', w: '#ffffff', k: '#103a3a', t: '#2fb6b0' },
  },
  ozmok: {
    rows: [
      '.....yyyyyy.....',
      '....yYYYYYYy....',
      '...bbbbbbbbbb...',
      '..oooooooooooo..',
      '.oooooooooooooo.',
      '.ookkkooookkkoo.',
      '.oowwkoooowwkoo.',
      '.oooooooooooooo.',
      '..oooonnnnoooo..',
      '..oooooooooooo..',
      '..ooowwwwwwooo..',
      '...oooooooooo...',
      '.dddddooooddddd.',
      'ddddyddddddydddd',
      'dddddyyyyyyddddd',
      'dddddddddddddddd',
    ],
    colors: { y: '#8a6a14', Y: '#f0c93a', b: '#2a2420', o: '#c9a05a', k: '#1a1410', w: '#ffffff', n: '#8a6a3a', d: '#3a3a44' },
  },
  seren: {
    rows: [
      '......vvvv......',
      '.....vVVVVv.....',
      '....pppppppp....',
      '....pPPPPPPp....',
      '...pPPPPPPPPp...',
      '...pPkkPPkkPp...',
      '...pPwkPPwkPp...',
      '...pPPPPPPPPp...',
      '...pPPPppPPPp...',
      '....pPPPPPPp....',
      '....pPPmmPPp....',
      '.....pPPPPp.....',
      '..vvvvpPPpvvvv..',
      '.vvvvVvvvvVvvvv.',
      'vvvvvvVVVVvvvvvv',
      'vvvvvvvvvvvvvvvv',
    ],
    colors: { v: '#6a4a9a', V: '#e3ccff', p: '#8a9ad0', P: '#c8d4f8', k: '#2a2a4a', w: '#ffffff', m: '#6a5a9a' },
  },
  plodd: {
    rows: [
      '................',
      '...bbbbbbbbbb...',
      '..bbbbbbbbbbbb..',
      '..bbbbbbbbbbbb..',
      '..bkkkbbbbkkkb..',
      '..bwwkbbbbwwkb..',
      '..bbbbbbbbbbbb..',
      '..bbbbbnnbbbbb..',
      '..bbbbbbbbbbbb..',
      '..bbmmmmmmmmbb..',
      '...bbbbbbbbbb...',
      '.ggggbbbbbbgggg.',
      'gggggggggggggggg',
      'ggggGgggggggGggg',
      'gggggggggggggggg',
      'gggggggggggggggg',
    ],
    colors: { b: '#b8a878', k: '#1a1410', w: '#ffffff', n: '#8a7a50', m: '#6a5a3a', g: '#8f9a3c', G: '#e2ec8a' },
  },
  vessani: {
    rows: [
      '.....mmmmmm.....',
      '...mmMMMMMMmm...',
      '..mMMMMMMMMMMm..',
      '..mMMMMMMMMMMm..',
      '.mMMMMMMMMMMMMm.',
      '.mMMwwMMMMwwMMm.',
      '.mMMwkMMMMwkMMm.',
      '.mMMMMMMMMMMMMm.',
      '..mMMMMMMMMMMm..',
      '..mMMMMmmMMMMm..',
      '...mMMMMMMMMm...',
      '..m.mmMMMMmm.m..',
      '.mMm..mMMm..mMm.',
      'mMMMm.mMMm.mMMMm',
      'mMMMMmmMMmmMMMMm',
      'mmmmmmmmmmmmmmmm',
    ],
    colors: { m: '#3f8a6a', M: '#78c7a3', w: '#d4fff0', k: '#1a2a24' },
  },
  sarn: {
    rows: [
      '.......ww.......',
      '......wWWw......',
      '.....wWWWWw.....',
      '....wWWWWWWw....',
      '....wWWWWWWw....',
      '...wWWkWWkWWw...',
      '...wWWWWWWWWw...',
      '...wWWWWWWWWw...',
      '....wWWWWWWw....',
      '....wWWWWWWw....',
      '.....wWWWWw.....',
      '..gggwwWWwwggg..',
      '.gggggwwwwggggg.',
      'gggggggggggggggg',
      'ggggGGggggGGgggg',
      'gggggggggggggggg',
    ],
    colors: { w: '#c8c0a8', W: '#e6e2d3', k: '#3a3020', g: '#8a8060', G: '#fff8dc' },
  },
  nullset: {
    rows: [
      '....kkkkkkkk....',
      '...kssssssssk...',
      '..kssssssssssk..',
      '..ksssssssssss..',
      '..kskkkssskkks..',
      '..ksrrkssskrrs..',
      '..kskkkssskkks..',
      '..kssssssssssk..',
      '..ksskkkkkkssk..',
      '..kssskskskssk..',
      '...kssssssssk...',
      '....kkkkkkkk....',
      '..dddkkssskkddd.',
      '.ddddddddddddddd',
      'ddddddrddddrdddd',
      'dddddddddddddddd',
    ],
    colors: { k: '#3a4048', s: '#9fb4c7', r: '#ff4a3a', d: '#5a6470' },
  },
  manyfold: {
    rows: [
      '....hhhh..hhhh..',
      '...hhhhhhhhhhhh.',
      '..hhffffhhffffh.',
      '..hfffffhffffffh',
      '..hfkfffhfkffffh',
      '..hfffffhffffffh',
      '..hffmffhffmfffh',
      '...hfffhhhfffhh.',
      '....hhh..hhh....',
      '..pppppppppppp..',
      '.pppppppppppppp.',
      'pppppPpppppPpppp',
      'pppppppppppppppp',
      'pppppppppppppppp',
      'pppppppppppppppp',
      'pppppppppppppppp',
    ],
    colors: { h: '#5a2a4a', f: '#e8b8a0', k: '#1a1410', m: '#a05050', p: '#c95fb0', P: '#ffd0f4' },
  },
  ashari: {
    rows: [
      '.......yy.......',
      '......yYYy......',
      '....hhhYYhhh....',
      '...hhhhhhhhhh...',
      '...hffffffffh...',
      '...hfkffffkfh...',
      '...hfwkffwkfh...',
      '...hffffffffh...',
      '...hfffnnfffh...',
      '....hffffffh....',
      '....hffmmffh....',
      '.....hffffh.....',
      '..bbbbhffhbbbb..',
      '.bbbbbbbbbbbbbb.',
      'bbbbBbbbbbbbBbbb',
      'bbbbbbbbbbbbbbbb',
    ],
    colors: { y: '#ffd23a', Y: '#fff2b0', h: '#7a6a90', f: '#d8c8c0', k: '#2a2440', w: '#ffffff', n: '#a89890', m: '#8a5a6a', b: '#4f7fe0', B: '#cfe0ff' },
  },
  halcyon: {
    rows: [
      '.....yyyyyy.....',
      '...yyYYYYYYyy...',
      '..yYYYYYYYYYYy..',
      '..fffffffffffff.',
      '..fffffffffffff.',
      '..ffkkffffffkkf.',
      '..ffwkffffffwkf.',
      '..fffffffffffff.',
      '..ffffffnnfffff.',
      '..fffwwwwwwffff.',
      '...ffffffffffff.',
      '....ffffffffff..',
      '..cccffffffcccc.',
      '.cccccccccccccc.',
      'ccccCcccccccCccc',
      'cccccccccccccccc',
    ],
    colors: { y: '#c8a03a', Y: '#ffe08a', f: '#e0b090', k: '#2a1a10', w: '#ffffff', n: '#b08060', c: '#ff7f6e', C: '#ffe0d8' },
  },
  pirates: {
    rows: [
      '................',
      '....kkkkkkkk....',
      '...kkkkkkkkkk...',
      '..kkkkwwwwkkkk..',
      '..ggggggggggg...',
      '..gkkkggggkkk...',
      '..gkkkkgggwkg...',
      '..ggggggggggg...',
      '...gggggnggg....',
      '...ggggggggg....',
      '...ggwgwgwgg....',
      '....ggggggg.....',
      '..kkkkgggkkkk...',
      '.kkkkkkkkkkkkkk.',
      'kkkkkkwkkwkkkkkk',
      'kkkkkkkkkkkkkkkk',
    ],
    colors: { k: '#2a2420', w: '#e8e0d0', g: '#8a8a7a', n: '#5a5a4a' },
  },
};

export function leaderPortrait(species: SpeciesId): string {
  const ext = external.get(`leaders/${species}`);
  if (ext) return ext.src;
  const key = `leader:${species}`;
  let u = urls.get(key);
  if (!u) {
    const def = FACES[species];
    const [c, ctx] = canvas(16, 16);
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(0, 0, 16, 16);
    def.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = def.colors[row[x]];
        if (col) px(ctx, x, y, col);
      }
    });
    u = c.toDataURL();
    urls.set(key, u);
  }
  return u;
}

export function spriteUrl(sprite: Sprite): string {
  if (sprite instanceof HTMLImageElement) return sprite.src;
  return sprite.toDataURL();
}

export function unitIconUrl(type: string, color: string): string {
  const key = `uniturl:${type}:${color}`;
  let u = urls.get(key);
  if (!u) {
    u = spriteUrl(unitSprite(type, color));
    urls.set(key, u);
  }
  return u;
}

export function planetIconUrl(type: PlanetTypeId, id: number): string {
  return spriteUrl(planetSprite(type, id));
}

export function artUrl(key: string): string | undefined {
  return external.get(key)?.src;
}

// Buildings, halls and colony backdrops for the planet scene

const CATEGORY_COLORS: Record<string, [string, string]> = {
  prod: ['#8a4a1e', '#e08a3a'],
  sci: ['#2f6fb0', '#8fd0f0'],
  cred: ['#8a6a14', '#f0c93a'],
  inf: ['#5a3a8a', '#b88af0'],
  morale: ['#a03a6a', '#ff8ac0'],
  military: ['#7a2a24', '#d1495b'],
  food: ['#3f7a3a', '#7fc25a'],
  growth: ['#2a7a7a', '#6fd0d0'],
};

// A small pixel building. The category sets the light colour, the id sets the shape.
export function buildingSprite(id: string, category: string): Sprite {
  const ext = external.get(`buildings/${id}`);
  if (ext) return ext;
  const key = `building:${id}`;
  let s = cache.get(key);
  if (s) return s;
  const r = rng(hash(id));
  const [dark, light] = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.prod;
  const W = 24;
  const H = 24;
  const [c, ctx] = canvas(W, H);
  const wall = mix('#8d8a80', '#6b5a48', r());
  const wallDark = shade(parseColor(wall), 0.65);
  const rust = '#7a3b1d';
  const blocks = 1 + Math.floor(r() * 3);
  let x = 2;
  let ground = H - 3;
  for (let b = 0; b < blocks && x < W - 5; b++) {
    const w = 5 + Math.floor(r() * 7);
    const h = 6 + Math.floor(r() * 12);
    const bw = Math.min(w, W - 2 - x);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, ground - h - 1, bw + 2, h + 2);
    ctx.fillStyle = wall;
    ctx.fillRect(x, ground - h, bw, h);
    ctx.fillStyle = wallDark;
    ctx.fillRect(x + bw - 2, ground - h, 2, h);
    // Roof detail: dome, tower or flat
    const roof = r();
    if (roof < 0.33) {
      ctx.fillStyle = INK;
      ctx.fillRect(x + 1, ground - h - 3, bw - 2, 3);
      ctx.fillStyle = light;
      ctx.fillRect(x + 2, ground - h - 2, bw - 4, 2);
    } else if (roof < 0.66) {
      const tx = x + Math.floor(bw / 2);
      ctx.fillStyle = INK;
      ctx.fillRect(tx - 1, ground - h - 6, 3, 6);
      ctx.fillStyle = light;
      ctx.fillRect(tx, ground - h - 6, 1, 1);
    }
    // Windows and rust
    for (let wy = ground - h + 2; wy < ground - 2; wy += 3) {
      for (let wx = x + 1; wx < x + bw - 2; wx += 3) {
        if (r() < 0.55) px(ctx, wx, wy, r() < 0.8 ? light : dark);
        else if (r() < 0.2) px(ctx, wx, wy, rust);
      }
    }
    x += bw + 1;
  }
  // Ground line
  ctx.fillStyle = INK;
  ctx.fillRect(1, H - 3, W - 2, 1);
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(1, H - 2, W - 2, 2);
  s = c;
  cache.set(key, s);
  return s;
}

// The seat of government of a colony, in the species colour.
export function hallSprite(species: SpeciesId, color: string): Sprite {
  const ext = external.get(`halls/${species}`);
  if (ext) return ext;
  const key = `hall:${species}`;
  let s = cache.get(key);
  if (s) return s;
  const W = 34;
  const H = 30;
  const [c, ctx] = canvas(W, H);
  const r = rng(hash(species));
  const wall = '#9a948a';
  ctx.fillStyle = INK;
  ctx.fillRect(3, 11, W - 6, H - 13);
  ctx.fillStyle = wall;
  ctx.fillRect(4, 12, W - 8, H - 15);
  ctx.fillStyle = shade(wall, 0.65);
  ctx.fillRect(W - 7, 12, 3, H - 15);
  // Central tower
  ctx.fillStyle = INK;
  ctx.fillRect(13, 2, 8, 11);
  ctx.fillStyle = wall;
  ctx.fillRect(14, 3, 6, 10);
  ctx.fillStyle = color;
  ctx.fillRect(14, 3, 6, 2);
  ctx.fillRect(4, 12, W - 8, 2);
  // Banner
  ctx.fillStyle = INK;
  ctx.fillRect(16, 0, 1, 3);
  ctx.fillStyle = color;
  ctx.fillRect(17, 0, 3, 2);
  // Door and windows
  ctx.fillStyle = INK;
  ctx.fillRect(15, H - 8, 4, 5);
  for (let wx = 6; wx < W - 8; wx += 4) {
    if (wx > 12 && wx < 21) continue;
    px(ctx, wx, 17, '#8fe3e8');
    px(ctx, wx + 1, 17, '#8fe3e8');
    if (r() < 0.6) {
      px(ctx, wx, 21, '#ffd08a');
      px(ctx, wx + 1, 21, '#ffd08a');
    }
  }
  ctx.fillStyle = INK;
  ctx.fillRect(2, H - 3, W - 4, 1);
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(2, H - 2, W - 4, 2);
  s = c;
  cache.set(key, s);
  return s;
}

const SCENE_COLORS: Record<PlanetTypeId, { sky: [string, string]; ground: [string, string]; stars: boolean }> = {
  terran: { sky: ['#1d3f7a', '#6fa5d8'], ground: ['#3f7a4a', '#2c5a35'], stars: false },
  ocean: { sky: ['#12305f', '#4f86c0'], ground: ['#2b5fa0', '#1f3f78'], stars: false },
  desert: { sky: ['#7a3a1e', '#e0a060'], ground: ['#c08a45', '#8a5a2a'], stars: false },
  ice: { sky: ['#4a6a8a', '#b8d4e6'], ground: ['#dbe8ef', '#9fb8c8'], stars: false },
  volcanic: { sky: ['#1a0a0a', '#5a2018'], ground: ['#3a2a28', '#d4532a'], stars: true },
  barren: { sky: ['#05060a', '#1a1c24'], ground: ['#7b766f', '#45413d'], stars: true },
  gas: { sky: ['#5a3a1e', '#d6a15e'], ground: ['#b3773f', '#8a5a36'], stars: false },
};

export const SCENE_W = 160;
export const SCENE_H = 90;

export function sceneBackdrop(type: PlanetTypeId): Sprite {
  const ext = external.get(`scenes/${type}`);
  if (ext) return ext;
  const key = `scene:${type}`;
  let s = cache.get(key);
  if (s) return s;
  const [c, ctx] = canvas(SCENE_W, SCENE_H);
  const def = SCENE_COLORS[type];
  const horizon = 58;
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon;
    const band = Math.floor(t * 6) / 6; // banded sky, like old consoles
    ctx.fillStyle = mix(def.sky[0], def.sky[1], band);
    ctx.fillRect(0, y, SCENE_W, 1);
  }
  const r = rng(hash(type));
  if (def.stars) for (let k = 0; k < 40; k++) px(ctx, Math.floor(r() * SCENE_W), Math.floor(r() * (horizon - 10)), r() < 0.3 ? '#ffffff' : '#8a8fa0');
  // A moon or sun
  const mx = 20 + Math.floor(r() * 60);
  ctx.fillStyle = type === 'volcanic' ? '#ffb347' : type === 'barren' ? '#c9c2b0' : '#fff2b0';
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) px(ctx, mx + x, 14 + y, ctx.fillStyle as string);
  // Distant hills
  ctx.fillStyle = shade(parseColor(def.ground[1]), 0.8);
  for (let x = 0; x < SCENE_W; x++) {
    const h = 6 + Math.floor(4 * Math.sin(x / 9 + r()) + 3 * Math.sin(x / 23));
    ctx.fillRect(x, horizon - h, 1, h);
  }
  for (let y = horizon; y < SCENE_H; y++) {
    const t = (y - horizon) / (SCENE_H - horizon);
    ctx.fillStyle = mix(def.ground[0], def.ground[1], Math.floor(t * 4) / 4);
    ctx.fillRect(0, y, SCENE_W, 1);
  }
  // Ground texture
  for (let k = 0; k < 120; k++) {
    const x = Math.floor(r() * SCENE_W);
    const y = horizon + 2 + Math.floor(r() * (SCENE_H - horizon - 2));
    px(ctx, x, y, r() < 0.5 ? shade(parseColor(def.ground[1]), 0.7) : shade(parseColor(def.ground[0]), 1.2));
  }
  s = c;
  cache.set(key, s);
  return s;
}

// Technology illustrations: a framed emblem in the colour of the category.

const TECH_COLORS: Record<string, [string, string]> = {
  propulsion: ['#1f5f7a', '#6fd0f0'],
  science: ['#2f4f9a', '#5fb0f0'],
  colonization: ['#3f6a2a', '#7fc25a'],
  economy: ['#8a6a14', '#f0c93a'],
  society: ['#5a3a8a', '#b88af0'],
  military: ['#7a2a24', '#d1495b'],
};

export function projectSprite(id: string): Sprite {
  const ext = external.get(`projects/${id}`);
  if (ext) return ext;
  return techSprite(`project_${id}`, 'colonization');
}

export function techSprite(id: string, category: string): Sprite {
  const ext = external.get(`techs/${id}`);
  if (ext) return ext;
  const key = `tech:${id}`;
  let s = cache.get(key);
  if (s) return s;
  const N = 32;
  const [c, ctx] = canvas(N, N);
  const [dark, light] = TECH_COLORS[category] ?? TECH_COLORS.science;
  const r = rng(hash(id));
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, N, N);
  ctx.fillStyle = '#23252c';
  ctx.fillRect(1, 1, N - 2, N - 2);
  ctx.fillStyle = dark;
  ctx.fillRect(2, 2, N - 4, N - 4);
  // A symmetric emblem of 6 x 12 cells, mirrored.
  const cell = 2;
  const cols = 6;
  const rows = 12;
  const ox = (N - cols * 2 * cell) / 2;
  const oy = (N - rows * cell) / 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = r();
      const near = Math.abs(x - cols + 0.5) < 2.5 && y > 1 && y < rows - 2;
      if (v < (near ? 0.55 : 0.28)) {
        const col = v < 0.12 ? '#fff2b0' : light;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        ctx.fillRect(ox + (cols * 2 - 1 - x) * cell, oy + y * cell, cell, cell);
      }
    }
  }
  // Rust on the frame
  for (let k = 0; k < 10; k++) px(ctx, 1 + Math.floor(r() * (N - 2)), r() < 0.5 ? 1 : N - 2, '#7a3b1d');
  s = c;
  cache.set(key, s);
  return s;
}

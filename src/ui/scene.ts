// The colony view on the planet screen: the backdrop of the planet type, the hall of the species, and every building.
import { BUILDINGS } from '../core/data/buildings';
import type { Faction, Planet } from '../core/types';
import { SCENE_H, SCENE_W, artUrl, buildingSprite, hallSprite, sceneBackdrop, type Sprite } from './art';
import { originalUrl } from './lightbox';

const cache = new Map<string, HTMLCanvasElement>();

function fit(img: Sprite, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const scale = img instanceof HTMLImageElement ? max / Math.max(img.width, img.height) : k;
  return [Math.round(img.width * scale), Math.round(img.height * scale)];
}

type Lookup = (key: string, fallback: Sprite) => Sprite;
const gameArt: Lookup = (_key, fallback) => fallback;

function drawScene(c: HTMLCanvasElement, p: Planet, f: Faction, scale: number, lookup: Lookup) {
  c.width = SCENE_W * scale;
  c.height = SCENE_H * scale;
  const ctx = c.getContext('2d')!;
  const back = lookup(`scenes/${p.type}`, sceneBackdrop(p.type));
  ctx.imageSmoothingEnabled = back.width > 128 && back.width !== c.width;
  ctx.drawImage(back, 0, 0, c.width, c.height);

  // Slots: a back row, a middle row and a front row. The hall stands in the middle of the front row.
  const rows = [
    { y: 62, size: 20, xs: [12, 34, 56, 78, 100, 122, 144] },
    { y: 74, size: 24, xs: [4, 30, 56, 104, 130, 156] },
    { y: 87, size: 26, xs: [18, 46, 114, 142] },
  ];
  const slots: { x: number; y: number; size: number }[] = [];
  for (const row of rows) for (const x of row.xs) slots.push({ x, y: row.y, size: row.size });
  // Draw back to front: sort by y.
  const items: { x: number; y: number; size: number; img: Sprite }[] = [];
  p.buildings.forEach((id, i) => {
    const slot = slots[i % slots.length];
    const wobble = i >= slots.length ? 6 : 0;
    items.push({ x: slot.x + wobble, y: slot.y, size: slot.size, img: lookup(`buildings/${id}`, buildingSprite(id, BUILDINGS[id].category)) });
  });
  items.push({ x: 80, y: 86, size: 34, img: lookup(`halls/${f.species}`, hallSprite(f.species, f.color)) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    const [w, h] = fit(it.img, it.size);
    ctx.imageSmoothingEnabled = it.img.width > 128;
    ctx.drawImage(it.img, Math.round((it.x - w / 2) * scale), Math.round((it.y - h) * scale), w * scale, h * scale);
  }
  ctx.imageSmoothingEnabled = false;
}

export function planetScene(p: Planet, f: Faction, scale = 2): HTMLCanvasElement {
  const key = `${p.id}:${p.type}:${f.species}:${p.buildings.join(',')}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  drawScene(c, p, f, scale, gameArt);
  if (cache.size > 40) cache.clear();
  cache.set(key, c);
  return c;
}

// The scene at 8 times the size, drawn from the full size originals of the generated images where they exist.
export async function planetSceneLarge(p: Planet, f: Faction): Promise<HTMLCanvasElement> {
  const keys = [`scenes/${p.type}`, `halls/${f.species}`, ...p.buildings.map((id) => `buildings/${id}`)];
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(
    keys.map((key) => {
      const src = artUrl(key);
      if (!src || loaded.has(key)) return;
      return new Promise<void>((done) => {
        const img = new Image();
        img.onload = () => {
          loaded.set(key, img);
          done();
        };
        img.onerror = () => done();
        img.src = originalUrl(src);
      });
    }),
  );
  const c = document.createElement('canvas');
  drawScene(c, p, f, 8, (key, fallback) => loaded.get(key) ?? fallback);
  return c;
}

export function clearSceneCache() {
  cache.clear();
}

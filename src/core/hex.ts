// Pointy-top hexes in an "odd-r" offset layout. A hex is identified by its index: row * width + col.

export interface Grid {
  width: number;
  height: number;
}

const EVEN_ROW = [
  [1, 0],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const ODD_ROW = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 1],
];

export function col(g: Grid, i: number): number {
  return i % g.width;
}

export function row(g: Grid, i: number): number {
  return Math.floor(i / g.width);
}

export function index(g: Grid, c: number, r: number): number {
  if (c < 0 || r < 0 || c >= g.width || r >= g.height) return -1;
  return r * g.width + c;
}

export function neighbors(g: Grid, i: number): number[] {
  const c = col(g, i);
  const r = row(g, i);
  const dirs = r & 1 ? ODD_ROW : EVEN_ROW;
  const out: number[] = [];
  for (const [dc, dr] of dirs) {
    const n = index(g, c + dc, r + dr);
    if (n >= 0) out.push(n);
  }
  return out;
}

function toCube(g: Grid, i: number): [number, number, number] {
  const c = col(g, i);
  const r = row(g, i);
  const x = c - (r - (r & 1)) / 2;
  const z = r;
  return [x, -x - z, z];
}

export function distance(g: Grid, a: number, b: number): number {
  const [ax, ay, az] = toCube(g, a);
  const [bx, by, bz] = toCube(g, b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

// All hexes with distance <= radius from the center, the center included.
export function within(g: Grid, center: number, radius: number): number[] {
  const out: number[] = [];
  const c0 = col(g, center);
  const r0 = row(g, center);
  for (let r = r0 - radius; r <= r0 + radius; r++) {
    for (let c = c0 - radius - 1; c <= c0 + radius + 1; c++) {
      const i = index(g, c, r);
      if (i >= 0 && distance(g, center, i) <= radius) out.push(i);
    }
  }
  return out;
}

export function ring(g: Grid, center: number, radius: number): number[] {
  return within(g, center, radius).filter((i) => distance(g, center, i) === radius);
}

// Pixel center of a hex for a given hex size (distance from center to corner).
export function hexCenter(g: Grid, i: number, size: number): { x: number; y: number } {
  const c = col(g, i);
  const r = row(g, i);
  const w = Math.sqrt(3) * size;
  return { x: w * (c + 0.5 * (r & 1)) + w / 2, y: size * 1.5 * r + size };
}

export function pixelToHex(g: Grid, x: number, y: number, size: number): number {
  const w = Math.sqrt(3) * size;
  const rApprox = Math.round((y - size) / (size * 1.5));
  let best = -1;
  let bestD = Infinity;
  for (let r = rApprox - 1; r <= rApprox + 1; r++) {
    const cApprox = Math.round((x - w / 2) / w - 0.5 * (r & 1));
    for (let c = cApprox - 1; c <= cApprox + 1; c++) {
      const i = index(g, c, r);
      if (i < 0) continue;
      const p = hexCenter(g, i, size);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return bestD <= size * size ? best : -1;
}

import { RESOURCES, TERRAIN, YIELD_KEYS } from '../core/data/terrain';
import { UNITS } from '../core/data/units';
import { canAttack, canInvade } from '../core/combat';
import { hexYield, planetMaxHp } from '../core/economy';
import { hexCenter, neighbors, pixelToHex } from '../core/hex';
import { claimOptions } from '../core/planet';
import { hexFaction, resourceVisible } from '../core/rules';
import type { Unit } from '../core/types';
import type { App } from './app';
import { icon, iconSprite, planetSprite, resourceIcon, starSprite, stationSprite, terrainSprite, unitSprite } from './art';

export const ZOOMS = [16, 24, 36, 48, 72];

// The fonts of the interface (src/style.css), for text on the map.
const FONT_BODY = '"Zilla Slab", Georgia, serif';
const FONT_STENCIL = '"Big Shoulders Stencil Display", Impact, sans-serif';

export interface Effect {
  hex: number;
  text: string;
  color: string;
  start: number;
}

// A unit slides along a path of hexes.
export interface UnitAnim {
  path: number[];
  start: number;
  msPerHex: number;
}

// A hex outline that grows and fades, for a new border hex.
export interface Pulse {
  hex: number;
  start: number;
  color: string;
}

const EFFECT_MS = 1400;
const PULSE_MS = 1300;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  // Size of the canvas in CSS pixels. The canvas bitmap is larger by the device pixel ratio, so text and lines stay crisp.
  width = 0;
  height = 0;
  private dpr = 1;
  private pending = false;
  private edgePattern: CanvasPattern | null = null;

  constructor(
    public canvas: HTMLCanvasElement,
    private app: App,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      this.request();
    });
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  request(delay = 0) {
    if (this.pending) return;
    this.pending = true;
    const run = () =>
      requestAnimationFrame(() => {
        this.pending = false;
        this.draw();
        const busy = this.app.effects.length || this.app.anims.size || this.app.pulses.length;
        // The selected unit pulses slowly, so the map redraws at a low rate while a unit is selected.
        if (busy) this.request();
        else if (this.app.selectedUnit && !this.app.screen) this.request(60);
      });
    if (delay) setTimeout(run, delay);
    else run();
  }

  get size(): number {
    return this.app.camera.size;
  }

  center(hex: number): { x: number; y: number } {
    const p = hexCenter(this.app.s, hex, this.size);
    return { x: p.x - this.app.camera.x, y: p.y - this.app.camera.y };
  }

  hexAt(x: number, y: number): number {
    return pixelToHex(this.app.s, x + this.app.camera.x, y + this.app.camera.y, this.size);
  }

  // Puts the hex in the middle of the window. Near the rim of the galaxy the map stops earlier, so that the window
  // shows at most two rows of the space beyond the last hexes.
  centerOn(hex: number) {
    const s = this.app.s;
    const p = hexCenter(s, hex, this.size);
    const cam = this.app.camera;
    const w = Math.sqrt(3) * this.size * (s.width + 0.5);
    const h = this.size * 1.5 * s.height + this.size * 0.5;
    const mx = Math.sqrt(3) * this.size * 2;
    const my = this.size * 3;
    const fit = (want: number, map: number, win: number, margin: number) =>
      map + 2 * margin <= win ? (map - win) / 2 : Math.max(-margin, Math.min(map - win + margin, want));
    cam.x = fit(p.x - this.width / 2, w, this.width, mx);
    cam.y = fit(p.y - this.height / 2, h, this.height, my);
    this.clamp();
  }

  clamp() {
    const s = this.app.s;
    const w = Math.sqrt(3) * this.size * (s.width + 0.5);
    const h = this.size * 1.5 * s.height + this.size * 0.5;
    const cam = this.app.camera;
    const mx = this.width * 0.5;
    const my = this.height * 0.5;
    cam.x = Math.max(-mx, Math.min(w - this.width + mx, cam.x));
    cam.y = Math.max(-my, Math.min(h - this.height + my, cam.y));
  }

  zoom(dir: number, px: number, py: number) {
    const at = ZOOMS.indexOf(this.size);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, at + dir))];
    if (next === this.size) return;
    const cam = this.app.camera;
    const k = next / this.size;
    cam.x = (cam.x + px) * k - px;
    cam.y = (cam.y + py) * k - py;
    cam.size = next;
    this.clamp();
    this.request();
  }

  private path(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  private sprite(img: CanvasImageSource & { width: number; height: number }, x: number, y: number, scale: number, maxSize?: number) {
    let w = img.width * scale;
    let h = img.height * scale;
    if (maxSize && img instanceof HTMLImageElement) {
      // An external image: fit it into the space of the placeholder.
      const k = maxSize / Math.max(img.width, img.height);
      w = img.width * k;
      h = img.height * k;
    }
    // An image drawn at a whole multiple of its pixels keeps hard pixels. Any other scale is smoothed, because
    // nearest neighbour sampling would give pixels of uneven size.
    const k = (w * this.dpr) / img.width;
    this.ctx.imageSmoothingEnabled = Math.abs(k - Math.round(k)) > 0.02;
    this.ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    this.ctx.imageSmoothingEnabled = false;
  }

  // The starfall beyond the last hexes. Streaks of light fall away from the galaxy, as on an old flat chart.
  private drawEdge() {
    const { ctx, app } = this;
    const s = app.s;
    const R = this.size;
    if (!this.edgePattern) {
      const tile = document.createElement('canvas');
      tile.width = 96;
      tile.height = 192;
      const t = tile.getContext('2d')!;
      t.fillStyle = '#05060a';
      t.fillRect(0, 0, 96, 192);
      let seed = 7;
      const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(r() * 96);
        const y = Math.floor(r() * 192);
        const len = 10 + Math.floor(r() * 50);
        const g = t.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, 'rgba(120, 90, 200, 0)');
        g.addColorStop(0.7, r() < 0.5 ? 'rgba(140, 110, 220, 0.35)' : 'rgba(90, 140, 200, 0.3)');
        g.addColorStop(1, 'rgba(240, 230, 200, 0.9)');
        t.fillStyle = g;
        t.fillRect(x, y, 1, len);
        t.fillStyle = '#f0e6c8';
        t.fillRect(x, y + len, 1, 1);
      }
      this.edgePattern = ctx.createPattern(tile, 'repeat');
    }
    // World bounds of the hex map.
    const w = Math.sqrt(3) * R;
    const left = -app.camera.x;
    const top = -app.camera.y;
    const right = left + w * (s.width + 0.5);
    const bottom = top + R * 1.5 * s.height + R * 0.5;
    ctx.save();
    ctx.translate(-app.camera.x, -app.camera.y);
    ctx.fillStyle = this.edgePattern!;
    ctx.fillRect(app.camera.x, app.camera.y, this.width, this.height);
    ctx.restore();
    // A glow along the rim.
    ctx.save();
    ctx.shadowColor = 'rgba(180, 160, 255, 0.8)';
    ctx.shadowBlur = R * 0.8;
    ctx.strokeStyle = 'rgba(200, 190, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(left - R * 0.2, top - R * 0.6, right - left + R * 0.4, bottom - top + R * 1.2);
    ctx.restore();
    // Warnings in the margins, as on an old chart.
    ctx.font = `800 ${Math.max(13, Math.round(R * 0.45))}px ${FONT_STENCIL}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200, 190, 255, 0.45)';
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    ctx.fillText('HERE THE CHARTS END', cx, top - R * 1.6);
    ctx.fillText('HERE THE CHARTS END', cx, bottom + R * 1.6);
    ctx.save();
    ctx.translate(left - R * 1.6, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('SHIPS DO NOT RETURN FROM THE FALLS', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(right + R * 1.6, cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('SHIPS DO NOT RETURN FROM THE FALLS', 0, 0);
    ctx.restore();
  }

  draw() {
    const { ctx, app } = this;
    const s = app.s;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, this.width, this.height);
    if (!s) return;
    this.drawEdge();
    const R = this.size;
    const k = R / 24;
    const me = app.faction;
    const vis = app.vis;
    const w = Math.sqrt(3) * R;
    const planetView = app.planetId !== null ? s.planets[app.planetId] : null;

    const r0 = Math.max(0, Math.floor(app.camera.y / (R * 1.5)) - 1);
    const r1 = Math.min(s.height - 1, Math.ceil((app.camera.y + this.height) / (R * 1.5)) + 1);
    const c0 = Math.max(0, Math.floor(app.camera.x / w) - 1);
    const c1 = Math.min(s.width - 1, Math.ceil((app.camera.x + this.width) / w) + 1);
    const shown: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) shown.push(r * s.width + c);

    // Terrain
    for (const i of shown) {
      const { x, y } = this.center(i);
      if (!me.explored[i]) {
        this.path(x, y, R);
        ctx.fillStyle = '#090a0f';
        ctx.fill();
        continue;
      }
      const h = s.hexes[i];
      this.path(x, y, R);
      ctx.fillStyle = (i * 7) % 3 === 0 ? '#0e1119' : '#0c0f16';
      ctx.fill();
      const owner = hexFaction(s, i);
      if (owner >= 0) {
        ctx.fillStyle = s.factions[owner].color;
        ctx.globalAlpha = 0.13;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (h.terrain === 'star') this.sprite(starSprite(i), x, y, k, R * 1.7);
      else if (h.terrain === 'planet') {
        this.sprite(terrainSprite('space', i), x, y, k);
        this.sprite(planetSprite(s.planets[h.planetId!].type, h.planetId!), x, y, k, R * 1.4);
      } else this.sprite(terrainSprite(h.terrain, i), x, y, k, R * 1.5);

      const mark = k * 1.5;
      // The station stands at the lower right of the hex. A resource has a dark disc with a ring: gold for
      // strategic, teal for luxury. With a station on the hex, the disc sits on the corner of the station.
      const sx = x + R * 0.4;
      const sy = y + R * 0.36;
      if (h.station) this.sprite(stationSprite(h.terrain), sx, sy, mark, R * 0.95);
      if (h.resource && resourceVisible(me, h.resource)) {
        const rr = Math.max(12, R * 0.42) * (h.station ? 0.75 : 1);
        const rx = h.station ? sx - R * 0.38 : x - R * 0.45;
        const ry = h.station ? sy + R * 0.22 : y + R * 0.4;
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 12, 18, 0.8)';
        ctx.fill();
        ctx.strokeStyle = RESOURCES[h.resource].kind === 'strategic' ? '#f0c93a' : '#6fd0d0';
        ctx.lineWidth = Math.max(1.5, R * 0.05);
        ctx.stroke();
        this.sprite(resourceIcon(h.resource), rx, ry, mark, rr * 1.7);
      }
      if (h.anomaly) this.sprite(icon('anomaly'), x, y, mark * 1.2);
      if (h.den && vis[i]) this.sprite(icon('den'), x, y, mark * 1.2);
    }

    // Borders
    ctx.lineWidth = Math.max(2, R / 14);
    for (const i of shown) {
      if (!me.explored[i]) continue;
      const owner = hexFaction(s, i);
      if (owner < 0) continue;
      const { x, y } = this.center(i);
      ctx.strokeStyle = s.factions[owner].color;
      for (const n of neighbors(s, i)) {
        if (hexFaction(s, n) === owner) continue;
        const p = this.center(n);
        const a = Math.atan2(p.y - y, p.x - x);
        const mx = x + Math.cos(a) * R * 0.82;
        const my = y + Math.sin(a) * R * 0.82;
        const ex = Math.cos(a + Math.PI / 2) * R * 0.48;
        const ey = Math.sin(a + Math.PI / 2) * R * 0.48;
        ctx.beginPath();
        ctx.moveTo(mx - ex, my - ey);
        ctx.lineTo(mx + ex, my + ey);
        ctx.stroke();
      }
    }

    // Planet view: worked hexes and hexes that the player can buy
    if (planetView && planetView.owner === app.me) {
      const options = app.mode === 'buyHex' ? claimOptions(s, planetView) : [];
      for (const i of shown) {
        const { x, y } = this.center(i);
        if (s.hexes[i].owner === planetView.id && i !== planetView.hex) {
          const worked = planetView.worked.includes(i);
          this.path(x, y, R * 0.92);
          ctx.strokeStyle = worked ? '#7fc25a' : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = worked ? 3 : 1;
          ctx.stroke();
          if (planetView.locked.includes(i)) {
            ctx.fillStyle = '#7fc25a';
            ctx.fillRect(x - 3, y - R * 0.75, 6, 6);
          }
        }
        if (options.includes(i)) {
          this.path(x, y, R * 0.9);
          ctx.fillStyle = 'rgba(240,201,58,0.18)';
          ctx.fill();
          ctx.strokeStyle = '#f0c93a';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Yields
    if (app.showYields || planetView) {
      for (const i of shown) {
        if (!me.explored[i]) continue;
        const h = s.hexes[i];
        if (!TERRAIN[h.terrain].workable) continue;
        if (planetView && h.owner !== planetView.id && !(app.mode === 'buyHex')) continue;
        this.yields(i);
      }
    }

    // Reach and targets of the selected unit
    const sel = app.selectedUnit;
    if (sel && !planetView) {
      if (app.reach) {
        for (const [i] of app.reach) {
          const { x, y } = this.center(i);
          this.path(x, y, R * 0.9);
          ctx.fillStyle = 'rgba(111,208,240,0.13)';
          ctx.fill();
        }
      }
      for (const i of app.targets) {
        const { x, y } = this.center(i);
        this.path(x, y, R * 0.9);
        ctx.fillStyle = 'rgba(209,73,91,0.28)';
        ctx.fill();
        ctx.strokeStyle = '#d1495b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (app.pathPreview.length) {
        // Dots along the path, and a numbered marker where each shift ends.
        const turns = app.pathTurns;
        app.pathPreview.forEach((i, n) => {
          const { x, y } = this.center(i);
          const last = n === app.pathPreview.length - 1;
          const turnEnd = last || turns[n + 1] !== turns[n];
          if (!turnEnd) {
            ctx.fillStyle = '#f0e6c8';
            ctx.fillRect(x - 3, y - 3, 6, 6);
            return;
          }
          const r = Math.max(8, R * 0.22);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#14110f';
          ctx.fill();
          ctx.strokeStyle = '#f0e6c8';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.font = `bold ${Math.round(r * 1.2)}px ${FONT_BODY}`;
          ctx.fillStyle = '#f0e6c8';
          ctx.fillText(String(turns[n]), x, y + 1);
        });
      }
      if (sel.order?.kind === 'goto') {
        const { x, y } = this.center(sel.order.target);
        this.path(x, y, R * 0.5);
        ctx.strokeStyle = '#f0e6c8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Fog on explored hexes that are not visible now
    for (const i of shown) {
      if (!me.explored[i] || vis[i]) continue;
      const { x, y } = this.center(i);
      this.path(x, y, R);
      ctx.fillStyle = 'rgba(5,6,10,0.55)';
      ctx.fill();
    }

    // Planet labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const i of shown) {
      const h = s.hexes[i];
      if (!me.explored[i]) continue;
      if (h.planetId === undefined) continue;
      const p = s.planets[h.planetId];
      const { x, y } = this.center(i);
      const fontSize = Math.max(11, Math.round(R * 0.3));
      ctx.font = `bold ${fontSize}px ${FONT_BODY}`;
      const label = p.owner >= 0 ? `${p.pop} ${p.name}` : p.name;
      const tw = ctx.measureText(label).width + 8;
      const ly = y + R * 0.78;
      ctx.fillStyle = p.owner >= 0 ? s.factions[p.owner].color : '#2a2c33';
      ctx.fillRect(Math.round(x - tw / 2), Math.round(ly - fontSize * 0.7), Math.round(tw), Math.round(fontSize * 1.4));
      ctx.strokeStyle = '#14110f';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(x - tw / 2), Math.round(ly - fontSize * 0.7), Math.round(tw), Math.round(fontSize * 1.4));
      ctx.fillStyle = p.owner >= 0 ? '#14110f' : '#b8b2a4';
      ctx.fillText(label, x, ly + 1);
      if (p.owner >= 0 && vis[i]) {
        const max = planetMaxHp(s, p);
        if (p.hp < max) this.bar(x, y - R * 0.72, R * 1.1, p.hp / max, p.hp <= 0 ? '#d1495b' : '#e08a3a');
      }
    }

    // Border pulses
    const now0 = performance.now();
    app.pulses = app.pulses.filter((p) => now0 - p.start < PULSE_MS);
    for (const p of app.pulses) {
      const t = (now0 - p.start) / PULSE_MS;
      if (t < 0) continue; // the pulse starts later
      const { x, y } = this.center(p.hex);
      this.path(x, y, R * (0.5 + 0.45 * t));
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Units. A unit with an animation is drawn on its way instead of on its hex.
    const moving: { u: Unit; x: number; y: number }[] = [];
    for (const [id, anim] of app.anims) {
      const u = s.units.find((o) => o.id === id);
      const t = (now0 - anim.start) / (anim.msPerHex * (anim.path.length - 1));
      if (!u || t >= 1 || anim.path.length < 2) {
        app.anims.delete(id);
        continue;
      }
      if (t < 0) continue;
      const seg = Math.min(anim.path.length - 2, Math.floor(t * (anim.path.length - 1)));
      const k = t * (anim.path.length - 1) - seg;
      const a = this.center(anim.path[seg]);
      const b = this.center(anim.path[seg + 1]);
      moving.push({ u, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
    const byHex = new Map<number, Unit[]>();
    for (const u of s.units) {
      if (u.owner !== app.me && vis[u.hex] !== 2) continue;
      if (app.anims.has(u.id)) continue;
      const list = byHex.get(u.hex) ?? [];
      list.push(u);
      byHex.set(u.hex, list);
    }
    for (const i of shown) {
      const list = byHex.get(i);
      if (!list) continue;
      list.sort((a, b) => (UNITS[a.type].cls === 'military' ? 0 : 1) - (UNITS[b.type].cls === 'military' ? 0 : 1));
      const { x, y } = this.center(i);
      const onPlanet = s.hexes[i].terrain === 'planet';
      list.forEach((u, n) => {
        const two = list.length > 1;
        if (onPlanet) {
          // Units on a planet sit small in the lower half of the hex, so the planet stays visible.
          this.unit(u, x + (two ? (n ? R * 0.42 : -R * 0.42) : -R * 0.42), y + R * 0.12, 0.6);
          return;
        }
        const ux = x + (two ? (n ? R * 0.36 : -R * 0.3) : 0);
        const uy = y + (two && n ? R * 0.2 : 0);
        this.unit(u, ux, uy, two ? 0.75 : 1);
      });
    }

    for (const m of moving) this.unit(m.u, m.x, m.y, 1);

    // Floating text
    const now = performance.now();
    app.effects = app.effects.filter((e) => now - e.start < EFFECT_MS);
    for (const e of app.effects) {
      const t = (now - e.start) / EFFECT_MS;
      const { x, y } = this.center(e.hex);
      ctx.font = `bold ${Math.round(R * 0.42)}px ${FONT_BODY}`;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = '#14110f';
      ctx.fillText(e.text, x + 2, y - R * 0.3 - t * R + 2);
      ctx.fillStyle = e.color;
      ctx.fillText(e.text, x, y - R * 0.3 - t * R);
      ctx.globalAlpha = 1;
    }

    // Hover outline
    if (app.hover >= 0) {
      const { x, y } = this.center(app.hover);
      this.path(x, y, R * 0.96);
      ctx.strokeStyle = 'rgba(240,230,200,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private bar(x: number, y: number, width: number, share: number, color: string) {
    const ctx = this.ctx;
    const h = Math.max(4, Math.round(this.size / 9));
    ctx.fillStyle = '#14110f';
    ctx.fillRect(Math.round(x - width / 2) - 1, Math.round(y) - 1, Math.round(width) + 2, h + 2);
    ctx.fillStyle = '#3a2a28';
    ctx.fillRect(Math.round(x - width / 2), Math.round(y), Math.round(width), h);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - width / 2), Math.round(y), Math.round(width * Math.max(0, Math.min(1, share))), h);
  }

  private unit(u: Unit, x: number, y: number, scale: number) {
    const { ctx, app } = this;
    const s = app.s;
    const R = this.size;
    const f = s.factions[u.owner];
    const k = (R / 24) * scale * 1.5;
    const selected = app.selected === u.id;
    const mine = u.owner === app.me;
    // Base plate in the faction colour
    const pw = R * 0.62 * scale;
    ctx.fillStyle = '#14110f';
    ctx.fillRect(Math.round(x - pw - 2), Math.round(y + R * 0.3 * scale - 2), Math.round(pw * 2 + 4), Math.round(R * 0.2 * scale + 4));
    ctx.fillStyle = f.color;
    ctx.fillRect(Math.round(x - pw), Math.round(y + R * 0.3 * scale), Math.round(pw * 2), Math.round(R * 0.2 * scale));
    if (selected) {
      // A slow pulse round the hex of the selected unit, and a steady frame round the unit.
      const t = (Math.sin(performance.now() / 350) + 1) / 2;
      const hex = this.center(u.hex);
      this.path(hex.x, hex.y, R * (0.86 + 0.1 * t));
      ctx.strokeStyle = `rgba(255, 242, 176, ${0.35 + 0.55 * t})`;
      ctx.lineWidth = 2 + 2 * t;
      ctx.stroke();
      ctx.strokeStyle = '#fff2b0';
      ctx.lineWidth = 3;
      ctx.strokeRect(Math.round(x - pw - 4), Math.round(y - R * 0.62 * scale), Math.round(pw * 2 + 8), Math.round(R * 1.2 * scale));
    }
    if (mine && u.moves <= 0) ctx.globalAlpha = 0.6;
    this.sprite(unitSprite(u.type, f.color), x, y - R * 0.06 * scale, k, R * 1.1 * scale);
    ctx.globalAlpha = 1;
    if (u.hp < 100) this.bar(x, y + R * 0.52 * scale, pw * 2, u.hp / 100, u.hp > 50 ? '#7fc25a' : u.hp > 25 ? '#e0b03a' : '#d1495b');
    if (u.order && mine) {
      const letter = { goto: '>', build: 'B', sleep: 'z', fortify: 'F', explore: 'E' }[u.order.kind];
      ctx.font = `bold ${Math.round(R * 0.3)}px ${FONT_BODY}`;
      ctx.fillStyle = '#14110f';
      ctx.fillText(letter, x + pw + 1, y - R * 0.4 * scale + 1);
      ctx.fillStyle = '#fff2b0';
      ctx.fillText(letter, x + pw, y - R * 0.4 * scale);
    }
  }

  private yields(hex: number) {
    const { ctx, app } = this;
    const R = this.size;
    const yl = hexYield(app.s, app.faction, hex);
    const parts: { key: string; n: number }[] = [];
    for (const key of YIELD_KEYS) if (yl[key] > 0) parts.push({ key, n: yl[key] });
    if (!parts.length) return;
    const { x, y } = this.center(hex);
    const size = Math.max(10, Math.round(R * 0.3));
    const total = parts.length * (size + 12);
    let px = x - total / 2;
    ctx.font = `bold ${Math.round(size * 0.95)}px ${FONT_BODY}`;
    ctx.textAlign = 'left';
    for (const p of parts) {
      const img = iconSprite(p.key);
      ctx.imageSmoothingEnabled = img instanceof HTMLImageElement;
      ctx.drawImage(img, Math.round(px), Math.round(y - R * 0.62), size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#14110f';
      ctx.fillText(String(p.n), px + size + 2, y - R * 0.62 + size / 2 + 2);
      ctx.fillStyle = '#f0e6c8';
      ctx.fillText(String(p.n), px + size + 1, y - R * 0.62 + size / 2 + 1);
      px += size + 12;
    }
    ctx.textAlign = 'center';
  }

  // Hexes that the unit can attack or invade from its position.
  static targets(app: App, u: Unit): number[] {
    const s = app.s;
    const def = UNITS[u.type];
    const out: number[] = [];
    const range = def.ranged ? (def.range ?? 1) : 1;
    const R = range;
    for (let i = 0; i < s.hexes.length; i++) {
      if (app.vis[i] !== 2 && s.hexes[i].planetId === undefined) continue;
      const dx = Math.abs((i % s.width) - (u.hex % s.width));
      const dy = Math.abs(Math.floor(i / s.width) - Math.floor(u.hex / s.width));
      if (dx > R + 1 || dy > R + 1) continue;
      if (canAttack(s, u, i) || canInvade(s, u, i)) out.push(i);
    }
    return out;
  }
}

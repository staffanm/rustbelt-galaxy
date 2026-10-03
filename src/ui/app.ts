import { UNITS } from '../core/data/units';
import { attack, canAttack, canInvade, engage, invade, preview } from '../core/combat';
import { capital } from '../core/economy';
import { recordEvents, type GameEvent } from '../core/events';
import { distance } from '../core/hex';
import {
  buildStation,
  canBuildStation,
  canColonizeHere,
  colonize,
  disband,
  findPath,
  orderMove,
  pathTurns,
  reachable,
  upgrade,
} from '../core/movement';
import { buyHex, claimOptions, toggleWorked } from '../core/planet';
import { researchOptions } from '../core/research';
import { atWar, ownedPlanets } from '../core/rules';
import { endTurn as coreEndTurn } from '../core/turn';
import type { Faction, GameState, LogEntry, Planet, Unit } from '../core/types';
import { computeVisible, updateExplored } from '../core/visibility';
import { autoExplore } from '../core/ai/ai';
import { renderHud } from './hud';
import { SCREEN_KEYS, cycleFocus, screenKey } from './keys';
import { Renderer, type Effect, type Pulse, type UnitAnim } from './renderer';
import { AUTOSAVE, saveGame } from './save';
import { renderScreen } from './screens';

export type ScreenId =
  | 'tech'
  | 'diplomacy'
  | 'forum'
  | 'encyclopedia'
  | 'menu'
  | 'saves'
  | 'newgame'
  | 'end'
  | 'log'
  | 'units'
  | 'planets'
  | 'budget'
  | 'power'
  | 'help'
  | 'about'
  | null;

export class App {
  s!: GameState;
  me = 0;
  vis: Uint8Array = new Uint8Array(0);
  selected: number | null = null;
  planetId: number | null = null;
  screen: ScreenId = 'menu';
  screenArg: string | undefined;
  hover = -1;
  edgeHover = false; // the mouse is on the map canvas but beyond the last hexes
  mode: 'normal' | 'buyHex' = 'normal';
  // On a phone the planet shows one tab at a time. The map tab hides the panel and keeps the planet open.
  planetTab: 'planet' | 'production' | 'map' = 'planet';
  // On a phone a long press shows the hex sheet in place of the unit sheet until the next tap.
  peek = false;
  // On a phone the menu button opens a dropdown over the map.
  menuOpen = false;
  // The planet search on the map: the text typed so far, or null when the box is closed. Key: /
  search: string | null = null;
  searchPick = 0;
  showYields = false;
  camera = { x: 0, y: 0, size: 48 };
  reach: Map<number, number> | null = null;
  targets: number[] = [];
  pathPreview: number[] = [];
  pathTurns: number[] = [];
  effects: Effect[] = [];
  anims = new Map<number, UnitAnim>();
  pulses: Pulse[] = [];
  skipped = new Set<number>();
  toasts: LogEntry[] = [];
  endShown = false;
  artCount = 0;
  techFocus: string | undefined;
  // The log entries that were shown as toasts. The log is trimmed, so an index into it is not stable.
  private shown = new WeakSet<LogEntry>();
  // Toasts of the last shift, on their way out.
  fading = new Set<LogEntry>();
  private events: GameEvent[] = [];
  renderer: Renderer;
  hud: HTMLElement;
  overlay: HTMLElement;

  constructor(canvas: HTMLCanvasElement, hud: HTMLElement, overlay: HTMLElement) {
    this.hud = hud;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas, this);
    this.bind(canvas);
  }

  get faction(): Faction {
    return this.s.factions[this.me];
  }

  get selectedUnit(): Unit | null {
    if (this.selected === null) return null;
    return this.s.units.find((u) => u.id === this.selected) ?? null;
  }

  get planet(): Planet | null {
    return this.planetId === null ? null : this.s.planets[this.planetId];
  }

  get hasGame(): boolean {
    return !!this.s;
  }

  // A phone or a small window: one thing in focus at a time, touch gestures, full-screen sheets.
  get mobile(): boolean {
    return window.innerWidth < 900 || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1200);
  }

  start(s: GameState) {
    this.s = s;
    // A phone goes full screen when the browser permits it. iOS Safari does not; there the home-screen app is full screen.
    if (this.mobile && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
    this.me = Math.max(0, s.factions.findIndex((f) => f.isHuman));
    this.selected = null;
    this.planetId = null;
    this.screen = null;
    this.mode = 'normal';
    this.skipped.clear();
    this.toasts = [];
    this.effects = [];
    this.anims.clear();
    this.pulses = [];
    this.endShown = false;
    for (const l of s.log) this.shown.add(l);
    this.fading.clear();
    this.events = recordEvents(s);
    updateExplored(s, this.me);
    const cap = capital(s, this.me);
    const first = s.units.find((u) => u.owner === this.me);
    this.renderer.centerOn(cap?.hex ?? first?.hex ?? 0);
    this.selectNext();
    if (s.winner || !this.faction.alive) this.screen = 'end';
    this.refresh();
  }

  // Draws the map and all panels again from the game state.
  refresh() {
    document.body.classList.toggle('mobile', this.mobile);
    if (this.s) {
      this.vis = computeVisible(this.s, this.me);
      const u = this.selectedUnit;
      if (!u) this.selected = null;
      this.reach = u && u.owner === this.me && u.moves > 0 ? reachable(this.s, u) : null;
      this.targets = u && u.owner === this.me ? Renderer.targets(this, u) : [];
      this.collectLog();
      if ((this.s.winner || !this.faction.alive) && !this.endShown) {
        this.endShown = true;
        this.screen = 'end';
      }
    }
    renderHud(this);
    renderScreen(this);
    this.renderer.request();
  }

  private collectLog() {
    for (const l of this.s.log) {
      if (this.shown.has(l)) continue;
      this.shown.add(l);
      if (l.faction === this.me || l.faction === -1) this.toasts.push(l);
    }
    if (this.toasts.length > 12) this.toasts.splice(0, this.toasts.length - 12);
  }

  // The toasts of the shift that ends slide away, so the new shift starts with the news of the new shift only.
  private fadeToasts() {
    const old = this.toasts.filter((t) => !this.fading.has(t));
    if (!old.length) return;
    for (const t of old) this.fading.add(t);
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => !this.fading.has(t));
      this.fading.clear();
      this.refresh();
    }, 600);
  }

  // The screen that Close returns to, when a screen was opened from another screen: the encyclopedia from the new game screen.
  private back: ScreenId = null;

  open(screen: ScreenId, arg?: string) {
    this.menuOpen = false;
    if (screen === 'encyclopedia' && this.screen === 'newgame') this.back = 'newgame';
    else if (screen !== 'encyclopedia') this.back = null;
    this.screen = screen;
    this.screenArg = arg;
    this.refresh();
  }

  close() {
    if (this.screen === 'end') this.endShown = true;
    if (this.back) {
      const to = this.back;
      this.back = null;
      this.open(to);
      return;
    }
    this.screen = this.hasGame ? null : 'menu';
    this.refresh();
  }

  // Selection

  needsOrders(): Unit[] {
    return this.s.units.filter((u) => u.owner === this.me && u.moves > 0 && !u.order && !this.skipped.has(u.id));
  }

  select(u: Unit | null, center = false) {
    this.selected = u?.id ?? null;
    this.planetId = null;
    this.mode = 'normal';
    this.pathPreview = [];
    if (u && center) this.renderer.centerOn(u.hex);
  }

  selectNext(center = true) {
    const list = this.needsOrders();
    if (!list.length) {
      this.selected = null;
      return;
    }
    const cur = this.selectedUnit;
    const from = cur?.hex ?? this.renderer.hexAt(window.innerWidth / 2, window.innerHeight / 2);
    const ref = from >= 0 ? from : list[0].hex;
    const next = list.filter((u) => u.id !== cur?.id).sort((a, b) => distance(this.s, ref, a.hex) - distance(this.s, ref, b.hex))[0] ?? list[0];
    this.select(next, center);
  }

  openPlanet(p: Planet, tab: App['planetTab'] = 'planet') {
    this.planetId = p.id;
    this.planetTab = tab;
    this.selected = null;
    this.mode = 'normal';
    this.renderer.centerOn(p.hex);
    this.refresh();
  }

  closePlanet() {
    this.planetId = null;
    this.mode = 'normal';
    this.selectNext(false);
    this.refresh();
  }

  clickHex(hex: number) {
    const s = this.s;
    if (hex < 0 || s.winner) return;
    const h = s.hexes[hex];
    const p = this.planet;
    if (p) {
      if (this.mode === 'buyHex' && claimOptions(s, p).includes(hex)) {
        buyHex(s, p, hex);
        this.mode = 'normal';
        if (this.mobile) this.planetTab = 'planet';
      } else if (h.owner === p.id && hex !== p.hex) toggleWorked(s, p, hex);
      else if (h.planetId !== undefined && s.planets[h.planetId].owner === this.me && h.planetId !== p.id) {
        this.openPlanet(s.planets[h.planetId]);
        return;
      } else this.planetId = null;
      this.refresh();
      return;
    }
    const units = s.units
      .filter((u) => u.hex === hex && u.owner === this.me)
      .sort((a, b) => (UNITS[a.type].cls === 'military' ? 0 : 1) - (UNITS[b.type].cls === 'military' ? 0 : 1));
    const planet = h.planetId !== undefined && s.planets[h.planetId].owner === this.me ? s.planets[h.planetId] : null;
    const at = units.findIndex((u) => u.id === this.selected);
    if (at >= 0 && at + 1 < units.length) this.select(units[at + 1]);
    else if (at >= 0 && planet) {
      this.openPlanet(planet);
      return;
    } else if (at < 0 && units.length) this.select(units[0]);
    else if (planet) {
      this.openPlanet(planet);
      return;
    } else this.select(null);
    this.refresh();
  }

  // A tap on the map with a finger. It selects an own unit, opens an own planet, or shows the hex in the sheet.
  // It never moves a unit: a move is a drag of the selected unit (dropUnit).
  tapHex(hex: number) {
    const s = this.s;
    this.peek = false;
    this.menuOpen = false;
    if (hex < 0) {
      this.hover = -1;
      this.select(null);
      this.refresh();
      return;
    }
    this.hover = hex;
    const u = this.selectedUnit;
    if (this.planet) {
      this.clickHex(hex);
      return;
    }
    const h = s.hexes[hex];
    // A tap on an own planet opens it. A unit on the planet hex is selected from the Units screen or in turn.
    if (h.planetId !== undefined && s.planets[h.planetId].owner === this.me && !(u && u.hex === hex)) {
      this.openPlanet(s.planets[h.planetId]);
      return;
    }
    if (s.units.some((x) => x.hex === hex && x.owner === this.me)) {
      this.clickHex(hex);
      return;
    }
    this.peek = true;
    this.refresh();
  }

  // The selected unit is dropped on a hex after a drag: a move, an attack or an invasion.
  dropUnit(hex: number) {
    const u = this.selectedUnit;
    this.peek = false;
    this.pathPreview = [];
    if (!u || u.owner !== this.me || hex < 0 || hex === u.hex) {
      this.refresh();
      return;
    }
    this.hover = hex;
    this.commandHex(hex);
  }

  // The known planets whose names contain the search text, nearest to the capital first.
  searchResults(): Planet[] {
    const s = this.s;
    const q = (this.search ?? '').trim().toLowerCase();
    const f = this.faction;
    const cap = capital(s, this.me);
    return s.planets
      .filter((p) => f.explored[p.hex] && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => (cap ? distance(s, cap.hex, a.hex) - distance(s, cap.hex, b.hex) : 0))
      .slice(0, 8);
  }

  // Closes the search and goes to the planet: the map centres on it, and an own planet opens.
  goToPlanet(p: Planet) {
    this.search = null;
    this.hover = p.hex;
    this.peek = this.mobile;
    this.showOnMap(p.hex);
    if (p.owner === this.me) this.openPlanet(p);
    else this.refresh();
  }

  // Moves the map to the hex and marks it with rings for a few seconds.
  showOnMap(hex: number) {
    this.renderer.centerOn(hex);
    const now = performance.now();
    for (let k = 0; k < 5; k++) this.pulses.push({ hex, start: now + k * 450, color: '#ffd866' });
    this.renderer.request();
  }

  float(hex: number, text: string, color: string, start = performance.now()) {
    this.effects.push({ hex, text, color, start: start + this.effects.filter((e) => e.hex === hex && Math.abs(e.start - start) < 250).length * 250 });
  }

  // Slides the unit along the path from its old position. Steps that the unit did not take are removed.
  animateMove(u: Unit, from: number, path: number[] | null, msPerHex = 110) {
    if (!this.s.units.includes(u) || u.hex === from) return;
    let steps = path ?? [];
    const at = steps.indexOf(u.hex);
    steps = at >= 0 ? steps.slice(0, at + 1) : [u.hex];
    const hexes = [from, ...steps];
    const now = performance.now();
    this.anims.set(u.id, { path: hexes, times: hexes.map((_, i) => now + i * msPerHex) });
  }

  commandHex(hex: number) {
    const s = this.s;
    const u = this.selectedUnit;
    if (!u || u.owner !== this.me || hex < 0 || s.winner || this.planet) return;
    const from = u.hex;
    const plan = findPath(s, u, hex);
    if (canInvade(s, u, hex)) {
      const res = invade(s, u, hex);
      if (res) this.float(hex, res.won ? 'CAPTURED' : 'REPELLED', res.won ? '#7fc25a' : '#d1495b');
    } else if (canAttack(s, u, hex)) {
      const res = attack(s, u, hex);
      if (res) {
        this.float(hex, `-${res.toDefender}`, '#ff6b5a');
        if (res.toAttacker) this.float(from, `-${res.toAttacker}`, '#ffb060');
        this.animateMove(u, from, [hex], 180);
      }
    } else {
      const peaceful = this.peacefulOccupant(hex);
      if (peaceful !== null) {
        this.float(hex, 'AT PEACE', '#b8b2a4');
        this.toasts.push({ turn: s.turn, faction: this.me, text: `You are at peace with the ${s.factions[peaceful].name}. Declare war on the Diplomacy screen to attack.`, tone: 'info' });
      } else {
        const fight = engage(s, u, hex);
        if (fight) {
          // An enemy out of reach: the unit moved next to it and attacked if it could.
          this.animateMove(u, from, fight.path);
          if (fight.result) {
            this.float(hex, `-${fight.result.toDefender}`, '#ff6b5a');
            if (fight.result.toAttacker) this.float(u.hex, `-${fight.result.toAttacker}`, '#ffb060');
          } else if (u.hex === from) this.float(hex, 'NO MOVES', '#b8b2a4');
        } else if (!orderMove(s, u, hex)) this.float(hex, 'NO PATH', '#b8b2a4');
        else this.animateMove(u, from, plan);
      }
    }
    this.afterAction(u);
  }

  // The faction of a unit or planet on the hex that you are not at war with, or null.
  private peacefulOccupant(hex: number): number | null {
    const s = this.s;
    const h = s.hexes[hex];
    if (h.planetId !== undefined) {
      const p = s.planets[h.planetId];
      if (p.owner >= 0 && p.owner !== this.me && !atWar(s, this.me, p.owner)) return p.owner;
    }
    for (const o of s.units) if (o.hex === hex && o.owner !== this.me && this.vis[hex] === 2 && !atWar(s, this.me, o.owner)) return o.owner;
    return null;
  }

  private afterAction(u: Unit) {
    const alive = this.s.units.includes(u);
    this.pathPreview = [];
    if (!alive || u.moves <= 0 || u.order) {
      if (alive && u.order?.kind === 'goto' && u.moves > 0) this.skipped.add(u.id);
      this.selectNext(false);
    }
    this.refresh();
  }

  unitCommand(cmd: string) {
    const s = this.s;
    const u = this.selectedUnit;
    if (!u || u.owner !== this.me) return;
    switch (cmd) {
      case 'colonize':
        colonize(s, u);
        break;
      case 'station':
        buildStation(s, u);
        break;
      case 'fortify':
        u.order = { kind: 'fortify' };
        break;
      case 'sleep':
        u.order = { kind: 'sleep' };
        break;
      case 'wake':
        u.order = undefined;
        this.refresh();
        return;
      case 'skip':
        this.skipped.add(u.id);
        break;
      case 'explore': {
        const from = u.hex;
        u.order = { kind: 'explore' };
        if (!autoExplore(s, u)) u.order = undefined;
        this.animateMove(u, from, null, 150);
        break;
      }
      case 'upgrade':
        upgrade(s, u);
        break;
      case 'disband':
        disband(s, u);
        break;
    }
    this.pathPreview = [];
    this.selectNext(false);
    this.refresh();
  }

  canColonize(u: Unit): boolean {
    return canColonizeHere(this.s, u);
  }

  canStation(u: Unit): boolean {
    return canBuildStation(this.s, u);
  }

  // What the player must do before the turn can end.
  blocker(): { label: string; act: () => void } | null {
    const s = this.s;
    const f = this.faction;
    if (this.needsOrders().length) return { label: 'Next unit', act: () => (this.selectNext(), this.refresh()) };
    if (!f.researching && !f.researchQueue.length && this.researchLeft()) return { label: 'Choose research', act: () => this.open('tech') };
    const idle = ownedPlanets(s, this.me).find((p) => !p.queue.length);
    if (idle) return { label: 'Choose production', act: () => this.openPlanet(idle, 'production') };
    return null;
  }

  researchLeft(): boolean {
    return researchOptions(this.faction).length > 0;
  }

  endTurn(force = false) {
    const s = this.s;
    if (s.winner || !this.faction.alive) return;
    const b = this.blocker();
    if (b && !force) {
      b.act();
      return;
    }
    this.planetId = null;
    this.mode = 'normal';
    this.fadeToasts();
    this.skipped.clear();
    const before = this.vis;
    this.events.length = 0;
    coreEndTurn(s);
    saveGame(AUTOSAVE, s);
    this.showChanges(before);
    this.selected = null;
    this.selectNext();
    this.refresh();
  }

  // Replays the events of the turn change in order, as the player could see them: each visible move and each hit
  // gets its own moment, so a coordinated attack reads as a sequence. "before" is the visibility at the end of the
  // player turn. The replay is compressed when it would take more than a few seconds.
  private showChanges(before: Uint8Array) {
    const s = this.s;
    const vis = computeVisible(s, this.me);
    const now = performance.now();
    const color = this.faction.color;
    const STEP = 240; // one hex of a move
    const HIT = 420; // one hit or capture
    const LIMIT = 7000;
    const seen = (hex: number) => before[hex] === 2 || vis[hex] === 2;
    const planetHex = (id: number) => s.planets[id].hex;
    let t = 0;
    const anims = new Map<number, UnitAnim>();
    const floats: { hex: number; text: string; color: string; at: number }[] = [];
    for (const e of this.events) {
      if (e.kind === 'unitMoved') {
        const mine = e.owner === this.me;
        if (!mine && !seen(e.from) && !seen(e.to)) continue;
        const anim = anims.get(e.unit);
        if (anim && anim.path[anim.path.length - 1] === e.from) {
          anim.path.push(e.to);
          anim.times.push(t + STEP);
        } else anims.set(e.unit, { path: [e.from, e.to], times: [t, t + STEP] });
        t += STEP;
      } else if (e.kind === 'unitDamaged') {
        if (e.owner === this.me || seen(e.hex)) {
          floats.push({ hex: e.hex, text: `-${e.amount}`, color: e.owner === this.me ? '#ff6b5a' : '#f0c93a', at: t });
          t += HIT;
        }
      } else if (e.kind === 'unitDestroyed') {
        if (e.owner === this.me || seen(e.hex)) {
          floats.push({ hex: e.hex, text: e.owner === this.me ? 'LOST' : 'DESTROYED', color: e.owner === this.me ? '#ff6b5a' : '#f0c93a', at: t });
          t += HIT;
        }
      } else if (e.kind === 'planetDamaged') {
        if (e.owner === this.me || seen(planetHex(e.planet))) {
          floats.push({ hex: planetHex(e.planet), text: `-${e.amount}`, color: e.owner === this.me ? '#ff6b5a' : '#f0c93a', at: t });
          t += HIT;
        }
      } else if (e.kind === 'planetCaptured') {
        if (e.from === this.me || e.by === this.me || seen(planetHex(e.planet))) {
          floats.push({ hex: planetHex(e.planet), text: 'CAPTURED', color: e.from === this.me ? '#ff6b5a' : '#f0c93a', at: t });
          t += HIT;
        }
      } else if (e.kind === 'planetGrew') {
        if (e.owner === this.me) floats.push({ hex: planetHex(e.planet), text: '+1 POP', color: '#7fc25a', at: 0 });
      } else if (e.kind === 'itemCompleted') {
        if (e.owner === this.me && e.item.kind === 'building') floats.push({ hex: planetHex(e.planet), text: 'BUILT', color: '#f0c93a', at: 0 });
      } else if (e.kind === 'borderGrew') {
        if (e.owner === this.me) this.pulses.push({ hex: e.hex, start: now, color });
      }
    }
    this.events.length = 0;
    const k = t > LIMIT ? LIMIT / t : 1;
    for (const [id, anim] of anims) {
      if (!s.units.some((u) => u.id === id)) continue;
      anim.times = anim.times.map((x) => now + x * k);
      this.anims.set(id, anim);
    }
    for (const f of floats) this.float(f.hex, f.text, f.color, now + f.at * k);
  }

  attackPreview(hex: number) {
    const u = this.selectedUnit;
    if (!u || u.owner !== this.me || !canAttack(this.s, u, hex)) return null;
    return preview(this.s, u, hex);
  }

  // Input

  private bind(canvas: HTMLCanvasElement) {
    canvas.style.touchAction = 'none';
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { id: number; x: number; y: number; cx: number; cy: number; button: number; touch: boolean } | null = null;
    let dragged = false;
    let pinch: { dist: number } | null = null;
    // A touch that starts on the selected unit drags the unit, with the path shown, in place of the map.
    let dragUnit = false;
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        down = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: this.camera.x, cy: this.camera.y, button: e.button, touch: e.pointerType !== 'mouse' };
        dragged = false;
        const u = this.s && !this.screen && !this.planet ? this.selectedUnit : null;
        dragUnit = !!down.touch && !!u && u.owner === this.me && u.moves > 0 && this.renderer.hexAt(e.clientX, e.clientY) === u.hex;
      } else if (pointers.size === 2) {
        dragUnit = false;
        pinch = { dist: distance() };
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.s) return;
      const p = pointers.get(e.pointerId);
      if (p) {
        p.x = e.clientX;
        p.y = e.clientY;
      }
      // Two fingers: the zoom steps when the distance between them grows or shrinks by a quarter.
      if (pinch && pointers.size === 2) {
        const d = distance();
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (d > pinch.dist * 1.25) {
          this.renderer.zoom(1, mid.x, mid.y);
          pinch.dist = d;
        } else if (d < pinch.dist * 0.8) {
          this.renderer.zoom(-1, mid.x, mid.y);
          pinch.dist = d;
        }
        return;
      }
      if (down && e.pointerId === down.id && (down.touch || down.button === 0 || down.button === 1)) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (dragged || Math.hypot(dx, dy) > 8) {
          dragged = true;
          if (dragUnit) {
            const hex = this.renderer.hexAt(e.clientX, e.clientY);
            if (hex !== this.hover) {
              this.hover = hex;
              this.updatePathPreview();
              renderHud(this, true);
              this.renderer.request();
            }
            return;
          }
          this.camera.x = down.cx - dx;
          this.camera.y = down.cy - dy;
          this.renderer.clamp();
          this.renderer.request();
          return;
        }
      }
      if (e.pointerType !== 'mouse') return;
      const hex = this.renderer.hexAt(e.clientX, e.clientY);
      const edge = hex < 0;
      if (hex !== this.hover || edge !== this.edgeHover) {
        this.hover = hex;
        this.edgeHover = edge;
        this.updatePathPreview();
        renderHud(this, true);
        this.renderer.request();
      }
    });
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) {
          pinch = null;
          down = null;
        }
        return;
      }
      if (!down || e.pointerId !== down.id) return;
      const wasDrag = dragged;
      const wasUnit = dragUnit;
      const { button, touch } = down;
      down = null;
      dragged = false;
      dragUnit = false;
      if (!this.s) return;
      if (wasDrag && wasUnit) {
        this.dropUnit(e.type === 'pointercancel' ? -1 : this.renderer.hexAt(e.clientX, e.clientY));
        return;
      }
      if (wasDrag) renderHud(this);
      if (wasDrag || e.type === 'pointercancel' || this.screen) return;
      const hex = this.renderer.hexAt(e.clientX, e.clientY);
      if (touch) this.tapHex(hex);
      else if (button === 0) this.clickHex(hex);
      else if (button === 2) this.commandHex(hex);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('mousemove', (e) => {
      // The pointer left the map for a panel: the hex information goes back to the help text.
      if (!this.s || e.target === canvas || down) return;
      if (this.hover !== -1 || this.edgeHover) {
        if (this.mobile) return;
        this.hover = -1;
        this.edgeHover = false;
        renderHud(this, true);
        this.renderer.request();
      }
    });
    // No click after a tap: the panel that the tap opened would get the click.
    canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.s) this.renderer.zoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => this.key(e));
  }

  private updatePathPreview() {
    const u = this.selectedUnit;
    this.pathPreview = [];
    if (!u || u.owner !== this.me || this.hover < 0 || this.planet || this.hover === u.hex) return;
    if (!this.faction.explored[this.hover]) return;
    if (this.targets.includes(this.hover)) return;
    this.pathPreview = findPath(this.s, u, this.hover) ?? [];
    this.pathTurns = pathTurns(this.s, u, this.pathPreview);
  }

  private key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (this.screen && e.key === 'Tab') {
      e.preventDefault();
      cycleFocus(this.overlay, e.shiftKey);
      return;
    }
    // A text field, a number field and a list take the keys themselves. Esc leaves the field.
    const boxes = ['checkbox', 'radio', 'button'];
    if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && !boxes.includes((el as HTMLInputElement).type))) {
      if (e.key === 'Escape') el!.blur();
      return;
    }
    if (e.key === 'Escape') {
      if (this.screen && this.screen !== 'menu') this.close();
      else if (this.screen === 'menu' && this.hasGame) this.close();
      else if (this.planet) this.closePlanet();
      else if (this.selected !== null) (this.select(null), this.refresh());
      else this.open('menu');
      return;
    }
    if (e.key === '?') {
      if (this.screen === 'help') this.close();
      else this.open('help');
      return;
    }
    if (e.key === '/' && this.s && !this.screen) {
      e.preventDefault();
      this.search = '';
      this.searchPick = 0;
      this.refresh();
      return;
    }
    if (this.screen) {
      if (screenKey(this, e)) e.preventDefault();
      return;
    }
    if (!this.s) return;
    if (SCREEN_KEYS[e.key]) {
      this.open(SCREEN_KEYS[e.key]);
      return;
    }
    const pan = this.camera.size * 1.5;
    switch (e.key) {
      case 'Enter':
        this.endTurn(e.shiftKey);
        break;
      case 'ArrowLeft':
      case 'a':
        this.camera.x -= pan;
        break;
      case 'ArrowRight':
      case 'd':
        this.camera.x += pan;
        break;
      case 'ArrowUp':
      case 'w':
        this.camera.y -= pan;
        break;
      case 'ArrowDown':
      case 's':
        this.camera.y += pan;
        break;
      case 'n':
      case 'Tab':
        e.preventDefault();
        this.selectNext();
        this.refresh();
        return;
      case ' ':
        e.preventDefault();
        this.unitCommand('skip');
        return;
      case 'f':
        this.unitCommand('fortify');
        return;
      case 'z':
        this.unitCommand('sleep');
        return;
      case 'x':
        this.unitCommand('explore');
        return;
      case 'b': {
        const u = this.selectedUnit;
        if (u && this.canColonize(u)) this.unitCommand('colonize');
        else if (u && this.canStation(u)) this.unitCommand('station');
        return;
      }
      case 'y':
        this.showYields = !this.showYields;
        break;
      case 'c': {
        const cap = capital(this.s, this.me);
        if (cap) this.renderer.centerOn(cap.hex);
        break;
      }
      case '+':
      case '=':
        this.renderer.zoom(1, window.innerWidth / 2, window.innerHeight / 2);
        return;
      case '-':
        this.renderer.zoom(-1, window.innerWidth / 2, window.innerHeight / 2);
        return;
      default:
        return;
    }
    this.renderer.clamp();
    this.renderer.request();
  }
}

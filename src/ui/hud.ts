import { calendarDate, dateLong } from '../core/calendar';
import { PLANET_TYPES, RESOURCES, TERRAIN, YIELD_KEYS, YIELD_NAMES } from '../core/data/terrain';
import { TECHS } from '../core/data/techs';
import { UNITS } from '../core/data/units';
import { canInvade, defenceStrength, invasionStrength } from '../core/combat';
import { empireIncome, empireRoutes, garrisonStrength, hexYield, planetMaxHp, planetStrength, routeCap } from '../core/economy';
import { hexCenter } from '../core/hex';
import { colonizeBlocker, stationBlocker, stationTurns, upgradeBlocker, upgradeCost, upgradeTarget } from '../core/movement';
import { DRIVE_NAMES, atWar, canColonizeType, colonizeTech, driveLevel, hexFaction, resourceVisible, techCost, unitMove } from '../core/rules';
import type { Unit, Yields } from '../core/types';
import type { App } from './app';
import { iconUrl, stationIconUrl, unitIconUrl } from './art';
import { button, clear, fmt, h, img, signed } from './dom';
import { renderPlanetPanel } from './planetPanel';

export function yieldRow(y: Partial<Yields>, digits = 0): HTMLElement {
  const row = h('span.yields');
  for (const k of YIELD_KEYS) {
    const v = y[k] ?? 0;
    if (Math.abs(v) < 0.05) continue;
    row.appendChild(h('span.yield', { title: YIELD_NAMES[k] }, img(iconUrl(k), 14), fmt(v, digits)));
  }
  return row;
}

let hexInfo: HTMLElement | null = null;

export function renderHud(app: App, hoverOnly = false) {
  const root = app.hud;
  if (!app.hasGame) {
    clear(root);
    return;
  }
  if (hoverOnly && hexInfo) {
    fillHexInfo(app, hexInfo);
    return;
  }
  clear(root);
  root.appendChild(topBar(app));
  hexInfo = h('div.hexinfo.panel');
  fillHexInfo(app, hexInfo);
  const u = app.selectedUnit;
  if (app.mobile) {
    // A phone shows one sheet at the bottom: the tapped hex, or the selected unit.
    const sheet = app.planet ? null : app.peek && app.hover >= 0 ? hexInfo : u ? unitPanel(app, u) : null;
    if (sheet === hexInfo) hexInfo.appendChild(h('span.x', { onclick: () => ((app.hover = -1), (app.peek = false), app.refresh()) }, 'x'));
    root.appendChild(h('div.bottomleft', null, sheet));
  } else root.appendChild(h('div.bottomleft', null, minimap(app), hexInfo, u && !app.planet ? unitPanel(app, u) : null));
  root.appendChild(endTurnBox(app));
  if (!app.planet) root.appendChild(toasts(app));
  if (app.planet) renderPlanetPanel(app, root);
}

function stat(icon: string, value: string, label: string, title: string, onClick?: () => void): HTMLElement {
  return h('div.stat', { title, onclick: onClick, class: onClick ? 'clickable' : '' }, img(iconUrl(icon), 21), h('div', null, h('div.value', null, value), h('div.label', null, label)));
}

function topBar(app: App): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const inc = empireIncome(s, f);
  const research = f.researching ? TECHS[f.researching] : null;
  let researchText = 'No research';
  if (research) {
    const left = techCost(s, f, research.id) - (f.researchProgress[research.id] ?? 0);
    const turns = inc.sci > 0 ? Math.max(1, Math.ceil(left / inc.sci)) : '?';
    researchText = `${research.name} (${turns})`;
  }
  const moraleTitle = inc.morale.parts.map((p) => `${p.label}: ${signed(p.value)}`).join('\n') + `\n\n${moraleText(inc.morale.level)}`;
  const credTitle = `Surplus: ${signed(inc.surplus, 1)}\nTo research: ${fmt(inc.toResearch, 1)}\nTo welfare: ${fmt(inc.toWelfare, 1)}\nTo the treasury: ${signed(inc.cred, 1)}\nBuilding upkeep: ${fmt(inc.buildingUpkeep)}\nUnit upkeep: ${fmt(inc.unitUpkeep, 1)}`;
  const date = calendarDate(s.turn);
  return h(
    'div.topbar.panel',
    null,
    h('div.title', null, 'RUSTBELT GALAXY'),
    h(
      'div.stats',
      null,
    h('div.stat.turn', { title: `${dateLong(s.turn)}. Shift ${s.turn} since the charts were opened again. Ten shifts make a rota. Ten rotas fill a ledger.` }, h('div', null, h('div.value', null, `L${date.ledger} · Rota ${date.rota} · Shift ${date.shift}`), h('div.label', null, f.name))),
    stat('cred', `${fmt(f.credits)} (${signed(inc.cred)})`, f.budget.research || f.budget.welfare ? `Budget ${f.budget.research}% / ${f.budget.welfare}%` : 'Credits', credTitle + '\nClick to open the budget.', () => app.open('budget')),
    stat('sci', `${signed(inc.sci, 1)}`, researchText, 'Science per shift. Click to open the research screen.', () => app.open('tech')),
    stat('inf', `${fmt(f.influence)} (${signed(inc.inf, 1)})`, 'Influence', 'Influence grows borders. You spend it on envoys and in the Forum.'),
    stat('morale', `${signed(inc.morale.total)}`, inc.morale.level, moraleTitle),
    h('div.stat.routes', { title: 'Trade routes in use and the empire limit. You set routes on the planet screen.' }, h('div', null, h('div.value', null, `${empireRoutes(s, f.id)}/${routeCap(f)}`), h('div.label', null, 'Trade routes'))),
    h('div.stat.drive', { title: 'Your FTL drive. Better drives give all ships more movement.' }, h('div', null, h('div.value', null, DRIVE_NAMES[Math.min(3, driveLevel(f))]), h('div.label', null, 'FTL drive'))),
    ),
    h(
      'div.buttons',
      null,
      button('Units', () => app.open('units'), { title: 'Key: U' }),
      button('Planets', () => app.open('planets'), { title: 'Key: P' }),
      button('Research', () => app.open('tech'), { title: 'Key: T' }),
      button('Diplomacy', () => app.open('diplomacy'), { title: 'Key: G' }),
      button('Forum', () => app.open('forum'), { title: 'Key: O' }),
      button('Log', () => app.open('log')),
      button('Encyclopedia', () => app.open('encyclopedia'), { title: 'Key: E' }),
      button('Menu', () => app.open('menu'), { title: 'Key: Esc' }),
      button('\u2261', () => app.open('menu'), { cls: 'menubtn', title: 'Menu' }),
    ),
  );
}

export function moraleText(level: string): string {
  switch (level) {
    case 'Inspired':
      return 'Inspired: +10% growth, production and science.';
    case 'Steady':
      return 'Steady: no effect.';
    case 'Restless':
      return 'Restless: growth is halved.';
    default:
      return 'Unrest: no growth, -25% production and science, -10% unit strength.';
  }
}

function fillHexInfo(app: App, box: HTMLElement) {
  clear(box);
  const s = app.s;
  const hex = app.hover;
  if (hex < 0) {
    if (app.edgeHover) {
      box.appendChild(h('div.head', null, 'The Edge'));
      box.appendChild(h('div', null, 'Here the charts end. Beyond the last stars, space falls away into the Falls.'));
      box.appendChild(h('div.dim', null, 'No ship has returned from beyond the Edge, so no ship goes. The galaxy does not wrap around.'));
    } else box.appendChild(h('div.dim', null, app.mobile ? 'Tap: show a hex, select a unit or open a planet. Drag the selected unit: move or attack. Drag the map: scroll. Pinch: zoom.' : 'Left click: select. Right click: move or attack. Drag: move the map. Wheel: zoom. Y: show yields.'));
    return;
  }
  const f = app.faction;
  if (!f.explored[hex]) {
    box.appendChild(h('div.dim', null, 'Unexplored space'));
    return;
  }
  const hx = s.hexes[hex];
  const def = TERRAIN[hx.terrain];
  const owner = hexFaction(s, hex);
  if (hx.planetId !== undefined) {
    const p = s.planets[hx.planetId];
    box.appendChild(h('div.head', null, p.name));
    box.appendChild(h('div', null, `${PLANET_TYPES[p.type].name} planet`, p.owner >= 0 ? `, population ${p.pop}` : ', not colonized'));
    if (p.owner >= 0) {
      box.appendChild(h('div', { style: { color: s.factions[p.owner].color } }, s.factions[p.owner].name));
      if (app.vis[hex]) {
        box.appendChild(h('div', null, `Defence ${fmt(p.hp)}/${planetMaxHp(s, p)}, strength ${fmt(planetStrength(s, p))}`));
        box.appendChild(h('div', null, `Garrison ${fmt(garrisonStrength(s, p))} at ${fmt(p.garrisonHp)}%`));
      }
    } else {
      box.appendChild(yieldRow(PLANET_TYPES[p.type].yields));
      const tech = colonizeTech(p.type);
      if (!canColonizeType(f, p.type)) box.appendChild(h('div.bad', null, `Colonies need ${tech?.name ?? '?'}`));
      else box.appendChild(h('div.good', null, 'You can colonize this planet'));
    }
  } else {
    box.appendChild(h('div.head', null, def.name));
    if (def.workable) box.appendChild(yieldRow(hexYield(s, f, hex)));
    if (def.moveCost > 1) box.appendChild(h('div.dim', null, `Movement cost ${def.moveCost}`));
    if (def.moveCost === 0) box.appendChild(h('div.dim', null, 'Ships cannot enter'));
    if (def.defence) box.appendChild(h('div.dim', null, `Defender +${Math.round(def.defence * 100)}% strength`));
    if (hx.terrain === 'rift') box.appendChild(h('div.dim', null, 'Needs a Hyperdrive'));
    if (owner >= 0) box.appendChild(h('div', { style: { color: s.factions[owner].color } }, s.factions[owner].name));
  }
  if (hx.resource && resourceVisible(f, hx.resource)) {
    const r = RESOURCES[hx.resource];
    box.appendChild(h('div', null, img(iconUrl(r.id), 14), ` ${r.name} (${r.kind})`));
  }
  if (hx.station) box.appendChild(h('div', null, img(stationIconUrl(hx.terrain), 28), ` ${def.stationName}`));
  if (hx.anomaly) box.appendChild(h('div', null, img(iconUrl('anomaly'), 14), ' Anomaly: send a ship to examine it'));
  if (hx.den && app.vis[hex]) box.appendChild(h('div.bad', null, img(iconUrl('den'), 14), ' Pirate den'));
  if (app.vis[hex] === 1) box.appendChild(h('div.dim', null, 'The nebula hides ships from a distance'));
  for (const u of s.units) {
    if (u.hex !== hex || (u.owner !== app.me && app.vis[hex] !== 2)) continue;
    const ud = UNITS[u.type];
    const uf = s.factions[u.owner];
    const war = u.owner !== app.me && atWar(s, app.me, u.owner);
    box.appendChild(
      h('div.unitline', null, h('span', { style: { color: uf.color } }, uf.isPirate ? '' : `${uf.name} `), `${ud.name} `, h('span.dim', null, `HP ${fmt(u.hp)} STR ${fmt(defenceStrength(s, u))}`), war ? h('span.bad', null, ' enemy') : null),
    );
  }
  const pv = app.attackPreview(hex);
  if (pv) {
    box.appendChild(
      h('div.preview', null, h('div.head', null, pv.ranged ? 'Ranged attack' : 'Attack'), h('div', null, `Strength ${fmt(pv.attack)} against ${fmt(pv.defence)}`), h('div', null, `Expected damage: you deal ${pv.toDefender}, you take ${pv.toAttacker}`), app.mobile ? h('div.row', null, button('Attack', () => app.commandHex(hex), { cls: 'big danger' }), h('span.dim', null, 'Or drag the unit here.')) : null),
    );
  }
  const sel = app.selectedUnit;
  if (sel && canInvade(s, sel, hex) && hx.planetId !== undefined) {
    const p = s.planets[hx.planetId];
    box.appendChild(h('div.preview', null, h('div.head', null, 'Invasion'), h('div', null, `Troops ${fmt(invasionStrength(s, sel, p))} against garrison ${fmt(garrisonStrength(s, p))} at ${fmt(p.garrisonHp)}%`), p.hp > 0 ? h('div.dim', null, 'The defences are up. The troops infiltrate at reduced strength.') : null, app.mobile ? h('div.row', null, button('Invade', () => app.commandHex(hex), { cls: 'big danger' }), h('span.dim', null, 'Or drag the unit here.')) : null));
  }
}

function unitPanel(app: App, u: Unit): HTMLElement {
  const s = app.s;
  const def = UNITS[u.type];
  const f = s.factions[u.owner];
  const mine = u.owner === app.me;
  const stats: string[] = [`HP ${fmt(u.hp)}/100`, `Moves ${fmt(u.moves, u.moves % 1 ? 1 : 0)}/${unitMove(f, def)}`];
  if (def.strength) stats.push(`Strength ${def.strength}`);
  if (def.ranged) stats.push(`Ranged ${def.ranged}, range ${def.range}`);
  if (def.ground) stats.push(`Ground ${def.ground}`);
  const orderText: Record<string, string> = { goto: 'Moves to a target', build: 'Builds a station', sleep: 'Sleeps', fortify: 'Fortified (+25% defence)', explore: 'Explores' };
  const buttons: HTMLElement[] = [];
  if (mine) {
    const active = u.moves > 0;
    if (def.canColonize) {
      const why = colonizeBlocker(s, u);
      buttons.push(button('Colonize', () => app.unitCommand('colonize'), { disabled: !active || !!why, title: why ?? 'Found a colony on this planet. Key: B' }));
      if (why && s.hexes[u.hex].planetId !== undefined) buttons.push(h('span.dim', null, why));
    }
    if (def.canBuild) {
      const why = stationBlocker(s, u);
      buttons.push(button(`Build station (${stationTurns(s, u)})`, () => app.unitCommand('station'), { disabled: !active || !!why, title: why ?? `Build a ${TERRAIN[s.hexes[u.hex].terrain].stationName} here. Key: B` }));
      if (why) buttons.push(h('span.dim', null, why));
    }
    if (def.cls === 'military' && def.strength < 10) buttons.push(button('Explore', () => app.unitCommand('explore'), { disabled: !active, title: 'The unit explores without more orders. Key: X' }));
    if (def.cls === 'military') buttons.push(button('Fortify', () => app.unitCommand('fortify'), { title: '+25% strength when it defends. The unit repairs while it does not move. Key: F' }));
    buttons.push(button('Sleep', () => app.unitCommand('sleep'), { title: 'The unit waits until you wake it. Key: Z' }));
    if (u.order) buttons.push(button('Cancel order', () => app.unitCommand('wake')));
    buttons.push(button('Skip', () => app.unitCommand('skip'), { title: 'No orders this shift. Key: Space' }));
    const to = upgradeTarget(s, u);
    if (to) {
      const cost = upgradeCost(s, u);
      const why = upgradeBlocker(s, u);
      buttons.push(button(`Upgrade to ${to.name} (${cost})`, () => app.unitCommand('upgrade'), { disabled: !!why, title: why ?? 'The unit gets the new type and loses its moves for this shift.' }));
    }
    buttons.push(
      button(
        'Disband',
        () => {
          if (confirm(`Disband this ${def.name}?`)) app.unitCommand('disband');
        },
        { cls: 'danger' },
      ),
    );
  }
  return h(
    'div.unitpanel.panel',
    null,
    app.mobile ? h('span.x', { onclick: () => (app.select(null), app.refresh()) }, 'x') : null,
    img(unitIconUrl(u.type, f.color), app.mobile ? 48 : 72, 'portrait'),
    h(
      'div.info',
      null,
      h('div.head', null, def.name, h('span.dim', null, ` ${f.name}`)),
      h('div', null, stats.join('  ')),
      u.order ? h('div.dim', null, orderText[u.order.kind] + (u.order.kind === 'build' ? `, ${u.order.turnsLeft} shifts left` : '')) : null,
      h('div.text', null, def.text),
      h('div.buttons', null, buttons),
    ),
  );
}

function endTurnBox(app: App): HTMLElement {
  const s = app.s;
  if (s.winner || !app.faction.alive) {
    return h('div.endturn', null, button('Game over', () => app.open('end'), { cls: 'big' }));
  }
  const b = app.blocker();
  return h(
    'div.endturn',
    null,
    b ? button('End shift now', () => app.endTurn(true), { cls: 'small', title: 'Ends the shift with no more checks. Key: the Shift key and Enter' }) : null,
    button(b ? b.label : 'End shift', () => app.endTurn(), { cls: b ? 'big attention' : 'big', title: 'Key: Enter' }),
  );
}

function toasts(app: App): HTMLElement {
  const box = h('div.toasts');
  for (const t of app.toasts.slice(app.mobile ? -3 : -8)) {
    box.appendChild(
      h(
        `div.toast.${t.tone ?? 'info'}`,
        {
          class: t.hex !== undefined ? 'clickable' : '',
          onclick: () => {
            if (t.hex !== undefined) {
              app.showOnMap(t.hex);
            }
          },
        },
        t.hex !== undefined ? h('span.jump', { title: 'Click to show the place on the map' }, '\u25B8 ') : null,
        t.text,
        h(
          'span.x',
          {
            onclick: (e: Event) => {
              e.stopPropagation();
              app.toasts = app.toasts.filter((x) => x !== t);
              app.refresh();
            },
          },
          'x',
        ),
      ),
    );
  }
  return box;
}

const MINI_COLORS: Record<string, string> = {
  space: '#141823',
  asteroids: '#5a5148',
  nebula: '#6a3f7a',
  ice: '#9fc4d6',
  debris: '#4f565d',
  moon: '#77736d',
  star: '#ffd75e',
  rift: '#2a1238',
  planet: '#d8d2c4',
};

function minimap(app: App): HTMLElement {
  const s = app.s;
  const k = s.width > 50 ? 3 : 4;
  const c = document.createElement('canvas');
  c.width = s.width * k + k;
  c.height = s.height * k;
  c.className = 'minimap panel';
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, c.width, c.height);
  const f = app.faction;
  for (let i = 0; i < s.hexes.length; i++) {
    if (!f.explored[i]) continue;
    const col = i % s.width;
    const row = Math.floor(i / s.width);
    const x = col * k + (row & 1 ? k / 2 : 0);
    const owner = hexFaction(s, i);
    const t = s.hexes[i].terrain;
    ctx.fillStyle = owner >= 0 && t !== 'planet' && t !== 'star' ? s.factions[owner].color : MINI_COLORS[t];
    ctx.globalAlpha = owner >= 0 && t !== 'planet' ? 0.55 : 1;
    ctx.fillRect(x, row * k, k, k);
    ctx.globalAlpha = 1;
  }
  for (const u of s.units) {
    if (u.owner !== app.me && app.vis[u.hex] !== 2) continue;
    const col = u.hex % s.width;
    const row = Math.floor(u.hex / s.width);
    ctx.fillStyle = u.owner === app.me ? '#ffffff' : s.factions[u.owner].isPirate ? '#ff4030' : s.factions[u.owner].color;
    ctx.fillRect(col * k + (row & 1 ? k / 2 : 0) + 1, row * k + 1, k - 2, k - 2);
  }
  // Viewport
  const R = app.camera.size;
  const sx = k / (Math.sqrt(3) * R);
  const sy = k / (R * 1.5);
  ctx.strokeStyle = '#f0e6c8';
  ctx.lineWidth = 1;
  ctx.strokeRect(app.camera.x * sx + 0.5, app.camera.y * sy + 0.5, window.innerWidth * sx, window.innerHeight * sy);
  c.addEventListener('mousedown', (e) => {
    const rect = c.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / k);
    const row = Math.floor((e.clientY - rect.top) / k);
    const hex = Math.max(0, Math.min(s.hexes.length - 1, row * s.width + Math.min(s.width - 1, col)));
    const p = hexCenter(s, hex, R);
    app.camera.x = p.x - window.innerWidth / 2;
    app.camera.y = p.y - window.innerHeight / 2;
    app.renderer.clamp();
    app.refresh();
  });
  return c;
}

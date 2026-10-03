import { dateShort } from '../core/calendar';
import { PLANET_TYPES } from '../core/data/terrain';
import { UNITS } from '../core/data/units';
import { WELFARE_MAX_MORALE, WELFARE_PER_MORALE, empireIncome, setBudget, growthThreshold, planetMaxHp, planetYields, popCap, welfareMorale } from '../core/economy';
import { distance } from '../core/hex';
import { itemCost, itemName, ownedPlanets, unitMove } from '../core/rules';
import type { Unit } from '../core/types';
import type { App } from './app';
import { planetIconUrl, unitIconUrl } from './art';
import { button, fmt, h, img, signed } from './dom';
import { yieldRow } from './hud';
import { frame } from './screens';

const ORDER_TEXT: Record<string, string> = { goto: 'Moving', build: 'Building', sleep: 'Asleep', fortify: 'Fortified', explore: 'Exploring' };

function place(app: App, hex: number): string {
  const s = app.s;
  const h = s.hexes[hex];
  if (h.planetId !== undefined) return s.planets[h.planetId].name;
  const near = [...s.planets].filter((p) => p.owner >= 0).sort((a, b) => distance(s, a.hex, hex) - distance(s, b.hex, hex))[0];
  if (!near) return `hex ${hex % s.width},${Math.floor(hex / s.width)}`;
  const d = distance(s, near.hex, hex);
  const owner = s.factions[near.owner];
  return `${d} from ${near.name}${near.owner === app.me ? '' : ` (${owner.name})`}`;
}

export function renderUnits(app: App): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const mine = s.units.filter((u) => u.owner === app.me);
  const groups: [string, (u: Unit) => boolean][] = [
    ['Warships', (u) => UNITS[u.type].cls === 'military' && UNITS[u.type].strength >= 10],
    ['Scouts', (u) => UNITS[u.type].cls === 'military' && UNITS[u.type].strength < 10],
    ['Civilian ships', (u) => UNITS[u.type].cls === 'civilian'],
  ];
  const row = (u: Unit) => {
    const def = UNITS[u.type];
    const idle = u.moves > 0 && !u.order && !app.skipped.has(u.id);
    return h(
      'tr',
      { class: u.id === app.selected ? 'selected' : '' },
      h('td', null, img(unitIconUrl(u.type, f.color), 32)),
      h('td', null, def.name),
      h('td', null, `${fmt(u.hp)}/100`),
      h('td', null, `${fmt(u.moves, u.moves % 1 ? 1 : 0)}/${unitMove(f, def)}`),
      h('td', null, place(app, u.hex)),
      h('td', null, u.order ? ORDER_TEXT[u.order.kind] + (u.order.kind === 'build' ? ` (${u.order.turnsLeft})` : '') : idle ? h('span.good', null, 'Needs orders') : h('span.dim', null, 'Done')),
      h(
        'td',
        null,
        button('Go to', () => {
          app.select(u, true);
          app.close();
        }, { cls: 'small' }),
      ),
    );
  };
  const body: HTMLElement[] = [];
  for (const [title, pred] of groups) {
    const list = mine.filter(pred).sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
    if (!list.length) continue;
    body.push(h('div.section', null, `${title} (${list.length})`));
    body.push(h('table.scores', null, h('tr', null, h('th'), h('th', null, 'Unit'), h('th', null, 'HP'), h('th', null, 'Moves'), h('th', null, 'Position'), h('th', null, 'Status'), h('th')), list.map(row)));
  }
  if (!mine.length) body.push(h('div.dim', null, 'You have no units.'));
  const lost = s.log.filter((l) => l.faction === app.me && /^Your .* was (destroyed|scrapped)/.test(l.text)).slice(-6).reverse();
  if (lost.length) {
    body.push(h('div.section', null, 'Recent losses'));
    body.push(h('div.list', null, lost.map((l) => h('div.entry.bad', { class: l.hex !== undefined ? 'clickable' : '', onclick: l.hex !== undefined && (() => (app.close(), app.showOnMap(l.hex!))) }, h('span.dim', null, `${dateShort(l.turn)} `), l.text))));
  }
  return frame(app, `Units (${mine.length})`, h('div.keepscroll', { 'data-id': 'units' }, body), { wide: true });
}

export function renderPlanets(app: App): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const mine = ownedPlanets(s, app.me).sort((a, b) => a.founded - b.founded || a.id - b.id);
  const rows = mine.map((p) => {
    const info = planetYields(s, p);
    const cap = popCap(s, p);
    const need = growthThreshold(p.pop);
    const growth = p.pop >= cap ? 'at limit' : info.foodSurplus > 0 ? `${Math.max(1, Math.ceil((need - p.food) / info.foodSurplus))} shifts` : info.foodSurplus < 0 ? h('span.bad', null, 'starving') : 'no growth';
    const item = p.queue[0];
    let turns = '';
    if (item) {
      const prod = info.yields.prod;
      turns = prod > 0 ? ` (${Math.max(1, Math.ceil((itemCost(s, f, item) - p.prodStore) / prod))})` : '';
    }
    const max = planetMaxHp(s, p);
    return h(
      'tr',
      { class: 'clickable', onclick: () => app.openPlanet(p) },
      h('td', null, img(planetIconUrl(p.type, p.id), 32)),
      h('td', null, h('b', null, p.name), h('div.dim', null, PLANET_TYPES[p.type].name)),
      h('td', null, `${p.pop}/${cap}`, h('div.dim', null, growth)),
      h('td', null, yieldRow(info.yields, 0)),
      h('td', null, item ? `${itemName(item)}${turns}` : h('span.bad', null, 'Empty queue')),
      h('td', null, `${p.buildings.length}`),
      h('td', null, `${p.routes.length}`),
      h('td', null, p.hp < max ? h('span.bad', null, `${fmt(p.hp)}/${max}`) : `${max}`),
    );
  });
  return frame(
    app,
    `Planets (${mine.length})`,
    h(
      'div.keepscroll',
      { 'data-id': 'planets' },
      h('table.scores', null, h('tr', null, h('th'), h('th', null, 'Planet'), h('th', null, 'Population'), h('th', null, 'Output'), h('th', null, 'Production'), h('th', null, 'Buildings'), h('th', null, 'Routes'), h('th', null, 'Defence')), rows),
      h('div.dim', null, 'Click a planet to open it.'),
      h('div.dim', null, `Morale: ${signed(empireIncome(s, f).morale.total)} (${empireIncome(s, f).morale.level}).`),
    ),
    { wide: true },
  );
}

export function renderBudget(app: App): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const inc = empireIncome(s, f);
  const steps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const pick = (label: string, key: 'research' | 'welfare', hint: string) => {
    const el = h('select', null, steps.map((v) => h('option', { value: String(v), selected: v === f.budget[key] }, `${v}%`))) as HTMLSelectElement;
    el.addEventListener('change', () => {
      setBudget(f, key, Number(el.value));
      app.refresh();
    });
    return h('div.row', null, h('label.field', null, h('span', null, label), el), h('span.dim', null, hint));
  };
  return frame(app, 'Budget', [
    h('div', null, `Credit surplus before the budget: ${signed(inc.surplus, 1)} per shift. Treasury: ${fmt(f.credits)} credits.`),
    h('div.dim', null, 'The budget takes shares of a positive surplus. A negative surplus is paid from the treasury.'),
    pick('Research', 'research', `1 credit gives 1 science. Now ${signed(inc.toResearch, 1)} science per shift.`),
    pick('Welfare', 'welfare', `${WELFARE_PER_MORALE} credits per shift give 1 morale, at most +${WELFARE_MAX_MORALE}. Now ${signed(welfareMorale(s, f))} morale.`),
    h('div', null, `Treasury: ${signed(inc.cred, 1)} credits per shift.`),
    h('div.section', null, 'Other uses of credits'),
    h('ul', null, [
      'Buy an item in the production queue of a planet. The price is 4 credits per missing point of production.',
      'Buy a hex on the planet screen.',
      'Upgrade a unit inside your borders. Select the unit and press Upgrade.',
      'Gift credits to a faction on the Diplomacy screen, or trade credits for a technology.',
    ].map((t) => h('li', null, t))),
  ]);
}

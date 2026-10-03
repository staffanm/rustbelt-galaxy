import { FIELDS, productionAdvice } from '../core/advisor';
import { BUILDINGS, PROJECTS } from '../core/data/buildings';
import { PLANET_TYPES } from '../core/data/terrain';
import { UNITS } from '../core/data/units';
import {
  MORALE_TEXT,
  addRoute,
  blockaded,
  empireIncome,
  empireRoutes,
  garrisonStrength,
  growthThreshold,
  planetMaxHp,
  planetModSum,
  planetStrength,
  planetYields,
  popCap,
  removeRoute,
  routeCap,
  routeValid,
  routeYield,
  tradeSlots,
} from '../core/economy';
import { borderCost, buildOptions, cancelQueued, claimOptions, enqueue, hexBuyCost, itemProduction, moveQueued, purchase, type BuildOption } from '../core/planet';
import { itemCost, itemName, ownedPlanets, purchaseCost } from '../core/rules';
import type { BuildItem, Faction, Planet } from '../core/types';
import type { App } from './app';
import { buildingSprite, iconUrl, planetIconUrl, projectSprite, spriteUrl, unitIconUrl } from './art';
import { openLightbox } from './lightbox';
import { planetScene, planetSceneLarge } from './scene';
import { button, fmt, h, img, signed } from './dom';
import { yieldRow } from './hud';
import { closeButton, removeButton } from './widgets';

function turnsFor(app: App, p: Planet, item: BuildItem, stored: number): string {
  const f = app.faction;
  const prod = itemProduction(app.s, p, item, planetYields(app.s, p).yields.prod, empireIncome(app.s, f).sci);
  const left = itemCost(app.s, f, item) - stored;
  if (left <= 0) return '1';
  return prod > 0 ? String(Math.ceil(left / prod)) : '?';
}

function itemText(item: BuildItem): string {
  if (item.kind === 'unit') return UNITS[item.id].text;
  if (item.kind === 'building') return BUILDINGS[item.id].text;
  return PROJECTS[item.id].text;
}

function itemIcon(app: App, item: BuildItem): HTMLElement {
  if (item.kind === 'unit') return img(unitIconUrl(item.id, app.faction.color), 28);
  if (item.kind === 'building') return img(spriteUrl(buildingSprite(item.id, BUILDINGS[item.id].category)), 28);
  return img(spriteUrl(projectSprite(item.id)), 28);
}

export function renderPlanetPanel(app: App, root: HTMLElement) {
  const s = app.s;
  const p = app.planet!;
  const f = app.faction;
  const mine = ownedPlanets(s, app.me);
  const info = planetYields(s, p);
  const inc = empireIncome(s, f);
  const cap = popCap(s, p);
  const need = growthThreshold(p.pop);
  const growth =
    p.pop >= cap
      ? 'Population limit reached'
      : info.foodSurplus > 0
        ? `Grows in ${Math.max(1, Math.ceil((need - p.food) / info.foodSurplus))} shifts`
        : info.foodSurplus < 0
          ? 'The planet loses food'
          : 'No growth';
  const at = mine.findIndex((x) => x.id === p.id);
  const go = (d: number) => app.openPlanet(mine[(at + d + mine.length) % mine.length]);

  const left = h(
    'div.planetleft.panel',
    null,
    h('div.row.planethead', null, button('<', () => go(-1), { cls: 'small' }), h('div.head.grow', null, p.name), button('>', () => go(1), { cls: 'small' }), closeButton(() => app.closePlanet(), 'Close (Esc)')),
    h('div.scene', { title: 'The colony. Every building stands within sight of the hall. Click to enlarge.', onclick: () => showScene(p, f) }, planetScene(p, f)),
    h('div.row', null, img(planetIconUrl(p.type, p.id), 40), h('div', null, h('div', null, `${PLANET_TYPES[p.type].name} planet`), h('div', null, `Population ${p.pop} of ${cap}`), h('div.dim', null, growth), h('div.dim', null, `Food ${fmt(p.food)}/${need} (${signed(info.foodSurplus, 1)})`))),
    h('div.section', null, 'Output per shift'),
    yieldRow(info.yields, 1),
    inc.morale.level === 'Unrest' || inc.morale.level === 'Restless'
      ? h('div.bad', { title: 'Open the budget to spend on welfare, or build morale buildings.' }, `${inc.morale.level} (${inc.morale.total}): ${MORALE_TEXT[inc.morale.level]}`)
      : null,
    h('div.dim', null, `Building upkeep ${info.upkeep} credits`),
    h('div.section', null, 'Defence'),
    h('div', null, `Hit points ${fmt(p.hp)}/${planetMaxHp(s, p)}, strength ${fmt(planetStrength(s, p))}`),
    h('div', null, `Garrison ${fmt(garrisonStrength(s, p))} at ${fmt(p.garrisonHp)}%`),
    blockaded(s, p) ? h('div.bad', null, 'Enemy ships blockade the planet. Its trade routes yield nothing.') : null,
    h('div.section', null, 'Borders'),
    h('div', null, `Next hex at ${fmt(p.borderProgress)}/${borderCost(s, p)} influence`),
    h(
      'div.row',
      null,
      button(app.mode === 'buyHex' ? 'Cancel' : `Buy a hex (${hexBuyCost(s, p)} credits)`, () => {
        app.mode = app.mode === 'buyHex' ? 'normal' : 'buyHex';
        if (app.mobile && app.mode === 'buyHex') app.planetTab = 'map';
        app.refresh();
      }, { disabled: app.mode !== 'buyHex' && (f.credits < hexBuyCost(s, p) || !claimOptions(s, p).length) }),
    ),
    h('div.dim', null, app.mode === 'buyHex' ? 'Click a yellow hex on the map.' : app.mobile ? 'Open the Map tab and tap a hex inside the borders to fix or release a worker.' : 'Click a hex inside the borders to fix or release a worker.'),
    h('div.section', null, `Buildings (${p.buildings.length})`),
    h(
      'div.list',
      null,
      p.buildings.map((id) => h('div.entry.clickable', { title: BUILDINGS[id].text, onclick: () => app.open('encyclopedia', `building:${id}`) }, img(spriteUrl(buildingSprite(id, BUILDINGS[id].category)), 24), BUILDINGS[id].name)),
      p.buildings.length ? null : h('div.dim', null, 'None'),
    ),
    routes(app, p),
  );

  const options = buildOptions(s, p);
  const group = (kind: BuildItem['kind'], title: string) => {
    const list = options.filter((o) => o.item.kind === kind);
    if (!list.length) return null;
    return [h('div.section', null, title), list.map((o) => option(app, p, o))];
  };
  const right = h(
    'div.planetright.panel',
    null,
    h('div.head', null, 'Production'),
    h('div.dim', null, `${fmt(info.yields.prod, 1)} production per shift, ${fmt(p.prodStore)} stored`),
    h(
      'div.queue',
      null,
      p.queue.map((item, i) =>
        h(
          'div.entry.queued',
          { title: itemText(item) },
          itemIcon(app, item),
          h('span.grow', null, `${i + 1}. ${itemName(item)}`),
          h('span.dim', null, i === 0 ? `${turnsFor(app, p, item, p.prodStore)} shifts` : ''),
          i > 0
            ? button('Up', () => {
                moveQueued(p, i, i - 1);
                app.refresh();
              }, { cls: 'small' })
            : null,
          removeButton(() => {
            cancelQueued(p, i);
            app.refresh();
          }, 'Remove from the queue'),
        ),
      ),
      p.queue.length ? null : h('div.bad', null, 'The queue is empty. Production becomes credits at half value.'),
    ),
    advisors(app, p),
    h('div.scroll', null, group('unit', 'Units'), group('building', 'Buildings'), group('project', 'Projects')),
  );
  if (app.mobile) {
    mobilePlanet(app, p, go, left, right, root);
    return;
  }
  root.appendChild(left);
  root.appendChild(right);
}

// A phone shows one tab of the planet at a time: the name and Close above the tabs. The map tab keeps the planet
// open and shows only this header, for the hexes of the planet.
function mobilePlanet(app: App, p: Planet, go: (d: number) => void, left: HTMLElement, right: HTMLElement, root: HTMLElement) {
  const tab = (id: App['planetTab'], label: string) =>
    button(label, () => {
      app.planetTab = id;
      if (id !== 'map') app.mode = 'normal';
      app.refresh();
    }, { cls: app.planetTab === id ? 'small selected' : 'small' });
  const head = h('div.row.planethead', null, button('<', () => go(-1), { cls: 'small' }), h('div.head.grow', null, p.name), button('>', () => go(1), { cls: 'small' }), closeButton(() => app.closePlanet()));
  const tabs = h('div.planettabs', null, tab('planet', 'Planet'), tab('production', 'Production'), tab('map', 'Map'));
  if (app.planetTab === 'map') {
    const text = app.mode === 'buyHex' ? 'Tap a yellow hex to buy it.' : 'Tap a hex inside the borders to fix or release a worker. Tap the planet to open it again.';
    root.appendChild(h('div.planetsheet.panel.mapbar', null, head, tabs, h('div.dim', null, text)));
    return;
  }
  root.appendChild(h('div.planetsheet.panel', null, head, tabs, h('div.sheetbody', null, app.planetTab === 'planet' ? left : right)));
}

// One suggestion from each advisor. A click adds the item to the queue.
function advisors(app: App, p: Planet): HTMLElement | null {
  const advice = productionAdvice(app.s, p);
  if (!advice.length) return null;
  return h(
    'div.advisors',
    null,
    h('div.section', null, 'Advisors'),
    advice.map((a) =>
      h(
        'div.entry.clickable.advice',
        {
          title: `${a.reason}\nClick to add it to the queue.`,
          onclick: () => {
            if (enqueue(app.s, p, a.item)) app.refresh();
          },
        },
        h('span.field', null, FIELDS.find((x) => x.id === a.field)!.name),
        itemIcon(app, a.item),
        h('span.grow', null, h('div', null, a.name, h('span.dim', null, ` ${turnsFor(app, p, a.item, 0)} shifts`)), h('div.dim.why', null, a.reason)),
      ),
    ),
  );
}

function option(app: App, p: Planet, o: BuildOption): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const buy = o.item.kind === 'project' ? 0 : purchaseCost(s, f, p, o.item);
  return h(
    'div.entry.option',
    { class: o.ok ? '' : 'off', title: itemText(o.item) + (o.reason ? `\n${o.reason}` : '') },
    itemIcon(app, o.item),
    h(
      'span.grow.clickable',
      {
        onclick: () => {
          if (o.ok && enqueue(s, p, o.item)) app.refresh();
        },
      },
      o.name,
      o.reason ? h('span.bad', null, ` ${o.reason}`) : null,
    ),
    h('span.dim', null, `${o.cost} / ${turnsFor(app, p, o.item, 0)}t`),
    buy
      ? button(`${buy}`, () => {
          if (purchase(s, p, o.item)) app.refresh();
        }, { cls: 'small buy', disabled: !o.ok || f.credits < buy, title: `Buy now for ${buy} credits` })
      : null,
    button('?', () => app.open('encyclopedia', `${o.item.kind}:${o.item.id}`), { cls: 'small' }),
  );
}

function routes(app: App, p: Planet): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const slots = tradeSlots(s, p);
  const local = planetModSum(p, 'tradeSlots');
  const box = h('div', null, h('div.section', null, `Trade routes (empire ${empireRoutes(s, f.id)}/${routeCap(f)})`));
  if (!local) {
    box.appendChild(h('div.dim', null, 'The planet needs a Trade Hub to start a route.'));
    return box;
  }
  for (const r of p.routes) {
    const to = s.planets[r];
    const y = routeYield(s, p, to);
    box.appendChild(
      h(
        'div.entry',
        null,
        h('span.grow', { style: { color: s.factions[to.owner]?.color } }, to.name),
        y.cred > 0 ? yieldRow({ cred: y.cred, inf: y.inf }, 1) : h('span.bad', { title: 'An enemy warship or a pirate is next to one of the two planets.' }, 'Blockaded'),
        removeButton(() => {
          removeRoute(p, r);
          app.refresh();
        }, 'End the route'),
      ),
    );
  }
  if (p.routes.length < slots) {
    const targets = s.planets
      .filter((to) => !p.routes.includes(to.id) && routeValid(s, p, to))
      .map((to) => ({ to, y: routeYield(s, p, to) }))
      .sort((a, b) => b.y.cred - a.y.cred);
    if (!targets.length) box.appendChild(h('div.dim', null, 'No other planet is in range.'));
    else {
      const select = h('select', null, h('option', { value: '' }, 'Start a route to...'), targets.map((t) => h('option', { value: String(t.to.id) }, `${t.to.name} (${s.factions[t.to.owner].name}): ${fmt(t.y.cred, 1)} credits, ${fmt(t.y.inf, 1)} influence`))) as HTMLSelectElement;
      select.addEventListener('change', () => {
        if (select.value) {
          addRoute(s, p, Number(select.value));
          app.refresh();
        }
      });
      box.appendChild(select);
    }
  } else if (p.routes.length >= local) box.appendChild(h('div.dim', null, 'All route slots of the planet are in use.'));
  else box.appendChild(h('div.dim', null, 'The empire limit is reached. Technologies raise the limit.'));
  return box;
}

export { iconUrl };

// Opens the colony scene in a lightbox: the small scene at once, the version from the full size originals when it has loaded.
function showScene(p: Planet, f: Faction) {
  const big = openLightbox(planetScene(p, f).toDataURL());
  void planetSceneLarge(p, f).then((c) => {
    if (big.isConnected) big.src = c.toDataURL();
  });
}

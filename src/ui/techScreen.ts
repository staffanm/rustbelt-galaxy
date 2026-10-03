import { FIELDS, researchAdvice } from '../core/advisor';
import { BUILDING_LIST, PROJECTS } from '../core/data/buildings';
import { SPECIES } from '../core/data/species';
import type { TechDef } from '../core/data/techs';
import { UNIT_LIST } from '../core/data/units';
import { empireIncome } from '../core/economy';
import { researchPath, setResearch } from '../core/research';
import { buildingAllowed, canResearch, factionTechs, techAvailable, techCost, techPrereqs, unitAllowed } from '../core/rules';
import { TECHS } from '../core/data/techs';
import type { Faction, TechCategory } from '../core/types';
import type { App } from './app';
import { button, h, img } from './dom';
import { spriteUrl, techSprite } from './art';
import { TECH_LORE } from '../core/data/techLore';
import { frame } from './screens';

const CATEGORY_ORDER: TechCategory[] = ['propulsion', 'science', 'colonization', 'economy', 'society', 'military'];
const CATEGORY_COLOR: Record<TechCategory, string> = {
  propulsion: '#6fd0f0',
  science: '#5fb0f0',
  colonization: '#7fc25a',
  economy: '#f0c93a',
  society: '#b88af0',
  military: '#d1495b',
};
export const ERA_NAMES = ['', 'Era 1: First Steps', 'Era 2: Expansion', 'Era 3: Empire', 'Era 4: Ascendancy'];

const CARD_W = 236;
const CARD_H = 92;
const GAP_X = 48;
const GAP_Y = 12;
const TOP = 34;

// What a technology unlocks for this faction. The check ignores the technology requirement itself.
export function unlocks(f: Faction, tech: string): string[] {
  const out: string[] = [];
  const known = { ...f, techs: [...f.techs, tech] } as Faction;
  for (const u of UNIT_LIST) if (u.tech === tech && unitAllowed(known, u)) out.push(u.name);
  for (const b of BUILDING_LIST) if (b.tech === tech && buildingAllowed(known, b)) out.push(b.name);
  for (const p of Object.values(PROJECTS)) if (p.tech === tech) out.push(p.name);
  return out;
}

export function renderTech(app: App): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const techs = factionTechs(f);
  const sci = empireIncome(s, f).sci;
  const pos = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  for (let era = 1; era <= 4; era++) {
    const list = techs
      .filter((t) => t.era === era)
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || (a.species ? 1 : 0) - (b.species ? 1 : 0));
    list.forEach((t, row) => pos.set(t.id, { x: (era - 1) * (CARD_W + GAP_X), y: TOP + row * (CARD_H + GAP_Y) }));
    maxRows = Math.max(maxRows, list.length);
  }
  const width = 4 * (CARD_W + GAP_X) - GAP_X;
  const height = TOP + maxRows * (CARD_H + GAP_Y);
  const queue = [f.researching, ...f.researchQueue].filter(Boolean) as string[];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.classList.add('techlines');
  for (const t of techs) {
    const to = pos.get(t.id)!;
    for (const p of techPrereqs(f, t.id)) {
      const from = pos.get(p);
      if (!from) continue;
      const x1 = from.x + CARD_W;
      const y1 = from.y + CARD_H / 2;
      const x2 = to.x;
      const y2 = to.y + CARD_H / 2;
      const mid = x1 + (x2 - x1) / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2},${y2}`);
      const done = f.techs.includes(p) && f.techs.includes(t.id);
      const active = queue.includes(t.id) && (queue.includes(p) || f.techs.includes(p));
      line.setAttribute('class', done ? 'done' : active ? 'active' : '');
      svg.appendChild(line);
    }
  }

  const card = (t: TechDef): HTMLElement => {
    const p = pos.get(t.id)!;
    const known = f.techs.includes(t.id);
    const cost = techCost(s, f, t.id);
    const progress = f.researchProgress[t.id] ?? 0;
    const at = queue.indexOf(t.id);
    const state = known ? 'known' : at === 0 ? 'current' : at > 0 ? 'queued' : canResearch(f, t.id) ? 'open' : 'locked';
    const turns = sci > 0 ? Math.max(1, Math.ceil((cost - progress) / sci)) : '?';
    const list = unlocks(f, t.id);
    return h(
      `div.tech.${state}`,
      {
        style: { left: `${p.x}px`, top: `${p.y}px`, width: `${CARD_W}px`, height: `${CARD_H}px`, borderLeftColor: CATEGORY_COLOR[t.category] },
        class: (t.species ? 'own ' : '') + (app.techFocus === t.id ? 'focus' : ''),
        onclick: () => {
          app.techFocus = t.id;
          if (!known) setResearch(s, f, t.id);
          app.refresh();
        },
        onmouseenter: () => {
          if (app.techFocus !== t.id) {
            app.techFocus = t.id;
            const panel = document.querySelector('.techdetail');
            if (panel) panel.replaceWith(detail(app, t.id));
          }
        },
        // The keyboard focus shows the details, as the mouse pointer does.
        onfocus: () => {
          if (app.techFocus !== t.id) {
            app.techFocus = t.id;
            const panel = document.querySelector('.techdetail');
            if (panel) panel.replaceWith(detail(app, t.id));
          }
        },
        oncontextmenu: (e: Event) => {
          e.preventDefault();
          app.open('encyclopedia', `tech:${t.id}`);
        },
      },
      img(spriteUrl(techSprite(t.id, t.category)), 44, 'techart'),
      h(
        'div.grow',
        null,
        h('div.name', null, t.name, t.species ? h('span.tag', { style: { color: SPECIES[t.species].color } }, ` ${SPECIES[t.species].adjective}`) : null),
        h('div.cost', null, known ? 'Known' : `${Math.floor(progress)}/${cost} science, ${turns} shifts`, at >= 0 ? h('span.order', null, ` #${at + 1}`) : null),
        h('div.unlocks', null, list.length ? list.join(', ') : t.text),
      ),
      at === 0 ? h('div.progress', null, h('div', { style: { width: `${Math.min(100, (progress / cost) * 100)}%` } })) : null,
    );
  };

  const eras = [1, 2, 3, 4].map((era) => h('div.era', { style: { left: `${(era - 1) * (CARD_W + GAP_X)}px`, width: `${CARD_W}px` } }, ERA_NAMES[era]));
  const excluded = SPECIES[f.species].excludedTechs.length;
  if (!app.techFocus || !techAvailable(f, app.techFocus)) app.techFocus = f.researching ?? techs[0]?.id;
  // Technologies of other species, taken with their home planets. They are not in the tree.
  const captured = f.techs.filter((id) => !techAvailable(f, id));
  return frame(
    app,
    'Research',
    [
      h('div.dim.intro', null, `Click a technology to research it. The game adds the technologies that it needs first. Your species cannot research ${excluded} of the common technologies.`),
      advisors(app, sci),
      captured.length
        ? h('div', null, 'Captured knowledge: ', captured.map((id, i) => [i ? ', ' : '', h('a.link', { onclick: () => app.open('encyclopedia', `tech:${id}`) }, TECHS[id].name)]), '. You can build the units and buildings of these technologies.')
        : null,
      h('div.techtree.keepscroll', { 'data-id': 'tech' }, h('div.techcanvas', { style: { width: `${width}px`, height: `${height}px` } }, svg, eras, techs.map(card))),
      detail(app, app.techFocus),
    ],
    { wide: true },
  );
}

// One research target from each advisor. A click starts the research of the target and of the technologies before it.
function advisors(app: App, sci: number): HTMLElement | null {
  const s = app.s;
  const f = app.faction;
  const advice = researchAdvice(s, f);
  if (!advice.length) return null;
  return h(
    'div.row.advisors',
    null,
    h('span.dim', null, 'Advisors:'),
    advice.map((a) =>
      h(
        'div.advice.clickable',
        {
          title: `${a.reason}\nClick to research it.`,
          onclick: () => {
            app.techFocus = a.tech;
            setResearch(s, f, a.tech);
            app.refresh();
          },
        },
        h('span.field', null, FIELDS.find((x) => x.id === a.field)!.name),
        h('div', null, TECHS[a.tech].name, h('span.dim', null, sci > 0 ? ` ${Math.max(1, Math.ceil(a.cost / sci))} shifts` : '')),
        h('div.dim.why', null, a.reason),
      ),
    ),
  );
}

// The panel below the tree with the full text of one technology.
function detail(app: App, id: string | undefined): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const t = id ? TECHS[id] : undefined;
  if (!t) return h('div.techdetail');
  const known = f.techs.includes(t.id);
  const list = unlocks(f, t.id);
  const needs = techPrereqs(f, t.id).map((p) => TECHS[p].name);
  return h(
    'div.techdetail',
    null,
    img(spriteUrl(techSprite(t.id, t.category)), 96, 'portrait'),
    h(
      'div.grow',
      null,
      h('div.head', null, t.name, h('span.dim', null, ` ${ERA_NAMES[t.era]}, ${t.category}, ${techCost(s, f, t.id)} science`), t.species ? h('span.tag', { style: { color: SPECIES[t.species].color } }, ` ${SPECIES[t.species].name}`) : null),
      h('div', null, t.text),
      h('div.text', null, TECH_LORE[t.id] ?? ''),
      h('div.dim', null, list.length ? `Unlocks: ${list.join(', ')}. ` : '', needs.length ? `Needs: ${needs.join(', ')}.` : 'Needs nothing.'),
      h(
        'div.row',
        null,
        known ? h('span.good', null, 'Known') : button(queueLabel(app, t.id), () => (setResearch(s, f, t.id), app.refresh()), { cls: 'small' }),
        button('Encyclopedia', () => app.open('encyclopedia', `tech:${t.id}`), { cls: 'small' }),
      ),
    ),
  );
}

function queueLabel(app: App, id: string): string {
  const f = app.faction;
  if (f.researching === id) return 'Researching now';
  const n = researchPath(f, id).length;
  return n > 1 ? `Research (${n} technologies)` : 'Research';
}

import { DIFFICULTIES, GALAXY_SIZES, PLAYABLE, SPECIES } from '../core/data/species';
import { newGame } from '../core/game';
import { dateLong, dateShort } from '../core/calendar';
import { ownedPlanets, realFactions } from '../core/rules';
import type { GameSettings, SpeciesId } from '../core/types';
import { score } from '../core/victory';
import type { App } from './app';
import { artUrl, leaderPortrait } from './art';
import { renderDiplomacy, renderForum } from './diplomacyScreen';
import { button, clear, h, img, keyHint, type Child } from './dom';
import { HELP, focusIndex, makeFocusable, restoreFocus } from './keys';
import { renderEncyclopedia } from './encyclopedia';
import { AUTOSAVE, SLOTS, deleteSave, exportGame, importGame, loadGame, saveGame, saveInfo } from './save';
import { renderTech } from './techScreen';
import { renderBudget, renderPlanets, renderUnits } from './listsScreen';

export function frame(app: App, title: string, body: Child, opts: { wide?: boolean; noClose?: boolean } = {}): HTMLElement {
  return h(
    'div.screen',
    { class: opts.wide ? 'wide' : '' },
    h('div.screenhead', null, h('div.head', null, title), opts.noClose ? null : button('Close', () => app.close(), { key: 'Esc' })),
    h('div.screenbody', null, body),
  );
}

export function renderScreen(app: App) {
  const root = app.overlay;
  // A screen that is drawn again keeps its scroll position: a marked list, or else the body of the screen.
  const scroll = (root.querySelector('.keepscroll') ?? root.querySelector('.screenbody')) as HTMLElement | null;
  const pos = scroll ? { id: scroll.dataset.id ?? `screen:${app.screen}`, top: scroll.scrollTop, left: scroll.scrollLeft } : null;
  // The same screen drawn again keeps the keyboard focus at the same item.
  const focused = root.dataset.screen === String(app.screen) ? focusIndex(root) : -1;
  root.dataset.screen = String(app.screen);
  clear(root);
  root.className = app.screen ? 'overlay open' : 'overlay';
  switch (app.screen) {
    case 'menu':
      root.appendChild(menu(app));
      break;
    case 'newgame':
      root.appendChild(newGameScreen(app));
      break;
    case 'saves':
      root.appendChild(saves(app));
      break;
    case 'tech':
      root.appendChild(renderTech(app));
      break;
    case 'diplomacy':
      root.appendChild(renderDiplomacy(app));
      break;
    case 'forum':
      root.appendChild(renderForum(app));
      break;
    case 'encyclopedia':
      root.appendChild(renderEncyclopedia(app));
      break;
    case 'log':
      root.appendChild(logScreen(app));
      break;
    case 'units':
      root.appendChild(renderUnits(app));
      break;
    case 'planets':
      root.appendChild(renderPlanets(app));
      break;
    case 'budget':
      root.appendChild(renderBudget(app));
      break;
    case 'end':
      root.appendChild(endScreen(app));
      break;
    case 'help':
      root.appendChild(helpScreen(app));
      break;
    case 'about':
      root.appendChild(aboutScreen(app));
      break;
    default:
      break;
  }
  makeFocusable(root);
  restoreFocus(root, focused);
  if (pos) {
    const again = (root.querySelector('.keepscroll') ?? root.querySelector('.screenbody')) as HTMLElement | null;
    if (again && (again.dataset.id ?? `screen:${app.screen}`) === pos.id) {
      again.scrollTop = pos.top;
      again.scrollLeft = pos.left;
    }
  }
}

function menu(app: App): HTMLElement {
  const auto = saveInfo(AUTOSAVE);
  const title = artUrl('ui/title');
  return h(
    'div.screen.menu',
    null,
    title ? h('img.titleart', { src: title }) : null,
    h('div.logo', null, 'RUSTBELT GALAXY'),
    h('div.tagline', null, 'A turn-based game of planets, rust, and poor decisions at faster-than-light speed.'),
    h(
      'div.menubuttons',
      null,
      app.hasGame ? button('Return to the game', () => app.close(), { cls: 'big', key: 'r' }) : null,
      !app.hasGame && auto
        ? button(`Continue (${dateShort(auto.turn)}, ${auto.faction})`, () => {
            const s = loadGame(AUTOSAVE);
            if (s) app.start(s);
          }, { cls: 'big', key: 'c' })
        : null,
      app.hasGame && app.mobile
        ? h(
            'div.menugrid',
            null,
            button('Units', () => app.open('units')),
            button('Planets', () => app.open('planets')),
            button('Research', () => app.open('tech')),
            button('Diplomacy', () => app.open('diplomacy')),
            button('Forum', () => app.open('forum')),
            button('Budget', () => app.open('budget')),
            button('Log', () => app.open('log')),
          )
        : null,
      button('New game', () => app.open('newgame'), { cls: 'big', key: 'n' }),
      button('Save and load', () => app.open('saves'), { cls: 'big', key: 's' }),
      button('Encyclopedia', () => app.open('encyclopedia'), { cls: 'big', key: 'e' }),
      app.mobile ? null : button('Keyboard shortcuts', () => app.open('help'), { cls: 'big', key: '?' }),
      app.mobile && !app.hasGame && /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches
        ? h('div.dim', null, 'For a full screen on iPhone: share, then Add to Home Screen, and open the game from there.')
        : null,
    ),
    h('div.dim', null, 'Your game is saved in this browser at the end of each shift.'),
    h('a.link.about', { onclick: () => app.open('about') }, 'About: how this game was made'),
  );
}

// How the game was made. Key: none. The menu has the link.
function aboutScreen(app: App): HTMLElement {
  const p = (...parts: Child[]) => h('p', null, ...parts);
  return frame(app, 'About', [
    h('div.about', null,
      p('Rustbelt Galaxy is a turn-based strategy game of planets, rust, and poor decisions at faster-than-light speed. It was made with AI tools, directed by a human.'),
      h('div.section', null, 'Design'),
      p('Staffan Malmgren set the direction: the subject, the tone, the species, the victory conditions, and each decision about rules and balance. The AI proposed options, and the designer chose.'),
      h('div.section', null, 'Code'),
      p('The rules, the AI opponents, the interface and the tests were written by Claude, the AI model of Anthropic, through Claude Code. The game is TypeScript with a 2D canvas for the map and HTML for the panels, with no game framework.'),
      p('The game balance was tuned with the AI playing against itself: hundreds of simulated games measured which species won, and in which way, after each change to the rules.'),
      h('div.section', null, 'Art'),
      p('The images were generated by Codex, the AI tool of OpenAI, from written prompts. Three early images set the style, and every later prompt showed them as the reference: thick ink outlines, chunky shapes, rust and grime.'),
      h('div.section', null, 'Writing'),
      p('The texts of the encyclopedia, the species lore and the dry remarks in the log were written by Claude, from the premise of a galaxy that works like an old industrial town.'),
      h('div.section', null, 'Fonts'),
      p('Zilla Slab by Typotheque, and Big Shoulders by Patric King, both under the SIL Open Font License.'),
    ),
  ]);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function isPenalty(trait: string): boolean {
  return /^-/.test(trait) || /cost \d+% more/.test(trait) || /yield \d+% less/.test(trait) || /like the .* less/.test(trait);
}

const setup: GameSettings = { galaxy: 'medium', opponents: GALAXY_SIZES.medium.opponents, difficulty: 2, playerSpecies: 'terran', seed: Math.floor(Math.random() * 1e9) };
// Species cards that the player opened to read the traits.
const expanded = new Set<SpeciesId>();
// After a choice of species the screen scrolls to the settings.
let scrollToSettings = false;

function newGameScreen(app: App): HTMLElement {
  const size = GALAXY_SIZES[setup.galaxy];
  setup.opponents = Math.min(setup.opponents, size.maxOpponents);
  const cards = PLAYABLE.map((id) => {
    const sp = SPECIES[id];
    const open = expanded.has(id);
    return h(
      'div.species',
      {
        class: (setup.playerSpecies === id ? 'selected' : '') + (open ? ' open' : ''),
        style: { borderColor: sp.color },
        onclick: () => {
          setup.playerSpecies = id as SpeciesId;
          scrollToSettings = true;
          app.refresh();
        },
      },
      h(
        'div.row',
        null,
        img(leaderPortrait(id), 48, 'portrait'),
        h('div.grow', null, h('div.head', { style: { color: sp.color } }, sp.name), h('div', null, sp.archetype, h('span.dim', null, ` · ${sp.leader}`))),
        button(open ? 'Less' : 'More', () => (open ? expanded.delete(id) : expanded.add(id), app.refresh()), { cls: 'small', title: 'The traits of the species' }),
      ),
      open
        ? [
            h('div.text', null, sp.text),
            h('ul', null, sp.traitText.map((t) => h('li', { class: isPenalty(t) ? 'bad' : '' }, t))),
            h('a.link', { onclick: () => app.open('encyclopedia', `species:${id}`) }, 'Lore, units and technologies'),
          ]
        : null,
    );
  });
  // A click on the More button or the link must not choose the species.
  for (const c of cards) for (const el of c.querySelectorAll('button, a.link')) el.addEventListener('click', (e) => e.stopPropagation());
  const select = (label: string, value: string, options: [string, string][], set: (v: string) => void) => {
    const el = h('select', null, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))) as HTMLSelectElement;
    el.addEventListener('change', () => {
      set(el.value);
      app.refresh();
    });
    return h('label.field', null, h('span', null, label), el);
  };
  const seed = h('input', { type: 'number', value: String(setup.seed) }) as HTMLInputElement;
  seed.addEventListener('change', () => (setup.seed = Number(seed.value) || 1));
  const opponents: [string, string][] = [];
  for (let n = 1; n <= size.maxOpponents; n++) opponents.push([String(n), String(n)]);
  const chosen = SPECIES[setup.playerSpecies];
  const settings = h(
    'div.settings',
    null,
    h('div.section', null, 'Galaxy'),
    h(
      'div.row.fields',
      null,
      h('label.field', null, h('span', null, 'Your species'), h('div.chosen', { style: { color: chosen.color } }, chosen.name)),
      select('Size', setup.galaxy, [['small', 'Small (28 x 32)'], ['medium', 'Medium (34 x 39)'], ['large', 'Large (40 x 46)']], (v) => {
        setup.galaxy = v as GameSettings['galaxy'];
        setup.opponents = GALAXY_SIZES[setup.galaxy].opponents;
      }),
      select('Opponents', String(setup.opponents), opponents, (v) => (setup.opponents = Number(v))),
      select('Difficulty', String(setup.difficulty), DIFFICULTIES.map((d, i) => [String(i), d.name] as [string, string]), (v) => (setup.difficulty = Number(v))),
      h('label.field', null, h('span', null, 'Map seed'), seed),
    ),
    h('div.dim', null, DIFFICULTIES[setup.difficulty].text),
    h(
      'div.row',
      null,
      button('Start', () => {
        setup.seed = Number(seed.value) || 1;
        app.start(newGame({ ...setup }));
        setup.seed = Math.floor(Math.random() * 1e9);
      }, { cls: 'big', key: 's' }),
    ),
  );
  if (scrollToSettings) {
    scrollToSettings = false;
    requestAnimationFrame(() => settings.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
  return frame(app, 'New game', [h('div.section', null, 'Your species'), h('div.speciesgrid', null, cards), settings], { wide: true });
}

function saves(app: App): HTMLElement {
  const rows = [AUTOSAVE, ...SLOTS].map((slot, i) => {
    const info = saveInfo(slot);
    const name = slot === AUTOSAVE ? 'Autosave' : `Slot ${i}`;
    return h(
      'div.entry',
      null,
      h('span.grow', null, h('b', null, name), ' ', info ? `${dateShort(info.turn)}, ${info.faction}, ${new Date(info.date).toLocaleString()}` : h('span.dim', null, 'Empty')),
      slot !== AUTOSAVE && app.hasGame
        ? button('Save', () => {
            if (!saveGame(slot, app.s)) alert('The browser refused the save. Its storage is full or blocked.');
            app.refresh();
          }, { cls: 'small' })
        : null,
      info
        ? button('Load', () => {
            const s = loadGame(slot);
            if (s) app.start(s);
          }, { cls: 'small' })
        : null,
      info && slot !== AUTOSAVE
        ? button('Delete', () => {
            if (confirm(`Delete the save in ${name}?`)) {
              deleteSave(slot);
              app.refresh();
            }
          }, { cls: 'small danger' })
        : null,
    );
  });
  const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }) as HTMLInputElement;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    const s = await importGame(f);
    if (s) app.start(s);
    else alert('The file is not a save file of this game version.');
  });
  return frame(app, 'Save and load', [
    h('div.list', null, rows),
    h('div.section', null, 'Save files'),
    h('div.row', null, app.hasGame ? button('Export the game to a file', () => exportGame(app.s), { key: 'x' }) : null, button('Import a game from a file', () => file.click(), { key: 'i' }), file),
    h('div.row', null, button('Back to the menu', () => app.open('menu'), { key: 'b' })),
  ]);
}

function logScreen(app: App): HTMLElement {
  const entries = app.s.log.filter((l) => l.faction === app.me || l.faction === -1).slice(-150).reverse();
  return frame(app, 'Event log', [
    h(
      'div.list.keepscroll',
      { 'data-id': 'log' },
      entries.map((l) =>
        h(
          `div.entry.${l.tone ?? 'info'}`,
          {
            class: l.hex !== undefined ? 'clickable' : '',
            onclick: l.hex !== undefined && (() => (app.close(), app.showOnMap(l.hex!))),
          },
          h('span.dim', null, `${dateShort(l.turn)} `),
          l.hex !== undefined ? h('span.jump', null, '\u25B8 ') : null,
          l.text,
        ),
      ),
      entries.length ? null : h('div.dim', null, 'Nothing has happened yet.'),
    ),
  ]);
}

// The cheat sheet of all keys. Key: ?
function helpScreen(app: App): HTMLElement {
  return frame(
    app,
    'Keyboard shortcuts',
    h(
      'div.help.keepscroll',
      { 'data-id': 'help' },
      HELP.map((group) =>
        h('div.helpgroup', null, h('div.section', null, group.title), h('table.keys', null, group.keys.map(([key, text]) => h('tr', null, h('td', null, key.split(/( or |, | \+ | and | to )/).map((part, i) => (i % 2 ? part : keyHint(part, false)))), h('td', null, text))))),
      ),
    ),
    { wide: true },
  );
}

const END_TEXT = {
  conquest: {
    win: 'You hold most of the home planets in the galaxy. The rest are quiet now. You can hear the rust.',
    lose: 'holds most of the home planets in the galaxy. Yours may be on the list.',
  },
  science: {
    win: 'The Exodus Gate is open. Your people walk through to a galaxy with better neighbours and a clean start.',
    lose: 'opened the Exodus Gate and left. They did not leave a forwarding address.',
  },
  forum: {
    win: 'The Interstellar Forum elected you as its leader. The galaxy now argues under your chairmanship.',
    lose: 'leads the Interstellar Forum. Your objection is noted in the minutes.',
  },
};

function endScreen(app: App): HTMLElement {
  const s = app.s;
  const w = s.winner;
  const won = w?.faction === app.me;
  let head = 'Defeat';
  let text = 'Your last planet fell. The history of your people continues as a footnote.';
  if (w) {
    const f = s.factions[w.faction];
    head = won ? 'Victory' : 'Defeat';
    text = won ? END_TEXT[w.kind].win : `The ${f.name} ${END_TEXT[w.kind].lose}`;
  }
  const rows = realFactions(s)
    .map((f) => ({ f, score: score(s, f.id) }))
    .sort((a, b) => b.score - a.score)
    .map(({ f, score: sc }) =>
      h('tr', null, h('td', null, img(leaderPortrait(f.species), 32, 'portrait')), h('td', { style: { color: f.color } }, f.name, f.id === app.me ? ' (you)' : ''), h('td', null, f.alive ? plural(ownedPlanets(s, f.id).length, 'planet') : 'Eliminated'), h('td', null, plural(f.techs.length, 'technology', 'technologies')), h('td', null, `${sc} points`)),
    );
  return frame(
    app,
    `${head} in ${dateLong(w?.turn ?? s.turn)}`,
    [
      h(`div.endtext.${won ? 'good' : 'bad'}`, null, w ? `${{ conquest: 'Conquest', science: 'Science', forum: 'Forum' }[w.kind]} victory. ` : '', text),
      h('table.scores', null, rows),
      h('div.row', null, button('Look at the map', () => app.close(), { key: 'l' }), button('New game', () => app.open('newgame'), { cls: 'big', key: 'n' }), button('Menu', () => app.open('menu'), { key: 'm' })),
    ],
    { noClose: true },
  );
}

import { BUILDING_LIST, PROJECTS } from '../core/data/buildings';
import { DIFFICULTIES, PLAYABLE, SPECIES } from '../core/data/species';
import { TECH_LIST } from '../core/data/techs';
import { LUXURY_MORALE, PLANET_TYPES, RESOURCES, TERRAIN } from '../core/data/terrain';
import { UNIT_LIST } from '../core/data/units';
import type { App } from './app';
import type { SpeciesId } from '../core/types';
import { revealTech, techAvailable } from '../core/rules';
import { buildingSprite, iconUrl, leaderPortrait, planetIconUrl, projectSprite, spriteUrl, stationIconUrl, techSprite, terrainSprite, unitIconUrl } from './art';
import { TECH_LORE } from '../core/data/techLore';
import { BUILDING_LORE, PLANET_LORE, PROJECT_LORE, RESOURCE_LORE, TERRAIN_LORE, UNIT_LORE } from '../core/data/lore';
import { button, h, img, keyHint, type Child } from './dom';
import { yieldRow } from './hud';
import { openLightbox, originalUrl } from './lightbox';
import { frame, isPenalty } from './screens';
import { ERA_NAMES } from './techScreen';

interface Entry {
  key: string; // "category:id"
  name: string;
  category: string;
  search: string;
  status?: 'own' | 'unavailable' | 'replaced'; // for the species of the player: exclusive to it, not available to it, or replaced by its own version
  replacedBy?: string;
  render: (link: (key: string, label?: string) => HTMLElement) => Child;
}

type Owned = { species?: SpeciesId; replaces?: string };

// Is the unit or building exclusive to the player, replaced for the player, or for another species?
function ownership(app: App, def: Owned & { id: string }, list: (Owned & { name: string })[]): Pick<Entry, 'status' | 'replacedBy'> {
  if (!app.hasGame) return {};
  const mine = app.faction.species;
  if (def.species === mine) return { status: 'own' };
  if (def.species) return { status: 'unavailable' };
  const repl = list.find((o) => o.species === mine && o.replaces === def.id);
  if (repl) return { status: 'replaced', replacedBy: repl.name };
  return {};
}

function statusText(e: Entry): string {
  if (e.status === 'own') return 'exclusive to your species';
  if (e.status === 'replaced') return `your species has the ${e.replacedBy} instead`;
  if (e.status === 'unavailable') return 'not available to your species';
  return '';
}

function techStatus(app: App, t: { id: string; species?: SpeciesId }): Entry['status'] {
  if (!app.hasGame) return undefined;
  if (t.species === app.faction.species) return 'own';
  if (!techAvailable(app.faction, t.id) && !app.faction.techs.includes(t.id)) return 'unavailable';
  return undefined;
}

const CONCEPTS: { id: string; name: string; text: string[] }[] = [
  {
    id: 'turns',
    name: 'The shift and the calendar',
    text: [
      'No two planets agree on the length of a day, and no two species agree on what a year is. The one thing that every dock in the galaxy has is the work shift. So the galaxy counts shifts.',
      'One shift is one turn of the game. Ten shifts make a rota, the time after which a crew is rotated out. Ten rotas fill a ledger. Then the accounts department closes the ledger and opens the next one. The count started when the old charts were opened again.',
      'A date is written as ledger, rota and shift: L1·R4·S6 is Shift 6 of Rota 4 in Ledger 1.',
      'You give orders to your units and planets. Then you end the shift. The other factions and the pirates then take their shifts.',
      'At the start of your shift the game adds your income, grows your planets, continues production and research, and repairs units.',
      'The End shift button shows what needs your attention: a unit without orders, no research, or a planet with an empty queue.',
    ],
  },
  {
    id: 'controls',
    name: 'Controls',
    text: [
      'Left click selects a unit or opens your planet. Click again on the same hex to select the next unit there.',
      'Right click moves the selected unit, or attacks an enemy in range, or invades a planet.',
      'Drag the map with the left mouse button. The wheel changes the zoom. W, A, S, D and the arrow keys move the map.',
      'Keys: Enter ends the shift. Space skips the unit. N selects the next unit. F fortifies. Z sleeps. X explores. B colonizes or builds a station. Y shows yields. C goes to your capital. U and P open the unit list and the planet list. K opens the budget. T, G, O and E open Research, Diplomacy, Forum and Encyclopedia.',
    ],
  },
  {
    id: 'planets',
    name: 'Planets and population',
    text: [
      'A planet is your city. It owns the hexes round it. Each unit of population works one owned hex and collects its yields.',
      'The planet itself always gives the yields of its planet type. Each unit of population also gives 0.5 science. Population without a hex gives 1 credit.',
      'Each unit of population eats 1 food. Extra food fills the growth store. A full store adds 1 population.',
      'Each planet type has a population limit. Habitat Domes and Orbital Rings raise the limit. A home planet has +2.',
      'On the planet screen, click an owned hex to fix a worker there. Click again to release it.',
    ],
  },
  {
    id: 'production',
    name: 'Production and purchase',
    text: [
      'A planet puts its production into the first item of its queue. Extra production goes to the next item.',
      'You can buy a unit or a building with credits. The price is 4 credits for each point of production that is missing.',
      'A planet with an empty queue changes its production to credits at half value.',
      'The Budget screen (key K) turns a share of your credit surplus into science (1 credit = 1 science) or into morale (3 credits per shift = 1 morale, at most +8).',
      'A Colony Ship takes 1 population from the planet that builds it.',
    ],
  },
  {
    id: 'stations',
    name: 'Stations and resources',
    text: [
      'A Constructor builds a station on a hex inside your borders. The station adds yields that depend on the terrain. Technologies permit stations on more terrains.',
      'A resource gives its bonus and its effect only when a station is on the hex and the hex is inside your borders.',
      `Each different luxury resource gives +${LUXURY_MORALE} morale. Strategic resources permit advanced units and buildings. One source is enough for any number of units.`,
      'Technologies show the strategic resources on the map: Helium Refining, Heavy Armour and Quantum Physics.',
    ],
  },
  {
    id: 'morale',
    name: 'Morale',
    text: [
      'Morale is one value for your empire. Each planet costs 3 morale. Each 2 population cost 1 morale. Each war costs 1 morale.',
      'Buildings, luxury resources, species traits and some technologies give morale. The buildings of one planet cannot give more morale than the planet has population.',
      'Inspired (8 or more): +10% growth, production and science. Steady (0 to 7): no effect. Restless (-1 to -5): growth is halved. Unrest (-6 or less): no growth, -25% production and science, -10% unit strength.',
      'Morale is the limit on fast expansion. Build Cantinas and connect luxury resources before you found many colonies.',
    ],
  },
  {
    id: 'influence',
    name: 'Influence and borders',
    text: [
      'Each planet produces influence. The influence of a planet grows its borders, one hex at a time, to a distance of 3 hexes.',
      'The same influence also goes to your empire store. You spend the store on envoys, Forum invitations and Forum lobby actions.',
      'Trade routes give influence. Routes to foreign planets give 3 times the influence of routes inside your empire.',
      'You can also buy a hex with credits on the planet screen.',
    ],
  },
  {
    id: 'trade',
    name: 'Trade routes',
    text: [
      'A trade route connects one of your planets with another planet. It gives credits and influence each shift. You set routes on the planet screen.',
      'A planet needs a Trade Hub to start a route. Your empire also has a limit on the total number of routes. Technologies raise the limit: Trade Protocols, Interstellar Banking and Megacorporations.',
      'The yield grows with the population of the two planets and with the distance. A route to a foreign planet gives 50% more credits. The other faction gets 1 credit per shift.',
      'Each route with a foreign faction improves its attitude to you. War ends the routes between two factions. An enemy warship next to either planet blockades the route.',
      'The range of a route is 10 hexes, +4 for each FTL drive generation.',
    ],
  },
  {
    id: 'research',
    name: 'Research',
    text: [
      'Your planets produce science. Science goes to the technology that you research. Extra science goes to the next technology.',
      'Each species has 3 own technologies and cannot research 2 of the common technologies. Each species also pays less or more for some technology categories.',
      'You can trade technologies with other factions on the Diplomacy screen. Species technologies cannot be traded.',
    ],
  },
  {
    id: 'ftl',
    name: 'FTL drives',
    text: [
      'All ships travel faster than light. The drive generation of your empire sets how fast.',
      'Jump Drive is the first generation. Warp Drive, Hyperdrive and Fold Drive each give all your ships +1 movement.',
      'Only ships with a Hyperdrive or a Fold Drive can cross Void Rifts.',
      'Asteroid fields and nebulae cost 2 movement. A ship with any movement left can always enter a hex.',
    ],
  },
  {
    id: 'combat',
    name: 'Combat',
    text: [
      'One warship and one civilian unit can be in a hex. To attack, select a warship and right click an enemy in range. You must be at war with the owner.',
      'The damage depends on the difference between the two strengths. Equal strengths give about 30 damage to each side. A difference of 17 doubles the damage of the stronger side.',
      'In a melee attack both units take damage. A ranged attack gives no damage to the attacker. A unit attacks one time per shift.',
      'A damaged unit is weaker: at 1 hit point it has half its strength. Asteroid fields and nebulae give the defender +25%. Fortify gives +25%.',
      'A unit that did not move or attack repairs 10 hit points per shift, or 20 inside its own borders.',
      'A warship that attacks a civilian unit in melee destroys it.',
    ],
  },
  {
    id: 'invasion',
    name: 'Planet attack and ground invasion',
    text: [
      'A planet has hit points and a strength. Warships attack the planet to bring its hit points to zero. The planet repairs 6% per shift.',
      'Warships cannot capture a planet. At zero hit points, move a Troop Transport next to the planet and right click the planet to invade.',
      'Vessani troops are infiltrators. They invade a planet while its defences are up, at 50% of their strength.',
      'The ground troops fight the garrison until one side is destroyed. The garrison strength depends on population, buildings and technologies.',
      'If the invasion fails, the garrison keeps its damage and repairs 10% per shift. A second invasion can then succeed.',
      'A captured planet loses 15% of its population and its military buildings. The captor takes credits: 30 plus 10 per population. A faction without planets is eliminated.',
      'The knowledge of a planet goes with it. The captor learns 1 technology of the old owner. A home planet also gives 1 species technology of the old owner, and the captor can then build its units and buildings. The old owner loses 1 technology and must research it again.',
    ],
  },
  {
    id: 'diplomacy',
    name: 'Diplomacy',
    text: [
      'You meet a faction when you see its units or its borders. Each faction has an attitude to you from -100 to +100.',
      'The attitude moves 1 point per shift to a target. The target depends on border friction, trade routes, warships inside their borders, open borders, wars, shared enemies and the Forum.',
      'Each species weighs the reasons by its temperament. A warrior species minds border friction and warships in its space more, and despises a weak fleet. A trading species minds trade routes more and dislikes wars against its trade partners. A diplomatic species minds wars against its friends more. Point at an attitude on the Diplomacy screen to see the reasons.',
      'Envoys cost influence and raise the attitude at once. Gifts of credits do the same. These gains decay to the target over time.',
      'Without open borders, units cannot enter the borders of another faction in peace. A declaration of war makes other factions like you less.',
      'After peace, the two factions cannot declare war on each other for 10 shifts.',
    ],
  },
  {
    id: 'forum',
    name: 'The Interstellar Forum',
    text: [
      'The Forum Station project founds the Forum. Only one Forum can exist. The founder invites the other factions with influence.',
      'The members elect a leader each 10 shifts. A faction votes for the member that it supports most: attitude plus lobby points. Each faction also supports itself, by an amount that depends on its species.',
      'A faction wins a Forum victory when it gets more than half of the votes of all factions. A faction outside the Forum has no vote, so it counts against the winner.',
      'You can also join a Forum that another faction founded, and win the election there.',
    ],
  },
  {
    id: 'victory',
    name: 'Victory',
    text: [
      'Conquest: you hold half of all home planets in the galaxy, your own included, and 3 or more. With 6 factions that is 3 home planets.',
      'Science: research Gate Theory and complete the Exodus Gate project. The project needs Antimatter. Each shift it gets the production of its planet and half of the science of your empire.',
      'Forum: you win the election of the Interstellar Forum with more than half of the votes of all factions.',
      'The game has no time limit. The first faction that meets one condition wins.',
    ],
  },
  {
    id: 'pirates',
    name: 'Pirates and anomalies',
    text: [
      'Pirates live in dens in space that no faction owns. They attack all factions, destroy stations and blockade trade routes. They cannot capture planets.',
      'Move a warship into a den to destroy it. You get credits and influence.',
      'Void Leviathans appear in nebulae from the last shift of Rota 4 on. They are slow and very strong.',
      'An anomaly gives a reward to the first unit that enters the hex: credits, science, influence, a star chart or a derelict warship. Some anomalies are old mines. Some are stranger: a ship may arrive rested and repaired three days before it left, or come back damaged with a map it cannot explain.',
    ],
  },
  {
    id: 'edge',
    name: 'The Edge of the galaxy',
    text: [
      'The map does not wrap around. The last row and the last column of hexes are the last stars there are. Beyond them the charts show the Falls: streaks of light that leave the galaxy and do not come back.',
      'Every species has its own name for the Edge and the same rule about it. Ships that fly past the last star lose contact within the hour. A few have sent back one message, always the same one: a request to turn round. None have turned round.',
      'The Sarn say that the galaxy is not flat, that the Falls are an illusion of the chart, and that the truth is more interesting. They also say that they have not been past the Edge either. The Ilthari have a paper on it. It is under review.',
      'For play, this means: plan routes inside the map, and remember that a home planet near the Edge has fewer neighbours and fewer directions to expand, but also fewer directions to be attacked from.',
    ],
  },
  {
    id: 'hollow',
    name: 'The Hollow',
    text: [
      'Something lives in the Void Rifts. From the last shift of Rota 3 on, a Hollow Whisper can leave a rift that no faction watches. After Rota 8 a Hollow Choir can appear as well. There are never many of them.',
      'Hollow units enter rifts without a drive. A Hollow unit that stands on a rift can appear on another rift up to 14 hexes away, with nothing in between. Watchers see it step out.',
      'They attack units, take stations apart, and blockade trade routes like pirates. They keep to the space near their rift. They do not take planets and cannot be negotiated with.',
      'A destroyed Hollow unit leaves no wreck. The faction that destroyed it gets science: 15 plus one sixth of the unit cost.',
      'The Sarn Elders know what the Hollow is. They have declined to say.',
    ],
  },
  {
    id: 'difficulty',
    name: 'Difficulty levels',
    text: DIFFICULTIES.map((d) => `${d.name}: ${d.text} AI yields ${Math.round(d.aiYieldMult * 100)}%, AI costs ${Math.round(d.aiCostMult * 100)}%, your base morale ${d.playerMorale}.`),
  },
];

function stats(rows: [string, Child][]): HTMLElement {
  return h('table.stats', null, rows.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false).map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v))));
}

function speciesName(id?: string): string {
  return id && id !== 'pirates' ? SPECIES[id as keyof typeof SPECIES].name : '';
}

function entries(app: App): Entry[] {
  const color = app.hasGame ? app.faction.color : '#d9782d';
  const out: Entry[] = [];
  for (const c of CONCEPTS) {
    out.push({ key: `concept:${c.id}`, name: c.name, category: 'Rules', search: c.text.join(' '), render: () => c.text.map((t) => h('p', null, t)) });
  }
  for (const id of PLAYABLE) {
    const sp = SPECIES[id];
    out.push({
      key: `species:${id}`,
      name: sp.name,
      category: 'Species',
      search: `${sp.archetype} ${sp.leader} ${sp.text}`,
      render: (link) => [
        h('div.row', null, img(leaderPortrait(id), 96, 'portrait'), h('div', null, h('div', null, `Leader: ${sp.leader}`), h('div', null, `Type: ${sp.archetype}`))),
        h('p', null, sp.text),
        h('div.section', null, 'Lore'),
        sp.lore.map((t) => h('p', null, t)),
        h('div.section', null, 'Traits'),
        h('ul', null, sp.traitText.map((t) => h('li', { class: isPenalty(t) ? 'bad' : '' }, t))),
        h('div.section', null, 'Own units'),
        h('div', null, UNIT_LIST.filter((u) => u.species === id).map((u) => [link(`unit:${u.id}`), ' '])),
        h('div.section', null, 'Own building'),
        h('div', null, BUILDING_LIST.filter((b) => b.species === id).map((b) => [link(`building:${b.id}`), ' '])),
        h('div.section', null, 'Own technologies'),
        h('div', null, TECH_LIST.filter((t) => t.species === id).map((t) => [link(`tech:${t.id}`), ' '])),
        h('div.section', null, 'Technologies that the species cannot research'),
        h('div', null, sp.excludedTechs.map((t) => [link(`tech:${t}`), ' '])),
      ],
    });
  }
  for (const u of UNIT_LIST) {
    out.push({
      key: `unit:${u.id}`,
      name: u.name,
      category: 'Units',
      search: `${u.text} ${speciesName(u.species)}`,
      ...ownership(app, u, UNIT_LIST),
      render: (link) => [
        h('div.row', null, img(unitIconUrl(u.id, u.species && u.species !== 'pirates' ? SPECIES[u.species].color : color), 96, 'portrait')),
        h('p', null, u.text),
        h('p.text', null, UNIT_LORE[u.id] ?? ''),
        stats([
          ['Class', u.cls === 'military' ? 'Warship' : 'Civilian'],
          ['Cost', u.species === 'pirates' ? '' : `${u.cost} production`],
          ['Strength', u.strength || ''],
          ['Ranged strength', u.ranged ? `${u.ranged}, range ${u.range}` : ''],
          ['Ground strength', u.ground ?? ''],
          ['Movement', `${u.move} + FTL drive`],
          ['Sight', u.sight],
          ['Technology', u.tech ? link(`tech:${u.tech}`) : 'None'],
          ['Resource', u.resource ? link(`resource:${u.resource}`) : ''],
          ['Species', u.species && u.species !== 'pirates' ? link(`species:${u.species}`) : u.species === 'pirates' ? 'Pirates' : 'All'],
          ['Replaces', u.replaces ? link(`unit:${u.replaces}`) : ''],
          ['Upgrades to', u.upgradesTo ? link(`unit:${u.upgradesTo}`) : ''],
        ]),
      ],
    });
  }
  for (const b of BUILDING_LIST) {
    out.push({
      key: `building:${b.id}`,
      name: b.name,
      category: 'Buildings',
      search: `${b.text} ${speciesName(b.species)}`,
      ...ownership(app, b, BUILDING_LIST),
      render: (link) => [
        img(spriteUrl(buildingSprite(b.id, b.category)), 96, 'portrait'),
        h('p', null, b.text),
        h('p.text', null, BUILDING_LORE[b.id] ?? ''),
        stats([
          ['Cost', `${b.cost} production`],
          ['Upkeep', `${b.upkeep} credits per shift`],
          ['Technology', b.tech ? link(`tech:${b.tech}`) : 'None'],
          ['Resource', b.resource ? link(`resource:${b.resource}`) : ''],
          ['Species', b.species ? link(`species:${b.species}`) : 'All'],
          ['Replaces', b.replaces ? link(`building:${b.replaces}`) : ''],
        ]),
      ],
    });
  }
  for (const p of Object.values(PROJECTS)) {
    out.push({
      key: `project:${p.id}`,
      name: p.name,
      category: 'Projects',
      search: p.text,
      render: (link) => [
        img(spriteUrl(projectSprite(p.id)), 96, 'portrait'),
        h('p', null, p.text),
        h('p.text', null, PROJECT_LORE[p.id] ?? ''),
        stats([['Cost', `${p.cost} production`], ['Technology', link(`tech:${p.tech}`)], ['Resource', p.resource ? link(`resource:${p.resource}`) : ''], ['Purchase', 'Not possible']]),
      ],
    });
  }
  for (const t of TECH_LIST) {
    out.push({
      key: `tech:${t.id}`,
      name: t.name,
      category: 'Technologies',
      search: `${t.text} ${t.category} ${speciesName(t.species)}`,
      status: techStatus(app, t),
      render: (link) => [
        img(spriteUrl(techSprite(t.id, t.category)), 96, 'portrait'),
        h('p', null, t.text),
        h('p.text', null, TECH_LORE[t.id] ?? ''),
        stats([
          ['Era', ERA_NAMES[t.era]],
          ['Category', t.category],
          ['Base cost', `${t.cost} science`],
          ['Needs', t.prereqs.length ? t.prereqs.map((p) => [link(`tech:${p}`), ' ']) : 'Nothing'],
          ['Leads to', TECH_LIST.filter((o) => o.prereqs.includes(t.id)).map((o) => [link(`tech:${o.id}`), ' '])],
          ['Units', UNIT_LIST.filter((u) => u.tech === t.id).map((u) => [link(`unit:${u.id}`), ' '])],
          ['Buildings', BUILDING_LIST.filter((b) => b.tech === t.id).map((b) => [link(`building:${b.id}`), ' '])],
          ['Projects', Object.values(PROJECTS).filter((p) => p.tech === t.id).map((p) => [link(`project:${p.id}`), ' '])],
          ['Species', t.species ? link(`species:${t.species}`) : 'All'],
          ['Not available to', PLAYABLE.filter((sp) => SPECIES[sp].excludedTechs.includes(t.id)).map((sp) => [link(`species:${sp}`), ' '])],
        ]),
      ],
    });
  }
  for (const t of Object.values(TERRAIN)) {
    if (t.id === 'planet') continue;
    out.push({
      key: `terrain:${t.id}`,
      name: t.name,
      category: 'Space biomes',
      search: t.text,
      render: () => [
        img(spriteUrl(terrainSprite(t.id, 3)), 96, 'portrait'),
        h('p', null, t.text),
        h('p.text', null, TERRAIN_LORE[t.id] ?? ''),
        stats([
          ['Yields', yieldRow(t.yields)],
          ['Station', t.stationName ? [img(stationIconUrl(t.id), 40, 'portrait'), ' ', t.stationName, ' ', yieldRow(t.station)] : 'Not possible'],
          ['Movement cost', t.moveCost || 'Ships cannot enter'],
          ['Defence bonus', t.defence ? `+${Math.round(t.defence * 100)}%` : ''],
          ['Population can work it', t.workable ? 'Yes' : 'No'],
        ]),
      ],
    });
  }
  for (const p of Object.values(PLANET_TYPES)) {
    out.push({
      key: `planet:${p.id}`,
      name: `${p.name} planet`,
      category: 'Planet types',
      search: p.text,
      render: (link) => [
        img(planetIconUrl(p.id, 0), 96, 'portrait'),
        h('p', null, p.text),
        h('p.text', null, PLANET_LORE[p.id] ?? ''),
        stats([
          ['Yields', yieldRow(p.yields)],
          ['Population limit', p.popCap],
          ['Colonize with', p.id === 'terran' || p.id === 'ocean' ? 'No technology needed' : link(`tech:${TECH_LIST.find((t) => t.effects.some((m) => m.kind === 'colonize' && m.types.includes(p.id)))!.id}`)],
          ['Terraform to', p.terraformTo ? link(`planet:${p.terraformTo}`) : 'Not possible'],
        ]),
      ],
    });
  }
  for (const r of Object.values(RESOURCES)) {
    out.push({
      key: `resource:${r.id}`,
      name: r.name,
      category: 'Resources',
      search: r.text,
      render: (link) => [
        img(iconUrl(r.id), 56, 'portrait'),
        h('p', null, r.text),
        h('p.text', null, RESOURCE_LORE[r.id] ?? ''),
        stats([
          ['Kind', r.kind === 'luxury' ? `Luxury: +${LUXURY_MORALE} morale` : 'Strategic'],
          ['Station bonus', yieldRow(r.bonus)],
          ['Found in', r.terrains.map((t) => [link(`terrain:${t}`), ' '])],
          ['Shown by', revealTech(r.id) ? link(`tech:${revealTech(r.id)!.id}`) : 'Always visible'],
          ['Needed for', [...UNIT_LIST.filter((u) => u.resource === r.id).map((u) => [link(`unit:${u.id}`), ' ']), ...BUILDING_LIST.filter((b) => b.resource === r.id).map((b) => [link(`building:${b.id}`), ' ']), ...Object.values(PROJECTS).filter((p) => p.resource === r.id).map((p) => [link(`project:${p.id}`), ' '])]],
        ]),
      ],
    });
  }
  return out;
}

let query = '';
let category = 'Rules';

export function renderEncyclopedia(app: App): HTMLElement {
  const all = entries(app);
  const byKey = new Map(all.map((e) => [e.key, e]));
  // Accept "tech:x", "unit:x", "building:x", "project:x" from other screens.
  let current = app.screenArg ? byKey.get(app.screenArg) : undefined;
  if (current) category = current.category;
  const categories = [...new Set(all.map((e) => e.category))];
  const q = query.trim().toLowerCase();
  const list = q ? all.filter((e) => e.name.toLowerCase().includes(q) || e.search.toLowerCase().includes(q)) : all.filter((e) => e.category === category);
  if (!current) current = list[0];
  const go = (key: string) => {
    query = '';
    app.open('encyclopedia', key);
  };
  const link = (key: string, label?: string) => {
    const e = byKey.get(key);
    return h('a.link', { onclick: () => go(key) }, label ?? e?.name ?? key);
  };
  const input = h('input', { type: 'text', placeholder: 'Search (key: /)', value: query, 'data-key': '/' }) as HTMLInputElement;
  input.addEventListener('input', () => {
    query = input.value;
    app.screenArg = undefined;
    app.refresh();
    const again = app.overlay.querySelector('.ency input') as HTMLInputElement | null;
    again?.focus();
    again?.setSelectionRange(query.length, query.length);
  });
  // A click on an illustration opens it large. A generated image is shown from its full size original, with the
  // small game file as the fallback.
  const lightbox = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLImageElement) || !target.classList.contains('portrait')) return;
    const big = openLightbox(originalUrl(target.src));
    big.onerror = () => {
      big.onerror = null;
      big.src = target.src;
    };
  };
  // A phone shows the list or the entry, one at a time.
  const body = h(
      'div.ency',
      { class: app.mobile ? (app.screenArg ? 'detail' : 'list') : '' },
      h(
        'div.cats',
        null,
        input,
        categories.map((c, i) =>
          h(
            'div.entry.clickable',
            {
              class: !q && c === category ? 'selected' : '',
              'data-key': i < 9 ? String(i + 1) : undefined,
              onclick: () => {
                category = c;
                query = '';
                app.open('encyclopedia', undefined);
              },
            },
            c,
            h('span.dim', null, ` ${all.filter((e) => e.category === c).length}`),
            i < 9 ? keyHint(String(i + 1)) : null,
          ),
        ),
      ),
      h(
        'div.names.keepscroll',
        { 'data-id': `ency-${q ? 'q' : category}` },
        list.map((e) =>
          h(
            'div.entry.clickable',
            { class: `${e.key === current?.key ? 'selected' : ''} ${e.status ?? ''}`, title: statusText(e), onclick: () => app.open('encyclopedia', e.key) },
            e.name,
            e.status === 'own' ? h('span.owntag', null, ' yours') : null,
            q ? h('span.dim', null, ` ${e.category}`) : null,
          ),
        ),
        list.some((e) => e.status) ? h('div.dim.legend', null, 'Bright: exclusive to your species. Dim: not available to you, or replaced by your own version.') : null,
        list.length ? null : h('div.dim', null, 'No entry matches the search.'),
      ),
      h(
        'div.detail',
        null,
        current
          ? [
              app.mobile ? h('div.row', null, button('Back to the list', () => app.open('encyclopedia', undefined), { cls: 'small' })) : null,
              h('div.head', null, current.name, current.status === 'own' ? h('span.owntag', null, ` ${statusText(current)}`) : current.status ? h('span.bad', null, ` ${statusText(current)}`) : null),
              h('div.dim', null, current.category),
              current.render(link),
            ]
          : null,
      ),
    );
  // The listener is not a click handler of h(), so the keyboard does not stop at the whole page.
  body.addEventListener('click', lightbox);
  return frame(app, 'Encyclopedia', body, { wide: true });
}

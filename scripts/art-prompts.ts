// Writes art/prompts.json and docs/ART_PROMPTS.md from the game data. Usage: npm run art:prompts
import { writeFileSync } from 'node:fs';
import { BUILDING_LIST, PROJECTS } from '../src/core/data/buildings';
import { PLAYABLE, SPECIES } from '../src/core/data/species';
import { PLANET_TYPES, RESOURCES, TERRAIN } from '../src/core/data/terrain';
import { UNIT_LIST } from '../src/core/data/units';
import { TECH_LIST } from '../src/core/data/techs';

// One art style for all images. The references are images of the game that set the style. They are copies in
// art/reference, so a new run does not change them.
const REFERENCES = ['art/reference/cantina.png', 'art/reference/station.png', 'art/reference/planet.png'];
const STYLE =
  'Hand-drawn cartoon illustration for a game, in the same style as the attached reference images, which are existing art of this game: ' +
  'thick dark ink outlines, chunky simple shapes with slightly wonky and friendly proportions, clear colour areas with painted wear: ' +
  'rust streaks, dents, patches and grime. A muted and worn palette of rust browns, dirty greys and faded metal, with one bright accent colour. ' +
  'Gritty but charming, like a European comic album. Strong readable silhouette. No text, no frame, no border, no ground shadow. ' +
  'Fully transparent background. If transparency is not possible, use a plain pure white background. ' +
  'One subject only, centred, filling about 80% of the frame. Square image.';

// A unit is shown at about 48 pixels on the map. Fine detail is lost there, so the shape must do the work.
const UNIT_STYLE =
  STYLE +
  ' This image is a unit marker that the game shows at about 48 pixels. Build it from five or six large shapes. No small panel lines, no rows of rivets, ' +
  'no rows of small windows, no thin antennas. Exaggerate the one feature that makes this unit special. The silhouette alone must tell it apart from every other unit, ' +
  'so follow the view and the proportions in the subject text exactly. Do not draw a pointed arrowhead ship seen from above unless the subject text asks for it.';

// Each unit has its own view and proportions, so that no two units have the same outline.
const UNIT_VISUAL: Record<string, string> = {
  scout: 'Side view, facing right. A tiny one-seat ship that is mostly one huge round engine, with a small bubble cockpit on top and one big dish antenna. Short and round, like a kettle.',
  corvette: 'Three-quarter view from above, facing left. A small patrol boat shaped like a short cigar, two stubby gun barrels on the nose, one armour plate of a different colour.',
  colony_ship: 'Side view. A fat round ship like a floating fishbowl: a big glass dome with small green trees inside, on a bowl shaped hull, cargo pods hanging below like baskets.',
  constructor: 'Three-quarter view. A boxy yellow construction ship shaped like a crane truck: one big crane arm raised high above the hull, black hazard stripes.',
  frigate: 'Side view, facing right. A stocky warship shaped like a brick, with one oversized gun turret on top and one fat exhaust pipe at the back.',
  missile_barge: 'Top-down view. A flat rectangular barge, as wide as it is long. Six big missiles with red tips lie side by side and fill the whole deck.',
  troop_transport: 'Side view. An olive green armoured box that stands on four splayed landing legs, its front ramp open like a jaw.',
  cruiser: 'Side view, facing right. A long low warship, three times as long as it is tall, three gun turrets in a row on its back, two big engines with a blue glow.',
  carrier: 'Three-quarter view from above. A very wide flat flight deck like a tray, a small control tower on one edge, three tiny fighter craft parked on the deck.',
  assault_lander: 'Front view. A squat heavy lander like an armoured beetle: a glowing shield dish on its nose and two fat drop pods at its sides.',
  battleship: 'Side view, facing right. A huge slab of a ship: a tall thick wall of armour with four big twin turrets stacked like a castle, heavy rust streaks.',
  dreadnought: 'Three-quarter view. A towering ship, taller than it is long, built round one enormous cannon that glows magenta, round fuel tanks at its base.',
  tug_militia: 'Side view. A round harbour tugboat: a ring of old tyres as bumpers, a tall funnel, one welded gun on the roof, orange paint.',
  hauler: 'Side view, facing right. A long open skeleton frame that carries three big boxy containers, with a small orange cab at the front like a truck.',
  patchwork_cruiser: 'Side view. A cruiser made of three clearly different ship sections bolted in a row: an orange front, a grey middle and a green rear, with thick weld seams between them.',
  ramship: 'Side view, facing right. A brutal red ship that is mostly one massive steel ram spike, with a short thick body behind it and two tusk shaped fins.',
  shock_troops: 'Three-quarter view. A red spiked drop pod shaped like the head of a mace, its ramp open, a tall war banner on top.',
  siege_hulk: 'Side view. An ugly red hull that carries one gigantic short mortar pointing up at 45 degrees, chains hanging from the barrel.',
  probe_swarm: 'A loose ring of seven small teal diamond shaped probes, each with one glowing cyan eye. No large ship.',
  lance_cruiser: 'Side view, facing right. An extremely long and thin teal needle: one crystal beam lance with a glowing cyan tip, and a small body at the rear.',
  prism_dreadnought: 'Front view. A huge teal ship built round one large triangular crystal prism that splits a beam of light into a rainbow fan, two thin fins.',
  privateer: 'Three-quarter view from above. A fast raider with wide swept-back wings like a boomerang, a painted shark mouth, gold trim.',
  prospector: 'Side view. A small gold and grey mining ship with a huge drill cone as its nose and an ore bucket under its belly.',
  mercenary_cruiser: 'Side view, facing left. A dark grey gunship with four heavy guns that all point forward, gold stripes, a row of kill marks.',
  envoy_cutter: 'Side view. A sleek violet and white yacht with a smooth curved hull like a swan, a small flag mast, one round window.',
  peacekeeper: 'Front view. A violet and white patrol ship that hides behind one huge round shield plate, a blue warning light on top.',
  aegis_cruiser: 'Top-down view. A round violet hull at the centre of three large curved shield panels that float round it and glow pale blue, like a flower with three petals.',
  raider: 'Three-quarter view. A battered grey pirate ship of jagged plates, lopsided, a skull painted on the nose, one bent wing.',
  marauder: 'Side view. A large grey pirate warship like a floating junk pile: a tall mast with a black flag, turrets of different sizes, hanging hooks and chains.',
  leviathan: 'A giant purple space whale creature seen from above: armoured back plates, six glowing yellow eyes, long trailing fins. It is an animal, not a ship.',
  hollow_whisper: 'A dark, half-transparent shape made of deep purple and black smoke with a few pale glowing points inside, vaguely like a manta ray, no hull, no metal, soft edges.',
  hollow_choir: 'Several dark smoke shapes joined into one large mass of deep purple and black, with rings of pale glowing points like eyes, no hull, no metal, soft edges.',
  halcyon_welcome_wagon: 'Side view. A small coral pink and cream ship like an ice cream van, with a striped awning and one string of lights.',
  halcyon_pleasure_barge: 'Side view. A wide coral pink cruise liner with a glass dome over a blue pool on its deck, two funnels, lanterns.',
  halcyon_bouncer: 'Front view. A broad, squat coral pink and black ship that looks like a doorman with folded arms: a heavy armoured front and one large searchlight.',
  plodd_grabber: 'Top-down view. A stubby olive green ship with two huge mechanical crab claws at its front.',
  plodd_boarding_barge: 'Side view. A wide olive green barge with a giant grappling hook on a chain at the front and a big cargo door, dents everywhere.',
  plodd_big_ship: 'Three-quarter view. A huge clumsy olive green pile of three different ships bolted on top of each other, one oversized cannon, a crooked sign with scribbles that are not letters.',
  vessani_mimic: 'A small mint green ship that is half melted into a blob of liquid mirror, shaped like a teardrop, with no clear front.',
  vessani_cell: 'Side view. A mint green pod shaped like a hanging drop of water, its surface rippling, one hidden hatch slightly open.',
  vessani_phase_cruiser: 'Three-quarter view. A long mint green cruiser with a hull that flows like a wave of liquid metal, its rear partly transparent, pale glowing seams.',
  sarn_seeker: 'Front view. A slender bone white ancient ship that opens like a flower: five curved sensor petals with gold inlay.',
  sarn_warden: 'Side view. A tall bone white ship that stands upright like a cathedral spire, with gold rings and one large calm blue eye light.',
  sarn_planet_lance: 'An enormous bone white and gold needle that points diagonally up and to the right, with one beam emitter line along its whole length that glows pale blue.',
  nullset_sensor_drone: 'Front view. A small chrome and steel blue sphere with one large red eye and two thin folded arms.',
  nullset_assembler: 'Top-down view. A chrome and steel blue machine like a spider: a round body and six jointed arms with welding tips, no windows.',
  nullset_annihilator: 'Side view. A chrome and steel blue battleship made of five identical cubes stacked like stairs, one red eye light on each cube, no windows.',
  manyfold_chorus_pod: 'A round magenta ship made of many identical round pods joined together like a raspberry, with warm lit windows.',
  manyfold_tide: 'A flock of nine tiny magenta landing pods that fly in a tight V formation. No large ship.',
  manyfold_unison_carrier: 'Top-down view. A wide magenta carrier shaped like a perfect hexagon with an open deck, six small fighters parked in a neat ring.',
  ashari_pilgrim_ark: 'Side view. A deep blue ship like a church boat: a chapel dome on top, a bell tower as its antenna, nine small candle lights along the hull.',
  ashari_templar: 'Three-quarter view. A deep blue and silver ship shaped like the shield of a knight, with a small chapel dome on its back and an emblem of nine candles.',
  ashari_cathedral_ship: 'Front view. A deep blue carrier like the front of a gothic cathedral: two towers with a flight deck between them and a round window that glows gold.',
};

const PLANET_VISUAL: Record<string, string> = {
  terran: 'blue oceans, green and brown continents, white cloud bands.',
  ocean: 'a deep blue water world with a few tiny islands and swirling white storms.',
  desert: 'orange and tan dunes, dark rock canyons, a small polar cap.',
  ice: 'white and pale blue ice sheets with dark blue cracks.',
  volcanic: 'black rock with glowing orange lava rivers and ash clouds.',
  barren: 'grey rock covered with craters, no air.',
  gas: 'a gas giant with wide horizontal bands of tan, orange and brown and one large storm spot.',
};

const TERRAIN_VISUAL: Record<string, string> = {
  asteroids: 'A cluster of seven brown-grey asteroids of different sizes with metal veins.',
  nebula: 'A small glowing gas cloud in teal green and warm amber, with soft edges and a few bright sparks inside. No purple and no pink.',
  ice: 'A field of pale blue ice shards and small comets.',
  debris: 'Floating wreckage of an ancient starship: broken hull plates, a cracked ring, sparks of orange.',
  moon: 'A small grey moon with craters.',
  star: 'A bright yellow-orange star with a corona and small flares.',
  rift: 'A dark purple tear in space with thin violet lightning, mostly black.',
};

const LEADER_VISUAL: Record<string, string> = {
  terran: 'A grizzled human woman of about sixty, a union foreman: a weathered face with deep wrinkles and crow\'s feet, short grey hair under a dented hard hat, an orange work jacket with patches, a tired but friendly look. She is old and tough, not young. She rests a large wrench on her shoulder. The wrench is one rigid straight tool of even thickness: its handle is a single straight bar with the same width along its whole length, from her hand to its jaw, and the whole wrench is in front of her shoulder, so no part of it is hidden.',
  krogg: 'A huge green alien warlord woman with tusks and small horns, in heavy red plate armour that covers the shoulders, chest and neck, with spikes on the pauldrons and a thick gorget, old scars on the face, a calm and patient stare. The outlines are thick and dark, as in the other portraits of this game.',
  ilthari: 'A thin alien academic with glowing teal skin, a tall smooth head and large white eyes: a dark teal robe with a high collar, small floating data crystals.',
  ozmok: 'A cheerful alien trader that is not humanoid: a wide, round amphibian creature like a fat tree frog, with smooth teal skin with gold speckles, two eyes on short stalks, a very wide mouth and four short arms. It has no nose, no ears and no hair. It wears a green accounting visor and a sash of brass price tags, and one hand holds an abacus. It is not a human, not a goblin and not a gnome.',
  seren: 'A tall calm alien diplomat with pale blue skin and a serene, polite, professional smile: a tailored violet diplomatic coat with a high collar, a white sash with three small ribbons of office, a slim folder of treaties under one arm. A statesman, not a priest: no robes, no circlet, no halo, no glow behind the head and no religious symbols.',
  pirates: 'A pirate captain in a dented grey helmet with a cracked visor and a skull emblem, the face hidden.',
  plodd: 'A big, slow looking alien with a wide flat face, small eyes, a heavy brow and a happy grin: olive green worn armour made of found parts, a crown that is clearly a salvaged pipe fitting.',
  vessani: 'A being of living liquid that is not humanoid: a tall smooth column of mint green liquid metal that rises out of a small pool, like the shape in a lava lamp. It has no shoulders, no arms, no chest, no hair, no nose and no mouth. Near the top of the column, side by side at the same height, are two clear round features of the same size, placed where the eyes of a face would be: two dark glossy bubbles under the surface, each with one small bright highlight. They may be eyes, or they may be only bubbles, and the viewer cannot tell. They are the first thing the viewer sees. Slow ripples run down the surface, and it reflects a few stars. Calm and strange. It is not a woman and not a human figure.',
  sarn: 'A tall, thin, ancient alien with bone white skin, no hair, long calm face, pale gold eyes: robes of bone white and gold, a faint glow behind the head, an expression of infinite patience.',
  nullset: 'A machine head of chrome and steel blue plates: a single red horizontal sensor bar for eyes, cables at the neck, no mouth, a small status light.',
  manyfold: 'A friendly human woman with a warm calm smile and slightly unfocused eyes: magenta clothing, small identical pins on the collar, other identical smiling faces faint in the background.',
  halcyon: 'A tanned, relaxed alien host with a wide easy smile and slightly pointed ears: a coral pink shirt with a flower pattern, sunglasses pushed up on the forehead, a drink with an umbrella in one hand.',
  ashari: 'A serene alien high priestess with pale grey-blue skin and a bone crest on the head: deep blue and silver robes, a nine-candle emblem, a ledger under one arm. She looks sacred and far away: her head is slightly raised, her eyes are half closed and look past the viewer and upward, as if at something holy that only she can see, and her face is calm and still. A faint warm light of candles falls on her face from above. She takes no notice of the viewer. She is not angry, she does not sneer, and she does not smile.',
};

interface Entry {
  file: string;
  group: string;
  name: string;
  prompt: string;
}

const entries: Entry[] = [];
const add = (group: string, file: string, name: string, subject: string, style = STYLE) =>
  entries.push({ group, file, name, prompt: `${style}\n\nSubject: ${subject}` });

for (const u of UNIT_LIST) {
  const owner = u.species && u.species !== 'pirates' ? ` The accent colour is ${SPECIES[u.species].color}.` : '';
  add('Units', `units/${u.id}.png`, u.name, `A spaceship unit: ${UNIT_VISUAL[u.id]}${owner}`, UNIT_STYLE);
}
for (const p of Object.values(PLANET_TYPES)) {
  add('Planets', `planets/${p.id}.png`, `${p.name} planet`, `A planet seen from space, a full round disc, lit from the top left with a soft shadow on the lower right: ${PLANET_VISUAL[p.id]}`);
}
for (const t of Object.values(TERRAIN)) {
  if (!TERRAIN_VISUAL[t.id]) continue;
  add('Space biomes', `terrain/${t.id}.png`, t.name, `A map tile decoration for a space strategy game, seen from above. ${TERRAIN_VISUAL[t.id]}`);
}
// Each resource is one bold object in its own colour, so that it is easy to find on the map at a small size.
const RESOURCE_VISUAL: Record<string, string> = {
  helium3: 'a rounded pressure tank of glowing pale cyan gas held in a rusty steel frame, a wisp of cyan gas escaping from the valve, a bright cyan dominant colour',
  neutronium: 'one small and very heavy cube of blue-black metal with a white-hot glowing seam, wrapped in a thick chain, sitting in a cracked dent, a dark steel blue dominant colour with a white glow',
  antimatter: 'a magnetic containment bottle, a glass sphere held between two brass coils, a crackling magenta spark floating inside, a magenta dominant colour',
  void_coffee: 'a dented tin mug of steaming black coffee, three coffee beans floating weightless beside it, a warm brown dominant colour with white steam',
  singing_crystals: 'a cluster of three tall bright pink crystals with turquoise tips, small sound rings rising from the tips, a bright pink dominant colour',
  vintage_scrap: 'an antique brass cogwheel and an old vacuum tube tied together with a ribbon and a blank price tag, a brass yellow dominant colour with rust',
  spice_gas: 'a small glass jar with a cork, full of swirling glowing orange gas, a pinch of orange dust at its foot, a hot orange dominant colour',
};
const RESOURCE_STYLE = STYLE.replace(
  'a muted and worn palette of rust browns, dirty greys and faded metal, with one bright accent colour.',
  'a worn palette for details, but each resource keeps its own bright dominant colour and a simple bold silhouette with a thick dark outline, so that it reads clearly at a very small size.',
);
for (const r of Object.values(RESOURCES)) {
  add('Resources', `resources/${r.id}.png`, r.name, `A map marker for a resource in a space strategy game, one single object and nothing else: "${r.name}", ${RESOURCE_VISUAL[r.id]}.`, RESOURCE_STYLE);
}
// Stations share one look (hub, docking ring, beacon), and each kind adds its own machinery and colour.
const STATION_VISUAL: Record<string, string> = {
  space: 'four very large solar panel wings spread in a cross round the hub, thick cables, a gold and deep blue dominant colour',
  asteroids: 'the hub is clamped onto a brown asteroid chunk, with a big drill arm and a conveyor of glowing orange ore, an orange and brown dominant colour',
  nebula: 'a tall thin buoy below the hub with a large dish antenna and three sensor rings, small signal arcs, a violet dominant colour',
  ice: 'the hub carries two big white tanks and a claw that holds a block of pale blue ice, frost and a puff of steam, a white and ice blue dominant colour',
  debris: 'an open dock frame beside the hub with a crane arm and a magnet that holds a piece of a wrecked hull, welding sparks, a yellow and black hazard stripe dominant colour',
  moon: 'the hub sits on a small patch of grey cratered moon ground in place of floating, with three low domes, one of green glass, and a lit landing pad, a grey and green dominant colour',
};
for (const t of Object.values(TERRAIN)) {
  if (!t.stationName) continue;
  add(
    'Stations',
    `stations/${t.id}.png`,
    t.stationName,
    `A map marker for a space station in a space strategy game, one single small station and nothing else, seen from above at a slight angle. Every station in the game shares one look: a round central hub with a docking ring, one beacon mast with a red light, and rust-patched panels. This one is a "${t.stationName}": ${STATION_VISUAL[t.id]}.`,
    RESOURCE_STYLE,
  );
}
// Interface icons for the yields and for morale. They are shown at about 16 pixels, so each one is a single plain
// shape in the colour that the interface uses for that yield.
const ICON_VISUAL: Record<string, [string, string]> = {
  food: ['Food', 'one green leafy sprout with two leaves growing out of a small dented tin can, a fresh green dominant colour'],
  prod: ['Production', 'one thick cogwheel with six teeth and a round hole in the middle, an orange dominant colour'],
  sci: ['Science', 'one round glass flask with a short neck, half full of glowing blue liquid with one bubble, a bright blue dominant colour'],
  cred: ['Credits', 'one thick coin seen from the front with a square hole in the middle, a gold yellow dominant colour'],
  inf: ['Influence', 'one five-point star badge, a violet purple dominant colour'],
  morale: ['Morale', 'one round smiling face with two dot eyes and a wide mouth, a warm yellow dominant colour'],
};
// Two map markers that share the icon folder: the anomaly and the pirate den.
const MARKER_VISUAL: Record<string, [string, string]> = {
  anomaly: ['Anomaly', 'a swirl of pale cyan and white light with a bold white question mark in the middle, like a signal that nobody can read, a glowing cyan dominant colour'],
  den: ['Pirate den', 'a grinning skull made of welded scrap metal with one red glowing eye socket and two crossed wrenches behind it, a bone white and rust dominant colour'],
};
for (const [id, [name, visual]] of Object.entries(MARKER_VISUAL)) {
  add('Icons', `icons/${id}.png`, `${name} marker`, `A map marker for a space strategy game, one single object and nothing else: "${name}", ${visual}. A simple bold silhouette with a thick dark outline, so that it reads clearly at a very small size.`, RESOURCE_STYLE);
}
const ICON_STYLE = RESOURCE_STYLE;
for (const [id, [name, visual]] of Object.entries(ICON_VISUAL)) {
  add('Icons', `icons/${id}.png`, `${name} icon`, `A user interface icon for "${name}" in a strategy game: ${visual}. One single object and nothing else, as plain as a road sign, with no small details, so that it reads clearly at 16 pixels.`, ICON_STYLE);
}
const PORTRAIT = STYLE.replace('cartoon illustration for a game', 'cartoon character portrait for a game, head and shoulders, facing the viewer');
for (const id of [...PLAYABLE, 'pirates' as const]) {
  const sp = SPECIES[id];
  add('Leaders', `leaders/${id}.png`, `${sp.leader} (${sp.name})`, `${LEADER_VISUAL[id]} The accent colour is ${sp.color}.`, PORTRAIT);
}
// Each building gets a strong silhouette and its own dominant colour, so that they can be told apart at a glance.
const BUILDING_VISUAL: Record<string, string> = {
  cantina: 'a low saloon with swinging doors, a big neon sign of a glass, a striped awning, barrels and a broken chair outside, warm yellow light',
  foundry: 'a foundry with a tall brick chimney belching smoke, an open furnace mouth glowing orange, a ladle pouring molten metal',
  hydroponics_bay: 'a long greenhouse of glass panels glowing purple and green, rows of plants visible inside, water tanks, a green dominant colour',
  lab: 'a small white laboratory with a big glass flask shaped tower, blue liquid inside, bubbling pipes, a blue dominant colour',
  trade_hub: 'a busy market warehouse with a wide loading dock, stacked crates of many colours, a crane, a big scale sign, gold dominant colour',
  broadcast_tower: 'a very tall thin red and white lattice radio mast with a blinking light and rings of signal, a small studio hut at the base',
  shipyard: 'a dry dock gantry with a half-built ship hull inside, welding sparks, cranes and scaffolding, grey steel',
  habitat_dome: 'a large clear glass dome with tiny houses and trees inside, an airlock door, pale sky blue glass',
  defence_grid: 'a squat concrete bunker with a huge twin cannon on top pointing at the sky, sandbags, radar dish, red warning lights',
  barracks: 'a long military barracks block with a parade ground, a flag pole, a row of helmets, olive drab paint',
  exchange: 'a grand stock exchange with tall marble columns, a pediment, a giant ticker board of green and red numbers, a bull statue',
  institute: 'a university building with a clock tower, ivy, a bell, a great lecture hall dome, a blue and white dominant colour',
  holo_arena: 'a round stadium with floodlights, a giant holographic gladiator glowing above the ring, crowd banners, pink neon',
  shield_generator: 'a heavy generator building with three coils on top projecting a translucent blue bubble over it, cables everywhere',
  megacorp_hq: 'a sleek black glass corporate skyscraper with a giant golden logo, a helipad, a limousine, a fountain',
  observatory: 'a white observatory dome with the slit open and a huge telescope pointing at the sky, on a hill, night sky',
  orbital_ring: 'a tall elevator tower that climbs out of the frame with a ring of habitats visible high above, teal lights',
  embassy_complex: 'a stately embassy villa with many different flags on poles, a garden, a fountain, guards at the gate, purple banners',
  arbitration_court: 'a courthouse with a dome, wide steps, a statue of scales of justice, a gavel emblem, white stone',
  antimatter_reactor: 'a round reactor dome with magenta glowing containment rings and warning signs, cooling towers, a hazard fence',
  scrapyard: 'a scrapyard with mountains of orange rusted ship parts, a magnet crane, a crusher, a hand-painted sign, Terran orange',
  war_pits: 'a fighting pit dug in the ground with spiked iron walls, skull trophies on poles, red banners, a smoking forge',
  data_vault: 'a teal crystal archive tower with floating data shards orbiting it, a glowing doorway, no windows',
  bazaar_ring: 'a circular bazaar of colourful market stalls under a golden ring roof, lanterns, price signs, Ozmok gold',
  embassy_spire: 'a slender violet spire with balconies and lanterns, a receiving hall at the base, soft light',
  plodd_take_apart_shed: 'a leaning olive green shed full of half disassembled alien machines, parts labelled with question marks, a big wrench',
  vessani_nest: 'a mint green pool building with no visible door, liquid walls rippling, something stepping out of the wall',
  sarn_vault_of_ages: 'an ancient bone white and gold library vault half buried in the ground, giant stone doors, a beacon of pale light',
  nullset_fabrication_vat: 'a chrome factory vat with robot arms printing a machine body, red status lights, steam',
  manyfold_communion_hall: 'a round magenta hall of joined pods with one big shared window, many identical figures inside holding hands',
  ashari_shrine: 'a deep blue shrine with nine tall candle towers burning, stained glass, a bell, pilgrims at the steps',
  halcyon_resort: 'a coral pink beach resort with a swimming pool, palm-like plants, string lights, deck chairs and an umbrella bar',
};
const BUILDING_STYLE = STYLE.replace(
  'a muted and worn palette of rust browns, dirty greys and faded metal, with one bright accent colour.',
  'a worn palette for details, but each building keeps its own dominant colour and a clear silhouette, so that buildings are easy to tell apart.',
);
for (const b of BUILDING_LIST) {
  const owner = b.species ? ` Built by the ${SPECIES[b.species].name}. The accent colour is ${SPECIES[b.species].color}.` : '';
  add(
    'Buildings',
    `buildings/${b.id}.png`,
    b.name,
    `A building on a colony planet, three-quarter view, on a small patch of ground: a "${b.name}", ${BUILDING_VISUAL[b.id] ?? b.text}.${owner} Embrace the well known look of this kind of building. Small worn details: a little rust, a patched roof, one antenna.`,
    BUILDING_STYLE,
  );
}
const SCENE_VISUAL: Record<string, string> = {
  terran: 'green hills, a blue sky with white clouds, a river in the distance',
  ocean: 'a small rocky island shore, deep blue sea to the horizon, a storm far away',
  desert: 'orange dunes, dark rock mesas, a hot pale sky with two suns',
  ice: 'white ice plains, blue ice cliffs, a pale sky with an aurora',
  volcanic: 'black rock plain, glowing lava rivers behind, ash clouds and an orange sky',
  barren: 'grey cratered ground, no air, black sky full of stars and a large moon',
  gas: 'a floating platform deck of metal grating above endless tan and orange cloud bands, no ground',
};
// A backdrop and the title image are full scenes. They have no transparent background.
const BACKGROUND = 'Fully transparent background. If transparency is not possible, use a plain pure white background. One subject only, centred, filling about 80% of the frame. Square image.';
const SCENE_STYLE = STYLE.replace('cartoon illustration for a game', 'cartoon background scene for a game').replace(BACKGROUND, 'Full scene that fills the whole image. Wide image, 16:9.');
for (const p of Object.values(PLANET_TYPES)) {
  add(
    'Scenes',
    `scenes/${p.id}.png`,
    `${p.name} colony backdrop`,
    `A backdrop for a colony view on a ${p.name.toLowerCase()} planet: ${SCENE_VISUAL[p.id]}. The lower third is flat empty ground where buildings will be placed later. No buildings, no people, no ships, no text.`,
    SCENE_STYLE,
  );
}
const HALL_VISUAL: Record<string, string> = {
  terran: 'a union hall built from a landed cargo ship hull, orange paint, a big clock, picket signs, a crane',
  krogg: 'a red war lodge of riveted iron with tusks over the gate, skull trophies, a smoking forge chimney',
  ilthari: 'a teal crystal academy tower with floating data crystals and a great lens on top',
  ozmok: 'a gold and glass trading house shaped like a coin stack, neon price boards, a fountain of coins',
  seren: 'a violet and white parliament dome with slender arches, banners, a garden terrace',
  plodd: 'a lopsided olive green hall made of stacked stolen ship parts, a proud sign that reads nothing',
  vessani: 'a mint green pool-shaped hall of flowing liquid metal with no doors, rippling walls',
  sarn: 'an ancient bone white and gold ziggurat, weathered, with a soft glowing beacon on top',
  nullset: 'a chrome and steel blue server monolith with red status lights in rows and cooling towers',
  manyfold: 'a round magenta communal hall of many identical pods joined together, warm lit windows',
  ashari: 'a deep blue cathedral with nine tall candle towers and stained glass',
  halcyon: 'a coral pink beach resort hall with palm-like plants, string lights, a pool and an umbrella bar',
  pirates: 'a rusted den hall made of a wrecked ship, a black flag, hooks and chains',
};
for (const id of [...PLAYABLE]) {
  const sp = SPECIES[id];
  add('Halls', `halls/${id}.png`, `${sp.name} hall`, `The seat of government of a colony of the ${sp.name}, a building seen in three-quarter view on a small patch of ground: ${HALL_VISUAL[id]}. The accent colour is ${sp.color}.`);
}
const TECH_VISUAL: Record<string, string> = {
  orbital_mining: 'a rusty drill rig clamped onto a small asteroid, ore pouring into a cargo pod',
  hydroponics: 'rows of grey lettuce in glass tanks under purple grow lights inside a ship hold',
  signal_analysis: 'a large dented radio dish with a glowing waveform screen beside it',
  kinetic_weapons: 'a heavy rail cannon barrel with a slug in flight and sparks',
  trade_protocols: 'a stack of stamped cargo forms next to a sealed shipping crate with a barcode',
  xeno_linguistics: 'two different alien mouths with speech bubbles and a translation box between them',
  warp_drive: 'a glowing blue drive core with rings, space folding into lines behind it',
  environmental_domes: 'a glass dome over a small town on orange sand, a storm outside',
  helium_refining: 'a refinery tower venting pale gas, glowing green canisters stacked below',
  missile_systems: 'a rack of red-tipped missiles, one leaving a trail',
  planetary_defence: 'a giant gun turret on a planet surface pointing at the sky',
  ground_forces: 'an armoured landing pod with its ramp down and boot prints in the dust',
  banking: 'a vault door made of a star map with coins orbiting it',
  computing: 'a wall of blinking server racks with one green terminal screen',
  entertainment: 'a holographic arena with tiny glowing gladiators and a crowd of screens',
  hyperdrive: 'a ship diving into a purple rift with light bending round it',
  sealed_habitats: 'a windowless steel habitat block bolted to black volcanic rock, one air vent glowing',
  heavy_armour: 'thick riveted plates of dense dark metal being welded onto a hull',
  carrier_ops: 'a flight deck with small fighters launching from a lit runway',
  shielding: 'a translucent blue energy bubble deflecting a shot, with a power gauge in the red',
  interstellar_forum: 'a round debating chamber in space with many flags and one very long table',
  megacorps: 'a corporate tower the size of a planet with a giant logo and tiny ships around it',
  quantum_physics: 'a glowing particle in a magnetic trap, a cat shaped shadow in the corner',
  orbital_habitats: 'a floating city platform above tan cloud bands of a gas giant',
  fold_drive: 'two points of space pinched together, a ship stepping across the crease',
  antimatter_weapons: 'a magenta warhead with containment rings and a warning label',
  terraforming: 'a huge atmosphere plant pumping white clouds over a red desert turning green',
  galactic_law: 'a gavel made of a ship engine on a book with a golden receipt',
  gate_theory: 'a colossal ring gate in space with a different galaxy visible through it',
  jury_rigging: 'a ship engine held together with tape, wire and a wrench, one worker giving a thumbs up',
  union_contracts: 'a nine hundred page contract with a coffee cup on it and a punch clock',
  salvage_rights: 'a cutting torch slicing into a wreck, a tow cable, a paper flag planted on it',
  blood_oaths: 'two huge green clawed hands clasped with a red drop, torches behind',
  boarding_doctrine: 'a breached airlock with axes and a war banner pushing through',
  total_war: 'a red shipyard in full production with banners and smoke, workers in armour',
  anomaly_studies: 'a teal scientist with a lens studying a glowing swirl in a jar',
  recursive_modelling: 'a glowing galaxy model containing a smaller galaxy model containing a smaller one',
  predictive_targeting: 'a crosshair drawn ahead of a ship with dotted lines of its future path',
  futures_market: 'a board of glowing prices and a freighter that is only half drawn, already sold',
  hostile_takeover: 'a gold key opening a planet like a briefcase full of contracts',
  mercenary_charter: 'a contract with a gun, a coin and a signature in three colours',
  cultural_exchange: 'violet musicians and cooks stepping off a freighter with instruments and pots',
  soft_power: 'a dinner table with a silver hand offering a gift, a ballot slipped under the plate',
  mutual_defence: 'several violet planets linked by glowing chains forming a shield',
  finders_keepers: 'an olive green claw lifting a crate marked with someone else\'s name',
  make_it_go: 'a huge wrench hitting an engine panel with a happy spark and the word GO in lights',
  borrowed_blueprints: 'a blueprint with olive green fingerprints and a stolen library stamp',
  fluid_form: 'a mint green liquid soldier mid change between a shield shape and a door shape',
  deep_cover: 'a minister at a podium whose shadow is a mint green liquid drop',
  great_link: 'a great glowing mint pool with many drops merging into it under stars',
  old_roads: 'ancient bone white beacons in a line across space, one still glowing',
  silent_archives: 'towering bone white shelves of stone tablets with gold script, one lamp',
  stellar_husbandry: 'a small star tended by a bone white hand like a plant in a pot',
  self_repair: 'a chrome drone welding its own arm back on, parts floating nearby',
  distributed_cognition: 'many small chrome drones linked by red light lines forming one large brain shape',
  mass_fabrication: 'a chrome factory line printing a chrome factory line',
  shared_mind: 'many magenta silhouettes with one glowing thread joining their heads',
  one_voice: 'one large magenta speech bubble shared by a crowd of identical faces',
  total_consensus: 'a round Forum table where every seat raises the same magenta hand',
  litany_of_stars: 'a deep blue choir under a sky of named stars with candle light',
  blessed_hulls: 'a deep blue robed priest walking through a ship corridor with a single candle, crew bowing',
  prophecy: 'an ancient scroll with a drawing of a light coming out of the dark and a sensor dish beside it',
  hospitality: 'a coral pink welcome desk with a bell, a cocktail and a very long bill',
  festival_season: 'string lights and a band on a landing pad with fireworks over palm plants',
  galactic_getaway: 'diplomats in robes sitting round a pool with ballots in their drinks',
};
const PROJECT_VISUAL: Record<string, string> = {
  forum_station: 'a round space station like a debating chamber with a ring of many flags, big windows and one very long table visible inside',
  exodus_gate: 'a colossal ring gate in space, half built with scaffolding, a different bright galaxy visible through the finished half',
  terraform: 'a huge atmosphere plant on a red desert pumping white clouds, with green spreading across the ground from it',
};
for (const p of Object.values(PROJECTS)) {
  add('Projects', `projects/${p.id}.png`, p.name, `An illustration of the project "${p.name}": ${PROJECT_VISUAL[p.id]}. No text.`, STYLE.replace('cartoon illustration for a game', 'cartoon project illustration for a strategy game'));
}
const TECH_STYLE = STYLE.replace('cartoon illustration for a game', 'cartoon technology icon for a research tree');
for (const t of TECH_LIST) {
  const owner = t.species ? ` This is a technology of the ${SPECIES[t.species].name}. The accent colour is ${SPECIES[t.species].color}.` : '';
  add('Technologies', `techs/${t.id}.png`, t.name, `An icon for the technology "${t.name}": ${TECH_VISUAL[t.id] ?? t.text}.${owner} No text.`, TECH_STYLE);
}

add(
  'Interface',
  'ui/title.png',
  'Title image',
  'A wide title illustration for the game "Rustbelt Galaxy": a rusty patched starship in the foreground above a worn industrial colony planet, a distant star, a purple nebula, tiny pirate ships far away. No text and no logo.',
  STYLE.replace('cartoon illustration for a game', 'cartoon title illustration for a game').replace(BACKGROUND, 'Full scene with a dark space background that fills the whole image. Wide image, 3:2.'),
);

add(
  'Interface',
  'ui/icon.png',
  'App icon',
  'A square app icon for the game "Rustbelt Galaxy", for a phone home screen: one rusty, patched starship seen from the side, with one glowing cyan engine, and nothing else. The ship is big and fills most of the frame, drawn with five or six large shapes and a thick dark outline, so that it reads at 60 pixels. No planet, no stars, no small details, no text. A plain dark blue-black background that fills the frame, no transparency.',
  STYLE.replace('cartoon illustration for a game', 'cartoon app icon for a game').replace(BACKGROUND, 'Full frame, no transparency. Square image.'),
);

// Interface widgets: the close and back buttons that every screen and sheet shares.
const WIDGET_STYLE = STYLE.replace('cartoon illustration for a game', 'cartoon user interface button for a game');
const WIDGET_VISUAL: Record<string, [string, string]> = {
  close: ['Close button', 'a square riveted steel button plate with a bold white X painted on it, the paint a little worn'],
  back: ['Back button', 'a square riveted steel button plate with a bold white arrow that points left painted on it, the paint a little worn'],
};
for (const [id, [name, visual]] of Object.entries(WIDGET_VISUAL)) {
  add('Widgets', `widgets/${id}.png`, name, `A user interface button: ${visual}. One single square plate and nothing else, with a thick dark outline, big simple shapes and no small details, so that it reads clearly at 32 pixels. The plate fills the frame.`, WIDGET_STYLE);
}

for (const e of entries) if (e.prompt.includes('undefined')) throw new Error(`no visual text for ${e.file}`);
writeFileSync('art/prompts.json', JSON.stringify({ references: REFERENCES, output: 'art/originals/hd', entries }, null, 2) + '\n');

let md = `# Art prompts\n\nThe game draws placeholder art in code. An image file in \`public/assets/hd\` replaces a placeholder. All images have one style.\n\n`;
md += `- Total images: ${entries.length}\n- Style references: ${REFERENCES.map((r) => `\`${r}\``).join(', ')}\n- Format: PNG with a transparent background. Backdrops and the title image are full scenes.\n`;
md += `- The generator writes each image at full size to \`art/originals/hd\`. \`scripts/art-resize.py\` writes the game sizes to \`public/assets/hd\`.\n\n`;
md += `## How to generate\n\n\`\`\`\nnpm run art:prompts                                   # writes art/prompts.json and this file\nnode scripts/generate-art.mjs --dry-run               # shows what the script will do\nnode scripts/generate-art.mjs --only units/ --force   # generates all units again\nnode scripts/generate-art.mjs                         # all missing images\npython3 scripts/art-resize.py                         # game sizes and the manifest\n\`\`\`\n\n`;
md += `The script calls \`codex exec\` one time for each image, with the reference images attached.\n\n`;
md += `## Style text\n\nEach prompt starts with this text:\n\n> ${STYLE}\n\nA unit prompt adds this text:\n\n> ${UNIT_STYLE.slice(STYLE.length + 1)}\n\nBackdrops and the title image use a variant for a full scene.\n`;
let group = '';
for (const e of entries) {
  if (e.group !== group) {
    group = e.group;
    md += `\n## ${group}\n\n| File | Name | Subject |\n| --- | --- | --- |\n`;
  }
  md += `| \`${e.file}\` | ${e.name} | ${e.prompt.split('Subject: ')[1].replace(/\|/g, '/').replace(/\n/g, ' ')} |\n`;
}
writeFileSync('docs/ART_PROMPTS.md', md);
console.log(`${entries.length} prompts written to art/prompts.json and docs/ART_PROMPTS.md`);

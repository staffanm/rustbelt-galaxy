// Lore for units, buildings, projects, space biomes, planet types and resources. The Encyclopedia shows it.

export const UNIT_LORE: Record<string, string> = {
  scout:
    'The scout is the cheapest thing that can be sent somewhere dangerous and asked to report. It has one pilot, who signed up for the view, and one camera, which is worth more than the pilot in the eyes of the accounts department. Most first contacts, most anomaly finds and most pirate incidents begin with a scout and end without it.',
  corvette:
    'The corvette is the smallest ship that carries guns on purpose. It patrols borders, chases pirates who are slower than it, and runs from everyone else. Every admiral in the galaxy started on a corvette and every one of them says the bunk was the worst part.',
  colony_ship:
    'A colony ship is a warehouse with a dream attached. Ten thousand colonists sleep in the hold under a brochure that shows the destination in summer, and the crew stays awake for the whole trip so that someone can be blamed on arrival.',
  constructor:
    'The constructor is the unit that turns a rock into an income. Its crew is paid by the rivet, sleeps in the crane cab, and has strong opinions about which asteroids are honest. Nobody thanks them. Everybody needs them.',
  frigate:
    'The frigate is the workhorse of every fleet: big enough to fight, small enough to lose. Its one heavy turret settles most border arguments and its plumbing settles most crew arguments, usually against the crew.',
  missile_barge:
    'Somebody looked at a cargo barge, removed the cargo, filled the space with missiles, and called it a warship. The design has never been improved because the missiles do not care what carries them. The crews prefer to stay at range, and the design agrees.',
  troop_transport:
    'A transport is a metal box with soldiers in it and a ramp at the front. It cannot fight in space, and it knows it, which is why it travels with friends. The soldiers inside are the reason a planet changes hands, and the reason the ramp is armoured.',
  cruiser:
    'The cruiser is the ship that admirals draw when asked to draw a ship: long, fast, three turrets, engines that glow. It burns Helium-3 at a rate that makes refinery owners cheerful and treasury clerks quiet.',
  carrier:
    'A carrier is a flight deck with a ship wrapped round it. The strike craft do the fighting and get the songs. The carrier does the waiting and gets the repair bills. Both sides of this arrangement consider it unfair.',
  assault_lander:
    'The assault lander drops armoured troops through a shield bubble, in pods, at a speed that the manual calls firm. Every soldier who has ridden one describes the landing the same way, and the description is not printed.',
  battleship:
    'A battleship is a wall of Neutronium that has been persuaded to move. It is slow, it is expensive, and nothing smaller than it can argue with it. Battleship captains are promoted for surviving, because nothing else about the job is difficult.',
  dreadnought:
    'The dreadnought is the last word in most conversations. Its central cannon runs on antimatter and its presence runs on rumour. One dreadnought in orbit has ended sieges that ten frigates could not start, and the crews know it, and it shows.',
  tug_militia:
    'When the Union needed warships and had harbour tugs, it welded guns to the tugs. The bumpers are old tyres, the crews bring their own lunch, and the ships have a talent for arriving alongside an enemy that expected something more dignified.',
  hauler:
    'The Colony Hauler is an ore hauler with the ore taken out and colonists put in. It is faster than a colony ship, and it smells of ore for the first three generations of the colony.',
  patchwork_cruiser:
    'A Patchwork Cruiser is three ships that gave up separately and became one ship together. No two hull plates match and no two systems agree, but it needs no Helium-3, because it runs on whatever was in the tanks of the ships it was made from.',
  ramship:
    'The Krogg looked at a frigate and asked why the ship should not be the weapon. The Ramship answers: a spiked steel prow, a short thick hull, and a crew that sings during the approach. Enemy captains who see one coming are advised to have already left.',
  shock_troops:
    'Krogg Shock Troops jump before the ship has landed, on the grounds that landing is a waste of time. Their drop ships are covered in spikes and trophies, and their casualty rate is a statistic that the Dominion publishes with pride.',
  siege_hulk:
    'The Siege Hulk is the ugliest ship in any fleet and the last thing many defence grids see. It carries one gigantic mortar, a great deal of riveted armour, and chains whose purpose is not explained to visitors.',
  probe_swarm:
    'A Probe Swarm is ten small machines that share one field of view and no crew at all. The Collegium likes it because it sees farther than any pilot and never files a complaint. Other species find the swarm unsettling, especially when it stops to look at them.',
  lance_cruiser:
    'The Lance Cruiser is a cruiser built round a single beam weapon longer than the ship. It fires from two hexes away, and the Ilthari consider this the correct distance for any conversation with a warship.',
  prism_dreadnought:
    'The Prism Dreadnought splits one beam into many and delivers each with a citation. It is the largest instrument the Collegium has ever built, and the only one that has been asked to stop.',
  privateer:
    'A Privateer is a raider with a licence. The Combine issues the licence, takes a share of the kills, and insures the ship against everything except its own crew. The painted shark mouth is optional and universal.',
  prospector:
    'The Prospector is a constructor with a profit share. Its crew moves faster and builds faster because every station they finish pays a dividend, and they have learned to count in stations.',
  mercenary_cruiser:
    'A Mercenary Cruiser carries its own fuel, its own guns and its own lawyer. It needs no Helium-3 and no loyalty, only a contract, and the contract has a clause for everything, including the weather.',
  envoy_cutter:
    'The Envoy Cutter is a scout with a diplomat on board and a very good kitchen. First contact with a Seren cutter is a dinner, and the guests leave with a treaty and no clear memory of signing it.',
  peacekeeper:
    'A Peacekeeper is a frigate that stands at the door of the Concord. Inside Seren borders it is the larger problem in any fight. Outside them it is polite, and heavily insured.',
  aegis_cruiser:
    'The Aegis Cruiser flies with three shield panels floating round it like courtiers. The shield is the main weapon, the Seren say, and enemy gunners have found no argument against this that survives contact.',
  plodd_grabber:
    'The Grabber is a corvette with claws. The claws were added to hold things that the Plodd found, and it turned out that the things included other ships. A kill pays, because the Plodd bring the pieces home.',
  plodd_boarding_barge:
    'The Boarding Barge lands troops with crowbars and leaves with the furniture. It is cheaper than a transport, stronger than a transport, and its crews have never understood why other species take only the planet.',
  plodd_big_ship:
    'It is big. It goes. The Plodd found the plating on a wreck they do not remember and bolted it to a hull they do not understand, and the result needs no Neutronium and fears no frigate. The sign on the side is misspelled and the Plodd are proud of it.',
  vessani_mimic:
    'A Mimic Probe looks like whatever it flew past last. Customs officers wave it through, patrols salute it, and it sees four hexes in every direction while looking like a cargo pod. The Drift has never explained how, and nobody has caught one to ask.',
  vessani_cell:
    'An Infiltrator Cell is already inside when it lands. The troops are Vessani who have spent a season being the planet: its clerks, its guards, its water. On the day of the invasion the water stands up.',
  vessani_phase_cruiser:
    'The Phase Cruiser is a slightly different shape every time it is seen, which makes it hard to hit and hard to describe. It moves faster than any cruiser and defends better, because a hull that is partly not there is hard to hole.',
  sarn_seeker:
    'The Seeker is an old survey craft with sensors that predate most of the galaxy. It moves fast because the Sarn built the roads it flies on, and it sees five hexes because it remembers what is there.',
  sarn_warden:
    'A Warden is a frigate the size of a cathedral, with a calm blue eye on the prow and a crew that has never lost a discussion. It defends better than it attacks, because the Sarn prefer to be approached.',
  sarn_planet_lance:
    'The Planet Lance is the last argument of the Sarn. It is older than most of the planets it fires at, and its single beam is the reason the Sarn are rarely asked to repeat themselves.',
  nullset_sensor_drone:
    'A Sensor Drone is one red eye with an engine. It is cheap, it sees far, and nobody mourns it, including the Assembly, which has already printed the next one.',
  nullset_assembler:
    'The Assembler builds stations and is, in a sense, one. It has six arms, no windows, and no need to sleep, which is why the Assembly finishes its stations a shift early and never mentions it.',
  nullset_annihilator:
    'The Annihilator Frame is a battleship with no crew quarters, no galley and no mercy subroutine. The Assembly removed everything that a battleship does not need to fight, and then removed the paint.',
  manyfold_chorus_pod:
    'A Chorus Pod carries twice the colonists of an ordinary colony ship, because they do not need separate cabins or separate opinions. The colony starts with two population and one plan.',
  manyfold_tide:
    'The Tide is many small landing pods flying as one unit. The troops inside are not good soldiers. There are simply a great many of them, and they all arrive at once, and they all agree about the objective.',
  manyfold_unison_carrier:
    'On a Unison Carrier the pilots share one mind, so nobody breaks formation and nobody needs a briefing. The strike craft fly like a single flock, and the enemy learns that a flock is very hard to dodge.',
  ashari_pilgrim_ark:
    'The Pilgrim Ark is a colony ship with a chapel and a few guns. The hymns begin before landing, the candles are lit on approach, and the colony is consecrated before the first house is built.',
  ashari_templar:
    'A Vigil Frigate carries a shrine in its hold and a priest on its bridge. Inside Ashari borders, beneath the candles, it fights with the calm of a crew that believes it is defending a temple, because it is.',
  ashari_cathedral_ship:
    'The Cathedral Ship is a carrier built round a cathedral. The choir is also the gunnery crew, and the strike craft launch between two towers under stained glass. It defends well, because it is a church and the Ashari do not lose churches.',
  halcyon_welcome_wagon:
    'The Welcome Wagon is a scout with a bar. First contact with the Hosts is a drink, and the drink is free, and the second one is not. Its crews have never met a stranger and never let one leave sober.',
  halcyon_pleasure_barge:
    'The Pleasure Barge is a cruise liner with colonists who are already on holiday. The new colony starts with a Cantina because the barge would not leave without one.',
  halcyon_bouncer:
    'The Bouncer is a frigate that stands at the door. It has a velvet rope emblem, one large calm searchlight, and a defensive record that suggests very few ships have got past it without being on the list.',
  raider:
    'A raider is a stolen ship with a new flag and the registration scratched off. Its crew are deserters, debtors and enthusiasts, and its den is somewhere nobody has looked. It attacks anyone, which is the only fair thing about it.',
  marauder:
    'A marauder is a raider that succeeded. It has a larger hull, stolen turrets of several sizes, and a business plan that involves your trade routes.',
  leviathan:
    'The Void Leviathan came out of a rift and did not go back. It is the size of a moon, it eats ships, and it is not angry, only hungry. Scholars class it as an animal. Crews class it as weather.',
  hollow_whisper:
    'A Whisper is a shape that leaves a Void Rift and takes stations apart with great care and no visible tools. It can be at one rift and then at another with nothing in between. When it is destroyed, the wreck is not there.',
  hollow_choir:
    'A Choir is several Whispers that decided to be one thing. It sings on frequencies that sensors refuse to record and fires on ships that come close. Nobody knows what it wants. Most scholars hope it does not want anything.',
};

export const BUILDING_LORE: Record<string, string> = {
  cantina:
    'The first building on any colony is the one that sells drinks, and it is usually up before the roof of the second. A cantina has music, one fight per evening, and a barkeeper who knows more about the colony than the governor.',
  foundry:
    'A foundry melts rocks into parts and parts into ships. The chimney can be seen from orbit, which the colonists consider an advertisement and the neighbours consider a warning.',
  hydroponics_bay:
    'Grey lettuce in tanks under purple light. Nobody likes it, everybody eats it, and every colony that has one stops sending letters home about food.',
  lab:
    'A research lab is a building where things bubble on purpose. The safety goggles are required and ignored, and the results are published in a journal that the colonists do not read but are proud of.',
  trade_hub:
    'The trade hub is where cargo stops being freight and starts being money. Crates from every species pass through it, and so does at least one customs officer who has stopped asking questions.',
  broadcast_tower:
    'A broadcast tower tells the galaxy about the colony, with the bad parts removed. It is very tall, blinks at night, and carries the only news that other factions hear about you, which is why it says nice things.',
  shipyard:
    'A shipyard is a gantry with a ship inside it, forever. The welders work in shifts, the sparks never stop, and the launch ceremony is short because the next hull is already waiting.',
  habitat_dome:
    'A habitat dome is a promise that the sky will stay where it is. Under the glass there are houses, trees and a weather that is always the same, and the colonists have stopped looking up.',
  defence_grid:
    'The defence grid is a bunker with a very large gun on top pointing straight up, because straight up is where the trouble comes from. It cannot win a war, but it makes a siege long, loud and expensive.',
  barracks:
    'A barracks is a long block with hard beds, a parade ground and a flagpole. The beds are hard by design, so that the garrison prefers to stand outside and look dangerous.',
  exchange:
    'The stock exchange has columns, a pediment and a ticker board, because money likes to be housed like a temple. Shouting is the main technology, and the building is designed to carry it.',
  institute:
    'A research institute has a clock tower, ivy, a bell and a very large lecture hall. Students arrive to learn, stay to argue, and leave with a degree and a grudge against the bell.',
  holo_arena:
    'The holo-arena is a stadium where gladiators made of light fight for a crowd made of people. The gladiators are not real. The bets are. Morale goes up, and so does the noise.',
  shield_generator:
    'A shield generator throws a blue bubble over the colony and a large bill over the treasury. The lights dim every time it takes a hit, and the colonists have learned to count the dims.',
  megacorp_hq:
    'A megacorp office is a black glass tower with a golden logo and a helipad. It employs half the colony, owns the other half, and sends a limousine to the governor once a year.',
  observatory:
    'The observatory sits on a hill with its dome open and its telescope pointed at the past, because light is slow. The astronomers are quiet people and the colony leaves them alone, mostly.',
  orbital_ring:
    'The orbital ring is an elevator to a ring of habitats high above the colony. The floor is a long way down, the view is excellent, and the rent is calculated by altitude.',
  embassy_complex:
    'An embassy complex is a villa with many flags, a garden, a fountain and a cook who is better than the diplomats. Every embassy has a good cook and a bad listener, and the cook does the real work.',
  arbitration_court:
    'The arbitration court has a dome, wide steps and a statue holding scales. Disputes go in, rulings come out, and the rulings are accepted because the steps are too many to climb twice.',
  antimatter_reactor:
    'An antimatter reactor is a dome with magenta rings and a fence with signs. It powers the whole colony and would, in a bad week, remove it. The engineers work in silence and go home early.',
  scrapyard:
    'A Union scrapyard is a mountain of orange ship parts with a magnet crane on top. Nothing is thrown away and nothing is quite new, and the foundry next door has learned not to ask where the metal came from.',
  war_pits:
    'The War Pits are a hole in the ground with spiked walls where Krogg train, fight, and are entertained, in one afternoon. The garrison is strong, the morale is high, and the ships get built faster because the crews want to leave.',
  data_vault:
    'A Data Vault stores every fact the Ilthari have ever recorded in floating crystal shards. Finding one again is a separate project, with its own grant.',
  bazaar_ring:
    'The Bazaar Ring is a circle of market stalls under a golden roof where prices are never final. Two trade routes begin here, because one was never going to be enough.',
  embassy_spire:
    'The Seren Embassy Spire is slender, violet and lit softly at night. Visitors are welcome, the balconies are lovely, and every word said on them is recorded.',
  plodd_take_apart_shed:
    'The Take-Apart Shed is where the Plodd learn. Things go in whole, come out in pieces, and the pieces are labelled with question marks. Understanding follows, mostly, and production follows understanding.',
  vessani_nest:
    'The Infiltration Nest has no door, because the Vessani do not use doors. The garrison lives in the walls, and nobody knows where the building is, including the staff.',
  sarn_vault_of_ages:
    'The Vault of Ages holds what the Sarn wrote down and stopped talking about. The doors are stone, the beacon is pale, and reading the archive is the slow part.',
  nullset_fabrication_vat:
    'The Assembly does not farm. It prints. The Fabrication Vat turns raw matter into food and parts with the same arms, and the arms do not care which.',
  manyfold_communion_hall:
    'The Communion Hall is a round room where everyone agrees, loudly. It replaces the cantina because the Manyfold do not need a drink to feel together, and the food is shared before it is served.',
  ashari_shrine:
    'The Shrine of the Nine has nine tall candle towers and one long sermon. Attendance is high, morale follows, and the pilgrims leave a little influence at the steps.',
  halcyon_resort:
    'The Grand Resort has a pool, palm-like plants, string lights and an umbrella bar. Towels are on the bed and the volcano is mostly decorative. Guests arrive as delegates and leave as friends.',
};

export const PROJECT_LORE: Record<string, string> = {
  forum_station:
    'The Forum Station is a debating chamber in orbit with one very long table and a flag for every species that will sit at it. It settles nothing, delays everything, and is the only place where the galaxy talks before it shoots.',
  exodus_gate:
    'The Exodus Gate is a door to another galaxy, with better neighbours and a clean start. Building it takes every scientist and every factory the empire has. Walking through it takes one step, and nobody who has taken it has written back.',
  terraform:
    'Terraforming is the art of changing a world to suit its owner: an atmosphere plant the size of a city, a century of patience compressed into a project queue, and trees planted by people who will sit under them after all.',
};

export const TERRAIN_LORE: Record<string, string> = {
  space:
    'Open space is mostly nothing, and the little that exists in it pays a toll. Shipping lanes cross it, solar arrays harvest it, and every captain knows that the empty hexes are where the fuel goes.',
  asteroids:
    'An asteroid field is rocks with metal in them and no traffic rules. Ships hide in it, miners drill it, and paintwork does not survive it. Every belt has a story about a ship that went in and came out as ore.',
  nebula:
    'A nebula is glowing gas that scientists love and navigators file complaints about. It hides ships from anyone more than one hex away, slows everything down, and gives the sensor buoys inside it a great deal to record.',
  ice: 'An ice field is frozen water and comet dust, which becomes lunch after treatment. Harvesters chew through it, colonies drink it, and the Void Coffee that grows in the cold parts is the reason crews volunteer for the run.',
  debris:
    'A debris field is the remains of an older and more confident civilization. Salvage docks pick through it for parts and knowledge, and now and then a piece turns out to be older than it should be.',
  moon: 'A moon is a small grey rock with a good view of a better rock. Moon bases grow food and parts in equal measure, and every colony with a moon has a saying about it that the moon colonists do not find funny.',
  star: 'A star is large, hot and not open to visitors. Its energy sells well from a distance, and the Sarn, who tend stars like fields, sell it better than anyone.',
  rift: 'A Void Rift is space with the bottom fallen out. Ships without a Hyperdrive do not come back from it, ships with one come back with odd logs, and something that needs no drive at all lives in it.',
};

export const PLANET_LORE: Record<string, string> = {
  terran:
    'A terran world has air, water and soil, and the previous tenants left it in fair condition. Everyone can colonize it and everyone wants to, which is why terran worlds are where wars begin.',
  ocean:
    'An ocean world is water from pole to pole with a few islands for the optimists. The fishing is good, the basements are not, and the colonists learn to build up rather than out.',
  desert:
    'A desert world is sand, ore and sunburn. It needs a dome before it needs a town, and once it has both it produces more than it eats, which is the only kind of world a foundry owner respects.',
  ice: 'An ice world is cold enough to preserve samples and colonists equally well. Science comes easily there, because there is little else to do, and the observatories have the clearest skies in the galaxy.',
  volcanic:
    'A volcanic world has ground rich in metals and occasionally airborne. Sealed habitats hum through the night, the factories never cool, and the colonists measure time in eruptions.',
  barren:
    'A barren world has no air, no water and no complaints from the neighbours. It is colonized for what lies under the craters and for the silence, in that order.',
  gas: 'A gas giant has no surface, so the colonists float. Their platforms sell fuel, their ceremonies honour dropped wrenches, and their children think that the floor is a myth.',
};

export const RESOURCE_LORE: Record<string, string> = {
  helium3:
    'Helium-3 burns clean, hot and expensive. It is refined from nebula gas, comet ice and lunar dust, and every cruiser reactor in the galaxy wants it. The voice effect is well known and not the main use.',
  neutronium:
    'Neutronium is what a star leaves behind when it has finished with everything else. Plated onto a hull it stops almost anything, and dropped onto a foot it stops the foot. Battleships need it and shipyards insure it.',
  antimatter:
    'Antimatter is power for dreadnoughts and gates, kept in traps that hum. The storage instructions are one word long and the word is carefully. Nobody who has handled it complains about the pay.',
  void_coffee:
    'Void Coffee grows in low gravity on cold worlds, and crews refuse to fly without it. A colony with a supply has better morale and worse sleep, and both are considered an improvement.',
  singing_crystals:
    'Singing Crystals hum one note for ever. Collectors pay well for a second note, which has never been found, and the search keeps three academies and one cult in business.',
  vintage_scrap:
    'Vintage Scrap is antique machine parts from the debris fields, and rust is part of the value. Collectors mount it on walls, engineers mount it in ships, and both groups deny knowing the other.',
  spice_gas:
    'Spice Gas is a nebula extract that makes ration bars taste of something. Which something is debated. Colonies with a supply eat better, argue more, and would not give it up for anything.',
};

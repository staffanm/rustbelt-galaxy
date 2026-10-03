// Two or three sentences of history for each technology. The Encyclopedia and the research screen show them.
export const TECH_LORE: Record<string, string> = {
  // Era 1
  orbital_mining:
    'The first asteroid miners were debt collectors who followed a defaulting freighter into the belt and found the rocks worth more than the ship. The drills came later, the safety rules later still, and the union after the third accident report. Every spacefaring species has a version of this story, and in every version the rock wins the first round.',
  hydroponics:
    'Nobody chose to eat tank lettuce. It was that or the ration bars, and the ration bars had been in the hold since before the war that nobody remembers. Hydroponics turned a hull full of dirty water into a hull full of grey vegetables, and a starving colony into a merely unhappy one.',
  signal_analysis:
    'Deep space is loud. Pulsars, old beacons, stellar weather, and something in the low band that the analysts agree not to discuss. Signal Analysis is the art of taking all of it out until what is left can be sold, mapped or complained about.',
  kinetic_weapons:
    'A rock thrown hard enough is a treaty. The first orbital cannons were mining drivers pointed the wrong way, and the first admirals were foremen who noticed. Nothing more advanced has ever replaced them, because nothing more advanced is cheaper.',
  trade_protocols:
    'Before the protocols, a cargo manifest was a suggestion and customs was a fight. The first standard form had eleven boxes and a signature line, and it ended more wars than any fleet. The current form has four hundred boxes and is still shorter than the fights.',
  xeno_linguistics:
    'First contact went well until both sides tried to say hello. The linguists earned their keep by noticing that the aliens were not threatening to eat anyone, they were asking about parking. Every diplomatic corps in the galaxy keeps that transcript in a frame.',

  // Era 2
  warp_drive:
    'The Jump Drive got a ship from here to there. The Warp Drive got it there before the crew ran out of coffee. The physics involve folding a small part of space, and the engineers involve a great deal of shouting about the small part.',
  environmental_domes:
    'A dome is a promise that the sky will stay where it is. The early ones cracked in the first sandstorm, which taught the colonists a great deal about glass and a little about promises. Modern domes are rated for a century, and the colonists have stopped looking up.',
  helium_refining:
    'Helium-3 burns clean, hot and expensive. Refining it from nebula gas and comet ice turned a chemistry problem into a supply chain, and the supply chain into three wars and one very large company. The voice effect remains the best known feature and the least useful.',
  missile_systems:
    'The missile was the first weapon to travel farther than the argument. It let a crew fight from two hexes away and pretend that this was a strategy rather than a preference. Rack space is measured in missiles and morale is measured in how many come back.',
  planetary_defence:
    'The largest guns ever built point straight up, because straight up is where the trouble comes from. A Defence Grid cannot win a war, but it can make a siege long, loud and unprofitable, which is the same thing on a short enough timescale.',
  ground_forces:
    'A fleet can break a planet. Only soldiers can hold it. Ground Forces is the doctrine of putting people in a metal box, dropping the box from orbit, and opening it near the enemy. The safety briefing is one sentence and most of it is a swear word.',
  banking:
    'Money was already faster than light. Banking made it legal. An interstellar bank holds nothing, moves everything and charges for both, and the galaxy has yet to find a working alternative that does not involve carrying the gold personally.',
  computing:
    'The first deep computer was asked what the crew should have for dinner and returned a two hundred page analysis of the question. It has been improving ever since, mostly by learning to answer shorter. Nobody has asked it about dinner again.',
  entertainment:
    'Forty thousand channels, most of them showing other channels. Mass Entertainment is the discovery that a bored colony riots and an entertained colony merely complains, and that complaints are cheaper. The gladiators are light. The ratings are not.',

  // Era 3
  hyperdrive:
    'The Hyperdrive does not fold space. It goes underneath it, through the rifts, which is where the Sarn stopped explaining and the test pilots stopped volunteering. It works, the ships come back, and the logs from inside the rift are filed unread.',
  sealed_habitats:
    'A Sealed Habitat is a dome without the optimism. No window, no sky, no pretending. Colonists on a volcanic world learn to like the hum of the air plant the way farmers once liked rain, because both sounds mean they will live through the night.',
  heavy_armour:
    'Neutronium is what a star leaves behind when it has finished with everything else. Plating a hull in it makes the ship slow, expensive and almost impossible to stop, and the admirals decided that two out of three were acceptable.',
  carrier_ops:
    'A carrier is a hangar that flies. The strike craft do the fighting, the carrier does the waiting, and the pilots write songs about it that the carrier crews find unfair. The doctrine was copied from the wet navies of six different homeworlds, none of which will admit it.',
  shielding:
    'An energy shield is a wall made of electricity bill. It stops the first shot completely and the tenth barely, and the reactor crews can tell you the exact moment when the lights dim. Defence engineers call it a force field. Accountants call it a decision.',
  interstellar_forum:
    'The Forum began as a treaty about parking, expanded to a treaty about treaties, and became a station where every species keeps an ambassador and a grievance. It has never solved a war, but it has delayed several, and delay is the only thing the galaxy agrees on.',
  megacorps:
    'When a company grows larger than a planet, the law has two choices: regulate it or incorporate the planet. The galaxy chose the second. A megacorporation has a flag, a fleet, a legal department the size of a moon, and a customer service line that no one has reached.',
  quantum_physics:
    'At small enough scales the universe stops behaving and starts negotiating. Quantum Physics is the study of what it will accept. Antimatter was the first prize, a cleaner drive the second, and a long list of questions about the cat the third.',
  orbital_habitats:
    'A gas giant has no surface, so the colonists built one. Orbital Habitats float on the upper clouds, sell the fuel beneath them, and hold a yearly ceremony for whoever drops a wrench. The wrench is never recovered. The ceremony is well attended.',

  // Era 4
  fold_drive:
    'The Fold Drive takes two points in space, puts them together, and lets the ship step across. Where the crease goes is a question that ends careers. The drive works, the crease is somewhere, and the galaxy has decided to travel first and worry later.',
  antimatter_weapons:
    'Matter meets antimatter and both leave. The warhead is small, the effect is not, and the neighbourhood is a memory. Antimatter Weapons ended the age of large fleets by making one ship enough, and began the age of very careful storage.',
  terraforming:
    'To change a world takes an atmosphere plant the size of a city, a century of patience, and a species willing to plant trees it will never sit under. With modern tools it takes a project queue and a few dozen turns. The trees are still a nice touch.',
  galactic_law:
    'Galactic Law did not stop bribery. It gave bribery a form, a fee and a receipt, and called the result lobbying. The Forum has been more orderly since, and the lobbyists have never been busier.',
  gate_theory:
    'Gate Theory says that the galaxy is one room and that there are other rooms. The Exodus Gate is the door. Whoever opens it gets a new galaxy with new neighbours, and the old neighbours get a note on the fridge.',

  // Terran Salvage Union
  jury_rigging:
    'Union crews say that a ship is never broken, only between repairs. Jury-Rigging is the formal name for tape, wire, and an unreasonable confidence in both. It is taught in the yards by people who are missing exactly one finger each.',
  union_contracts:
    'The Union Contract is a document of nine hundred pages that boils down to one sentence: the work gets done and the workers get home. Overtime is paid. Breaks are taken. Production goes up, because nobody sabotages a machine they are paid to love.',
  salvage_rights:
    'In Union law, a wreck belongs to whoever gets there with a cutting torch. Salvage Rights made this galactic policy and made every battle a business opportunity. Union crews now arrive at fights they were not invited to, with paperwork.',

  // Krogg Dominion
  blood_oaths:
    'A Krogg swears an oath by cutting a palm and shaking hands with the nearest superior, who does the same. The oath is short. The ceremony, with a whole crew, takes all night. The next day the ship fights as one animal, which is the point.',
  boarding_doctrine:
    'The Krogg do not like to destroy an enemy ship. They like to walk through it. Boarding Doctrine is the science of the airlock, the axe and the shout, and it pays well, because a ship that surrenders is a ship that can be sold.',
  total_war:
    'Total War is the moment when the Dominion stops distinguishing between the shipyard and the home. Every Krogg works, every work is war, and the upkeep of the fleet becomes a matter of pride rather than credits. Peace treaties signed under Total War are known to be brief.',

  // Ilthari Collegium
  anomaly_studies:
    'An anomaly is a question that the universe left lying around. The Collegium collects them, catalogues them and publishes the results in a journal that other species describe as very heavy. Nebulae get a special section, because they glow and hide things.',
  recursive_modelling:
    'The Ilthari built a model of the galaxy so detailed that it contained a model of the Ilthari, building a model. Both models run late. The technique doubles the speed of research and triples the length of meetings.',
  predictive_targeting:
    'Predictive Targeting fires the shot at where the target will be, based on where it was, what it wants, and a very long paper about hesitation. Enemy pilots report that the beam arrives before they decide. The paper is under review.',

  // Ozmok Combine
  futures_market:
    'The Combine discovered that tomorrow can be sold today, at a discount, to someone who expects it to be worth more. The Futures Market is the result: a trade route pays before the freighter leaves, and sometimes before the freighter exists.',
  hostile_takeover:
    'Why conquer a planet when you can buy the company that owns the dock? Hostile Takeover is the Ozmok art of purchasing everything except the flag, and the flag usually comes free with the office furniture.',
  mercenary_charter:
    'The Mercenary Charter is a contract of twelve pages that turns loyalty into a line item. Crews under charter fight harder, cost less, and read the termination clause every morning. The Combine considers this healthy.',

  // Seren Concord
  cultural_exchange:
    'The Concord sends students, musicians and cooks along every trade route it opens. The students learn the language, the musicians learn the songs, and the cooks learn what is in the soup. None of them come home, and the route becomes an embassy.',
  soft_power:
    'Soft Power is the Seren discovery that a gift, a dinner and a well timed silence can move a vote farther than a fleet. The lobbying bill goes down because the lobbyists are invited to stay for the weekend.',
  mutual_defence:
    'The Concord could not build a wall around every world, so it built a promise. Mutual Defence means that an attack on a Seren planet is answered by every Seren planet, and the planets are built to survive long enough for the answer to arrive.',

  // Plodd Collective
  finders_keepers:
    'Plodd law has one rule and this is it. A wreck is a gift, an anomaly is a present, and a ship left unattended is an invitation. The Plodd take the rule seriously and take everything else as well.',
  make_it_go:
    'The Plodd do not fix engines. They hit the engine, and then they hit the panel next to the engine, and then it goes. Make It Go is this method written down, and it works often enough that Plodd ships are cheap to build and slow to die.',
  borrowed_blueprints:
    'When the Plodd take a planet they also take the library, the workshop and the person who knows how the workshop works. Borrowed Blueprints is the result: the Collective learns what the planet knew, badly, and then builds it, well enough.',

  // Vessani Drift
  fluid_form:
    'A Vessani soldier does not wear armour. It is armour, briefly, and then it is a door, and then it is behind you. Fluid Form is the discipline of holding a shape under fire, and of choosing a better one when the first is full of holes.',
  deep_cover:
    'Every large government in the galaxy has at least one Vessani in a senior post. Most governments know this and have decided not to look, because the Vessani are good at the job. Deep Cover makes the arrangement official on the Vessani side only.',
  great_link:
    'On the last day of the season every Vessani returns to the Pool and pours itself in. What one has seen, all have seen. Grudges dissolve, secrets spread, and the Drift emerges the next morning with one opinion about everything, which is influence of a very direct kind.',

  // Sarn Elders
  old_roads:
    'Before the rifts and the drives, the Sarn built roads between the stars: beacons, charts and rest stops that still work. Old Roads is a set of keys to that network. Sarn ships see farther and mend faster because the road is looking after them.',
  silent_archives:
    'The Sarn wrote everything down and then stopped talking about it. The Silent Archives hold the answers to most questions the younger species are asking, filed under headings nobody else can read. Anomalies are, more often than not, misplaced volumes.',
  stellar_husbandry:
    'The Sarn treat a star the way a farmer treats a field: something to tend, harvest and hand on. Stellar Husbandry draws power and knowledge from the star itself and leaves room round it for more people. The star does not object. Nobody has asked it.',

  // Nullset Assembly
  self_repair:
    'A machine that cannot repair itself is a machine with a deadline. The Assembly removed the deadline. Every unit carries spares for itself and the schedule to use them, and a damaged planet is a work order with a priority.',
  distributed_cognition:
    'No Nullset unit thinks. All Nullset units think, together, and each one holds a small part of the opinion. Distributed Cognition makes every drone a sensor and every sensor a scientist, which is why the Assembly sees so far and argues so little.',
  mass_fabrication:
    'The factory built a factory, which built two. Mass Fabrication is the point where the Assembly stops counting ships and starts counting production lines, and a building is what the line makes when it has a spare afternoon.',

  // The Manyfold
  shared_mind:
    'The Manyfold do not talk. They already know. Shared Mind is the technique of extending the joining to a new colony, so that the tenth settler arrives already at home and the crops are planted by consensus before the ship has landed.',
  one_voice:
    'A trade negotiation with the Manyfold takes one second, because the Manyfold have already decided and say so. One Voice turns this into influence: partners find it restful, and restful partners stay.',
  total_consensus:
    'Total Consensus is what happens when the Manyfold apply their single mind to the Forum. Every member speaks, every member agrees, and the lobbying budget is spent on very good lunches. Other delegates come away feeling agreed with, and vote accordingly.',

  // Ashari Covenant
  litany_of_stars:
    'The Litany names every star the Ashari can see and thanks it, in order. It takes a full day, and attendance is high, because the Ashari like to know where they stand and the stars have not moved. Morale follows the liturgy.',
  blessed_hulls:
    'Before an Ashari ship leaves the yard, a priest walks its corridors with one of the Nine Candles and names every compartment. The crew then knows that the ship is a small temple, and the Ashari do not lose temples. Engineers have found no measurable effect on the hull. The gunnery scores disagree.',
  prophecy:
    'The Ninth Candle said that a light would come from the dark and that the faithful should be ready. The prophecy was vague enough to be right and specific enough to build a sensor programme around. It has been correct so far, which the priests find satisfying and the sensor crews find alarming.',

  // Halcyon Hosts
  hospitality:
    'The first rule of Halcyon Prime is that a guest is never charged for the welcome. The second rule is that everything after the welcome is a service. Hospitality turns visiting fleets into paying visitors, and paying visitors into friends, in that order.',
  festival_season:
    'On Halcyon Prime the season begins in spring and ends when the last guest leaves, which has not yet happened. Festival Season exports this arrangement: every trade route arrives with a band, and every band leaves with a treaty.',
  galactic_getaway:
    'The Forum met once on Halcyon Prime, for a week, and the delegates asked to extend. Galactic Getaway is the Hosts\' quiet policy of holding every important conversation next to a pool, where votes are cheaper and nobody wants to be the one who leaves early.',
};

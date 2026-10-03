# Rustbelt Galaxy: design

## Decisions

These decisions come from the questions at the start of the project.

| Subject         | Decision                                                                                                                               |
|-----------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Map             | One hex grid for the galaxy. Stars, planets and terrain occupy hexes.                                                                  |
| Opponents       | 1 to 4 AI factions. No multiplayer.                                                                                                    |
| Technology      | TypeScript, Vite, 2D canvas for the map, HTML and CSS for panels. No game framework.                                                   |
| Game length     | Short: 1 to 2 hours, about 110 to 150 turns. No turn limit.                                                                            |
| Planets         | Civilization style. Population works owned hexes. One build queue for each planet.                                                     |
| Combat          | One warship and one civilian unit in a hex. Strength values, hit points, terrain bonus.                                                |
| Victory         | Conquest (hold half of all home planets, 3 or more), Science (Exodus Gate), Forum (elected leader of the Interstellar Forum).          |
| Species         | Five species. Each has own traits, 3 own units, 1 own building, 3 own technologies, and 2 common technologies that it cannot research. |
| Units           | Fixed unit types from technologies. Units upgrade for credits.                                                                         |
| Diplomacy       | War, peace, open borders, gifts, envoys, trades of credits and technologies. Attitude from -100 to +100.                               |
| Forum victory   | Influence resource plus attitude. Trade routes give influence.                                                                         |
| Trade routes    | Abstract. No unit on the map. Wars end routes, enemy warships blockade them.                                                           |
| Expansion limit | Empire morale.                                                                                                                         |
| Borders         | Planet influence claims hexes. Hexes can be bought with credits.                                                                       |
| Planet types    | Seven types. Technologies permit the harsh types. Terraforming changes the type.                                                       |
| Extra systems   | Fog of war, anomalies, pirates, strategic and luxury resources, ground invasion.                                                       |
| Not included    | Great projects, governments, unit promotions, a ranged attack for planets, sound.                                                      |
| Support         | Save and load, difficulty levels, in-game encyclopedia. English only. Desktop only.                                                    |
| Tone            | Worn industrial, dry humour. Hand-drawn cartoon art with thick outlines, one style for all images. See `docs/ART_PROMPTS.md`.          |

## Species

| Species              | Type         | Main bonus                                                        | Main penalty                                               | Own units                                     |
|----------------------|--------------|-------------------------------------------------------------------|------------------------------------------------------------|-----------------------------------------------|
| Terran Salvage Union | Industrial   | Production, cheap buildings, fast stations                        | Influence, society technologies                            | Tug Militia, Colony Hauler, Patchwork Cruiser |
| Krogg Dominion       | Warrior      | Cheap and strong units, military technologies                     | Economy technologies, trade, reputation                    | Ramship, Krogg Shock Troops, Siege Hulk       |
| Ilthari Collegium    | Scientist    | Science buildings, science technologies, planet strength          | Unit cost, military technologies, production               | Probe Swarm, Lance Cruiser, Prism Dreadnought |
| Ozmok Combine        | Commercial   | Trade routes, credit buildings, purchases                         | Production, military technologies                          | Privateer, Prospector, Mercenary Cruiser      |
| Seren Concord        | Diplomatic   | Influence, reputation, society technologies                       | Unit strength, military technologies                       | Envoy Cutter, Peacekeeper, Aegis Cruiser      |
| Plodd Collective     | Cunning      | Science from kills, technologies from captured planets, anomalies | Science and society technologies, reputation               | Grabber, Boarding Barge, Big Ship             |
| Vessani Drift        | Shapeshifter | Units ignore closed borders, sight, ground strength               | Growth, unit cost                                          | Mimic Probe, Infiltrator Cell, Phase Cruiser  |
| Sarn Elders          | Ancient      | Start with Warp Drive, strong units and planets, influence        | Slow research, unit cost, expansion morale                 | Seeker, Warden, Planet Lance                  |
| Nullset Assembly     | Artificial   | Less food, morale, self-repair, science technologies              | Growth, influence, society technologies, no Forum founding | Sensor Drone, Assembler, Annihilator Frame    |
| The Manyfold         | Hive mind    | Half population morale, growth, population limit, reputation      | Unit strength, military technologies, credits, science     | Chorus Pod, The Tide, Unison Carrier          |
| Ashari Covenant      | Religious    | Morale, influence, strength at home, planet strength              | Science technologies, purchases                            | Pilgrim Ark, Vigil Frigate, Cathedral Ship    |
| Halcyon Hosts        | Hospitality  | Morale, luxury resources, reputation, credits from guests         | Science, unit strength, military technologies              | Welcome Wagon, Pleasure Barge, Bouncer        |

Each species also has one own building and three own technologies, and cannot research two of the common technologies.
Each species has a `lore` text in `src/core/data/species.ts`; the Encyclopedia shows it.

A species gains more from its own field in three ways:

1. Buildings of its field give +50% of their flat yield.
2. Technologies of its field cost 15% to 20% less. Technologies of the opposite field cost 10% to 20% more.
3. Its own technologies and units add to the same field.

All values are in `src/core/data/species.ts`.

## Neutral threats

The last faction in the faction list is neutral and always at war with everyone. It holds two kinds of units:

- Pirates: Raiders and Marauders spawn from dens in unclaimed space. Void Leviathans spawn in nebulae after turn 40.
- The Hollow: Whispers (from turn 30) and Choirs (from turn 80) spawn on Void Rifts that nobody watches, never more than 1 + turn / 45 at a time. They enter rifts without a drive, can step from one rift to another rift up to 14 hexes away, mend inside a rift, and leave no wreck. A destroyed Hollow unit gives science to the faction that destroyed it. The lore of the neutral faction and the Encyclopedia entry "The Hollow" describe it.

Both use the same movement and attack code in `src/core/pirates.ts`.

## Rules summary

The in-game Encyclopedia has the full rules. The source of each rule:

| Rule                                         | File                    |
|----------------------------------------------|-------------------------|
| Yields, morale, trade routes, planet defence | `src/core/economy.ts`   |
| Growth, production, borders, build options   | `src/core/planet.ts`    |
| Movement, path search, stations, anomalies   | `src/core/movement.ts`  |
| Attacks, ground invasion, planet capture     | `src/core/combat.ts`    |
| Research                                     | `src/core/research.ts`  |
| Attitude, war, peace, deals                  | `src/core/diplomacy.ts` |
| Forum membership, lobby, election            | `src/core/forum.ts`     |
| Pirates                                      | `src/core/pirates.ts`   |
| Turn sequence                                | `src/core/turn.ts`      |
| AI                                           | `src/core/ai/ai.ts`     |
| Map generator                                | `src/core/mapgen.ts`    |

### Modifiers

Species traits, technology effects and building effects use one format: the `Mod` type in
`src/core/types.ts`. `factionMods` in `src/core/rules.ts` collects the modifiers of a faction.
To add an effect, add a modifier kind and read it with `sumMod` at the place where the rule applies.
A building can have only the `PlanetMod` kinds. The planet rules read them with `planetModSum`, and the compiler rejects another kind on a building.
A rule that has a planet part and an empire part adds both: `garrisonStrength` adds the `garrison` modifiers of the buildings and of the faction.
The `reveal` modifier of a technology is the one source for the visibility of a resource (`resourceVisible`, `revealTech`).

### Actions

The interface and the AI change the state through the same functions in `src/core`. Each function checks its own rule and returns `false` without a change when the rule fails. Examples: `colonize` (needs a move left), `setBudget`, `addRoute`, `removeRoute`, `enqueue`, `moveQueued`, `cancelQueued`, `proposeDeal`.
`relation` reads the state between two factions and does not change the game state. `pair` is for changes only.
When the interface must show why an action is not possible, a blocker function gives the reason as text, or `null`: `colonizeBlocker`, `stationBlocker`, `upgradeBlocker`. The action uses the same rule.
`invite` has three results, because a refused invitation costs influence: `invalid` (no change), `refused`, `joined`.
`canAttack`, `preview`, `attackStrength` and `defenceStrength` take an optional hex for the position of the unit. The AI plans an attack from a hex that the unit can reach, and the unit does not move for the plan.

### Events

`emit` in `src/core/events.ts` reports what happened as data: unit moves, damage, destroyed units, captures, growth, new borders, completed items, colonies, technologies, war, peace, Forum members, eliminated factions.
A consumer calls `recordEvents(state)`, reads the list and empties it. The interface makes the animations of the turn change from the events. The simulator counts captures from them.
Events are not in the game state and not in a save. No rule reads them. The log texts in `GameState.log` are for the player only.

### Debug log

`src/core/debug.ts` writes the actions of the engine and of the AI to the console. Levels: `off`, `major` (decisions and results), `minor` (also the order of each unit, damage, growth, budget, routes), `trace` (also each step and each compared option).
Each event is a line of the log. The AI adds lines for its decisions with `say`. The text is a function, so a disabled level builds no text.
The log shows hidden state, such as the positions and plans of other factions. The level is `off` in a production build. A development build (`npm run dev`) starts at `major`, and the URL parameter `log` sets another level, for example `?log=trace`. `core.setDebugLevel('minor')` in the browser console changes the level in each build. The simulator has `--log=minor`.

### Turn sequence and victory

The comment on `startFactionTurn` in `src/core/turn.ts` gives the order: income, research, planets, units. Income uses the state before the turn. Planets use the technologies after research.
A victory takes effect at the transition that gives it, and the first victory stays: Conquest in `capture`, Science when the Exodus Gate completes, Forum at the election. `endTurn` stops at that point.
A project needs an entry in `PROJECT_EFFECTS` in `src/core/planet.ts`.
Conquest needs half of all home planets, the own one included, and 3 or more (`homesNeeded`): 3 of 4, 3 of 6, 4 of 8.
A home planet that its first owner still holds has 8% more planet strength and garrison strength (`HOME_DEFENCE`).
The Exodus Gate costs 7000. Each turn it gets the production of its planet and half of the empire science (`GATE_SCIENCE_SHARE`).
A Forum victory needs more than half of the votes of all living factions. A faction outside the Forum has no vote, so it counts against the winner.

### Knowledge of a captured planet

`takeKnowledge` in `src/core/combat.ts` runs at each capture between two real factions.
The new owner learns 1 technology of the old owner that it can research now (`CAPTURE_TECHS`), plus the `captureTech` modifier of its species.
The home planet of a species also gives 1 species technology of the old owner. A unit or building of another species is permitted when the faction has the species technology that it needs (`speciesOk` in `src/core/rules.ts`). The research screen lists these technologies as captured knowledge.
The old owner loses 1 technology that no other of its technologies needs, and not a start technology (`losableTechs`, `forget` in `src/core/research.ts`). Research that needs the lost technology starts again from it.

### Infiltration

The `infiltrate` modifier lets ground troops invade a planet while its defences are up, at a share of their strength (`canInvade`, `invasionStrength` in `src/core/combat.ts`). The Vessani have it at 50%. Their units also enter closed borders.
The AI of such a faction uses both abilities (`infiltrationTarget`, `troopsInPlace` in `src/core/ai/ai.ts`). In peace it researches Ground Forces early, builds 3 troop units, and places them next to the home planet of its best war candidate. When the troops together have odds of 1.2 or more against the garrison, it declares war, and the troops invade in the same turn.
A player sees the troop units next to the planet before the war. The defence is garrison strength: population, technologies and garrison buildings.

### Advisors

`src/core/advisor.ts` gives one suggestion for each field: military, economy, science, growth, morale. `productionAdvice` picks from the build options of a planet, and `researchAdvice` picks a research target by its help for the field divided by the science that its path costs. Each suggestion has a reason with numbers. The functions read the own faction only and do not change the state.
The planet panel and the research screen show the suggestions. A click adds the item to the queue or starts the research.

### AI and difficulty

Each species has AI weights in `src/core/data/species.ts`: military, expansion, science, commerce, diplomacy, aggression, `warRatio` (the fleet strength, as a multiple of the target's, that the faction needs before it declares war) and `selfRegard` (its vote for itself in the Forum).
A difficulty level changes numbers only: AI yields, AI costs, base morale and the pirate rate. The AI rules are the same on each level.

### FTL drives

| Drive      | Technology | Effect                              |
|------------|------------|-------------------------------------|
| Jump Drive | none       | Base movement                       |
| Warp Drive | Warp Drive | +1 movement                         |
| Hyperdrive | Hyperdrive | +2 movement, ships cross Void Rifts |
| Fold Drive | Fold Drive | +3 movement                         |

Each drive also adds 4 hexes to the range of trade routes.

### Game state

The game state is plain JSON (`GameState` in `src/core/types.ts`). A save is `JSON.stringify` of the state.
`src/core/persist.ts` decodes a save: it runs the migrations from the version of the file to `SAVE_VERSION`, then validates ids, references, sizes and numbers. `src/ui/save.ts` has only the browser storage and the file download.
A change of the state format adds one migration and adds 1 to `SAVE_VERSION`.
The random number generator keeps its state in `GameState.rng`, so a loaded game continues the same sequence.
The rules code in `src/core` has no dependency on the browser.

## Balance data

Result of 96 AI-only games on a medium galaxy with 6 factions, difficulty Captain (`npm run sim -- 96 220 medium --quiet`).
All 96 games had a winner. Games ended between turn 77 and turn 181, median 131.

| Victory  | Wins | Share | Median turn |
|----------|------|-------|-------------|
| Science  | 34   | 35%   | 149         |
| Forum    | 32   | 33%   | 127         |
| Conquest | 30   | 31%   | 109         |

| Species              | Games | Wins | Win rate | Wins by                          | Average rank | Planets captured |
|----------------------|-------|------|----------|----------------------------------|--------------|------------------|
| Krogg Dominion       | 50    | 18   | 36%      | Conquest 18                      | 3.3          | 176              |
| Ashari Covenant      | 61    | 16   | 26%      | Forum 14, Science 2              | 3.9          | 3                |
| Seren Concord        | 40    | 10   | 25%      | Forum 10                         | 4.1          | 2                |
| Ozmok Combine        | 48    | 9    | 19%      | Science 8, Forum 1               | 1.9          | 7                |
| Terran Salvage Union | 44    | 8    | 18%      | Science 8                        | 1.4          | 16               |
| Ilthari Collegium    | 47    | 8    | 17%      | Science 8                        | 4.8          | 1                |
| Halcyon Hosts        | 43    | 7    | 16%      | Forum 6, Science 1               | 3.6          | 1                |
| Vessani Drift        | 51    | 7    | 14%      | Conquest 5, Science 1, Forum 1   | 4.2          | 88               |
| Plodd Collective     | 47    | 6    | 13%      | Conquest 6                       | 3.1          | 151              |
| Sarn Elders          | 47    | 3    | 6%       | Science 3                        | 4.6          | 4                |
| The Manyfold         | 51    | 3    | 6%       | Science 3                        | 3.8          | 3                |
| Nullset Assembly     | 47    | 1    | 2%       | Conquest 1                       | 3.2          | 114              |

An even result is 17% for each species. One win rate has an error of about 6 percentage points at this number of games.
Each species wins in the way of its character: the warriors by Conquest, the diplomats by the Forum, the others by Science. Conquest is the early victory and Science is the late one.
The Ilthari are eliminated in about 1 game of 4 and win by Science when they survive.

The balance is sensitive to the defence of home planets (`HOME_DEFENCE` in `src/core/economy.ts`), because each Conquest win needs 2 captured home planets:

| `HOME_DEFENCE` | Conquest | Science | Forum | Nullset wins | Vessani wins |
|----------------|----------|---------|-------|--------------|--------------|
| 1.00           | 48       | 30      | 18    | 15           | 13           |
| 1.08           | 30       | 34      | 32    | 1            | 7            |
| 1.15           | 28       | 46      | 22    | 4            | 4            |

The Nullset take home planets late in a game, so the bonus stops most of their wins. The Krogg attack early and are the strongest species at 1.08.

## Animations

`src/ui/app.ts` records the events of the turn change (`recordEvents`). Units that moved slide from the old hex to the new one, own units and planets that took damage show the damage, a destroyed own unit shows a label, planets that grew or completed a building show a label, and new border hexes pulse in the faction colour. Own moves slide along the path. The renderer runs its frame loop only while an animation is active.

## Keyboard

The key `?` opens the list of all keys. The tables in `src/ui/keys.ts` are the source of that list.
On a screen, Tab and the arrow keys move the focus, and Enter or Space uses the focused item. An arrow key goes to the nearest item in its direction, so the same code serves lists, grids and the technology tree.
`h` in `src/ui/dom.ts` marks each element that has a click handler, and `renderScreen` puts the marked elements in the Tab order. A screen that is drawn again keeps the focus at the same item.
A button with the option `key` has its own key and shows it. The keys that open a screen from the map (T, G, O, E, U, P, K) also switch between the screens of a game.

## Phones

`App.mobile` is true in a window under 900 px wide, or under 1200 px with a coarse pointer. `refresh` sets the class `mobile` on `body`, and the phone styles in `src/style.css` start with `body.mobile`.
The rule is one thing in focus at a time. The map fills the screen with a compact top bar. One sheet at the bottom shows the armed target, the selected unit, or the tapped hex. A planet is a full-height sheet with the tabs Planet, Production and Map; the Map tab hides the sheet and keeps the planet open, for the worked hexes and for a hex purchase. Screens fill the whole window, and the encyclopedia shows the list or one entry.
Touch: `App.tapHex` selects an own unit, opens an own planet, or commands the selected unit. A move happens on the first tap. An attack or an invasion needs a second tap on the same hex, or the button in the sheet (`App.armed`). A long press shows the hex (`App.pressHex`). A drag moves the map and a pinch zooms, in the pointer handlers of `App.bind`. The map canvas has `touch-action: none` and cancels the click after a tap, so a panel that a tap opens does not get the click.
Full screen: `start` asks for it with the Fullscreen API when the window is a phone. iOS Safari has no Fullscreen API for a page, so `index.html` and `public/manifest.webmanifest` make the game a home-screen web app with a full screen, and the menu says so on an iPhone.

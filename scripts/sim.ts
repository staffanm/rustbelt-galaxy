// Runs games with AI factions only and prints a summary.
// Usage: npm run sim -- [games] [turns] [galaxy] [--quiet] [--check] [--log=major|minor|trace]
// --log writes the debug log of the engine and the AI to the console.
// --check validates the state after each turn, as a save file would be validated. The first problem stops the run.
import { DEBUG_LEVELS, setDebugLevel, type DebugLevel } from '../src/core/debug';
import { empireIncome } from '../src/core/economy';
import { recordEvents, type GameEvent } from '../src/core/events';
import { newGame } from '../src/core/game';
import { validateState } from '../src/core/persist';
import { ownedPlanets, realFactions } from '../src/core/rules';
import { endTurn } from '../src/core/turn';
import type { GameState, SpeciesId } from '../src/core/types';
import { score } from '../src/core/victory';

const games = Number(process.argv[2] ?? 3);
const turns = Number(process.argv[3] ?? 150);
const galaxy = (process.argv[4] ?? 'medium') as 'small' | 'medium' | 'large';
import { GALAXY_SIZES, PLAYABLE, SPECIES } from '../src/core/data/species';
const species: SpeciesId[] = PLAYABLE;
const quiet = process.argv.includes('--quiet');
const check = process.argv.includes('--check');
const logLevel = process.argv.find((a) => a.startsWith('--log='))?.slice(6) as DebugLevel | undefined;
if (logLevel && DEBUG_LEVELS.includes(logLevel)) setDebugLevel(logLevel);
interface Stat {
  games: number;
  wins: number;
  rank: number;
  score: number;
  planets: number;
  dead: number;
  captures: number;
  homes: number;
}
const stats: Record<string, Stat> = {};

function line(s: GameState): string {
  return realFactions(s)
    .map((f) => {
      const inc = empireIncome(s, f);
      const pl = ownedPlanets(s, f.id);
      const pop = pl.reduce((a, p) => a + p.pop, 0);
      const units = s.units.filter((u) => u.owner === f.id).length;
      return `${f.species.slice(0, 4)}${f.alive ? '' : '(dead)'} P${pl.length} pop${pop} T${f.techs.length} U${units} c${Math.round(f.credits)}${inc.cred >= 0 ? '+' : ''}${inc.cred.toFixed(0)} s${inc.sci.toFixed(0)} i${Math.round(f.influence)} m${inc.morale.total}`;
    })
    .join(' | ');
}

const wins: Record<string, number> = {};
const events: string[] = [];
let captures: Record<number, number> = {};
// Counts the captures and makes the report lines from the events of one turn.
function collect(s: GameState, list: GameEvent[]) {
  const name = (f: number) => s.factions[f].species;
  for (const e of list) {
    if (e.kind === 'planetCaptured') {
      captures[e.by] = (captures[e.by] ?? 0) + 1;
      events.push(`t${e.turn} ${name(e.by)}: captured ${s.planets[e.planet].name} from ${name(e.from)}`);
    } else if (e.kind === 'warDeclared') events.push(`t${e.turn} ${name(e.by)}: declared war on ${name(e.on)}`);
    else if (e.kind === 'peaceMade') events.push(`t${e.turn} ${name(e.a)}: made peace with ${name(e.b)}`);
    else if (e.kind === 'factionEliminated') events.push(`t${e.turn} ${name(e.faction)}: eliminated by ${name(e.by)}`);
  }
  list.length = 0;
}
for (let g = 0; g < games; g++) {
  const s = newGame({ galaxy, opponents: GALAXY_SIZES[galaxy].maxOpponents, difficulty: 2, playerSpecies: species[g % species.length], seed: 1000 + g * 77 });
  for (const f of s.factions) f.isHuman = false;
  const t0 = Date.now();
  const recorded = recordEvents(s);
  events.length = 0;
  captures = {};
  while (!s.winner && s.turn < turns) {
    s.log.length = 0;
    endTurn(s);
    collect(s, recorded);
    const problem = check ? validateState(JSON.parse(JSON.stringify(s))) : null;
    if (problem) {
      console.error(`game ${g} seed ${s.settings.seed} turn ${s.turn}: invalid state: ${problem}`);
      process.exit(1);
    }
    if (s.turn % 25 === 0 && !quiet) console.log(`  t${s.turn}: ${line(s)}`);
  }
  const w = s.winner;
  const key = w ? `${s.factions[w.faction].species}/${w.kind}` : 'none';
  wins[key] = (wins[key] ?? 0) + 1;
  console.log(
    `game ${g} seed ${s.settings.seed}: ${w ? `${s.factions[w.faction].name} wins by ${w.kind} on turn ${w.turn}` : `no winner at turn ${s.turn}`} (${Date.now() - t0} ms)`,
  );
  if (!quiet) {
    console.log(`  final: ${line(s)}`);
    console.log('  events:\n    ' + events.join('\n    '));
    console.log(`  scores: ${realFactions(s).map((f) => `${f.species}=${score(s, f.id)}`).join(' ')} forum=${s.forum ? `members ${s.forum.members.length} leader ${s.forum.leader}` : 'no'}`);
  }
  const ranked = realFactions(s).map((f) => ({ f, sc: score(s, f.id) })).sort((a, b) => b.sc - a.sc);
  ranked.forEach(({ f, sc }, i) => {
    const st = (stats[f.species] ??= { games: 0, wins: 0, rank: 0, score: 0, planets: 0, dead: 0, captures: 0, homes: 0 });
    st.captures += captures[f.id] ?? 0;
    st.homes += s.planets.filter((p) => p.homeOf >= 0 && p.homeOf !== f.id && p.owner === f.id).length;
    st.games++;
    st.rank += i + 1;
    st.score += sc;
    st.planets += ownedPlanets(s, f.id).length;
    if (!f.alive) st.dead++;
    if (w && w.faction === f.id) st.wins++;
  });
}
console.log(wins);
console.log('species          games wins  rank  score planets dead captures homes');
for (const [sp, st] of Object.entries(stats).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games || a[1].rank / a[1].games - b[1].rank / b[1].games)) {
  console.log(
    `${SPECIES[sp as SpeciesId].name.padEnd(22)} ${String(st.games).padStart(3)} ${String(st.wins).padStart(4)} ${(st.rank / st.games).toFixed(2).padStart(6)} ${(st.score / st.games).toFixed(0).padStart(6)} ${(st.planets / st.games).toFixed(1).padStart(7)} ${String(st.dead).padStart(4)} ${String(st.captures).padStart(8)} ${String(st.homes).padStart(5)}`,
  );
}

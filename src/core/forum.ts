import { SPECIES } from './data/species';
import { changeAttitude } from './diplomacy';
import { ENGINE, debug, factionLabel } from './debug';
import { emit } from './events';
import { atWar, log, realFactions, sumMod } from './rules';
import type { Faction, GameState } from './types';

export const INVITE_COST = 20;
export const LOBBY_COST = 30;
export const LOBBY_GAIN = 10;
export const JOIN_ATTITUDE = 15;
export const ELECTION_INTERVAL = 10;

export function livingFactions(s: GameState): Faction[] {
  return realFactions(s).filter((f) => f.alive);
}

// Each lobby action on the same voter before an election costs more than the one before.
export function lobbyCost(f: Faction, voter?: number): number {
  const done = voter === undefined ? 0 : (f.lobby[voter] ?? 0) / LOBBY_GAIN;
  return Math.max(5, Math.round(LOBBY_COST * (1 + 0.5 * done) * (1 + sumMod(f, 'lobbyCostMult'))));
}

// Does "target" agree to join the Forum when the founder invites it?
export function acceptsInvitation(s: GameState, target: number): boolean {
  if (!s.forum || s.forum.members.includes(target)) return false;
  const founder = s.forum.founder;
  if (atWar(s, target, founder) || !s.factions[target].met.includes(founder)) return false;
  return s.attitude[target][founder] >= JOIN_ATTITUDE;
}

export function join(s: GameState, f: number) {
  if (!s.forum || s.forum.members.includes(f)) return;
  s.forum.members.push(f);
  emit(s, { kind: 'forumJoined', faction: f });
  log(s, -1, `The ${s.factions[f].name} joined the Interstellar Forum.`, undefined, 'info');
}

export type InviteResult = 'invalid' | 'refused' | 'joined';

// The founder pays influence to invite a faction. The influence is lost when the faction refuses.
// "invalid" means that the state did not change.
export function invite(s: GameState, target: number): InviteResult {
  if (!s.forum) return 'invalid';
  const founder = s.factions[s.forum.founder];
  if (founder.influence < INVITE_COST || s.forum.members.includes(target)) return 'invalid';
  founder.influence -= INVITE_COST;
  if (!acceptsInvitation(s, target)) {
    log(s, founder.id, `The ${s.factions[target].name} refused the invitation to the Forum.`, undefined, 'bad');
    return 'refused';
  }
  join(s, target);
  return 'joined';
}

// A human player who is not the founder asks to join. The founder must like the player enough.
export function canApply(s: GameState, f: number): boolean {
  if (!s.forum || s.forum.members.includes(f)) return false;
  const founder = s.forum.founder;
  return !atWar(s, f, founder) && s.factions[f].met.includes(founder) && s.attitude[founder][f] >= 0;
}

export function lobby(s: GameState, by: number, voter: number): boolean {
  const f = s.factions[by];
  if (!s.forum || !s.forum.members.includes(by) || !s.forum.members.includes(voter) || by === voter) return false;
  const cost = lobbyCost(f, voter);
  if (f.influence < cost) return false;
  f.influence -= cost;
  f.lobby[voter] = (f.lobby[voter] ?? 0) + LOBBY_GAIN;
  return true;
}

export function support(s: GameState, voter: number, candidate: number): number {
  if (voter === candidate) {
    const f = s.factions[voter];
    return f.isHuman ? 1000 : SPECIES[f.species].ai.selfRegard;
  }
  if (atWar(s, voter, candidate)) return -1000;
  return s.attitude[voter][candidate] + (s.factions[candidate].lobby[voter] ?? 0);
}

// A human member votes as it chose (setVote), for itself without a choice. An AI member votes for the candidate
// that it supports most.
export function voteOf(s: GameState, voter: number): number {
  const f = s.factions[voter];
  if (f.isHuman) return f.vote !== undefined && validVote(s, voter, f.vote) ? f.vote : voter;
  let best = voter;
  let bestScore = -Infinity;
  for (const c of s.forum!.members) {
    const score = support(s, voter, c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

// A member can vote for any member that it is not at war with.
export function validVote(s: GameState, voter: number, candidate: number): boolean {
  return !!s.forum && s.forum.members.includes(voter) && s.forum.members.includes(candidate) && !atWar(s, voter, candidate);
}

// The choice of a human member for the next election. Undefined is a vote for itself.
export function setVote(s: GameState, voter: number, candidate: number | undefined): boolean {
  if (candidate !== undefined && (candidate === voter || !validVote(s, voter, candidate))) return false;
  s.factions[voter].vote = candidate;
  return true;
}

// Did the faction vote for the leader at the last election? The leader cannot declare war on it, and it gets
// influence from the leader each shift (patronage).
export function supporter(s: GameState, f: number): boolean {
  const forum = s.forum;
  return !!forum && forum.leader >= 0 && forum.leader !== f && forum.lastVotes[f] === forum.leader;
}

// More than half of the votes of all living factions.
export function votesNeeded(factions: number): number {
  return Math.floor(factions / 2) + 1;
}

export function forumTick(s: GameState) {
  const forum = s.forum;
  if (!forum) return;
  forum.members = forum.members.filter((m) => s.factions[m].alive);
  if (!s.factions[forum.founder].alive || !forum.members.length) {
    log(s, -1, 'The Interstellar Forum closed. The founder is gone.', undefined, 'info');
    s.forum = null;
    return;
  }
  if (s.turn < forum.nextElection) return;
  forum.nextElection = s.turn + ELECTION_INTERVAL;
  if (forum.members.length < 2) return;
  const votes: Record<number, number> = {};
  forum.lastVotes = {};
  for (const v of forum.members) {
    const c = voteOf(s, v);
    forum.lastVotes[v] = c;
    votes[c] = (votes[c] ?? 0) + 1;
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const [top, count] = [Number(ranked[0][0]), ranked[0][1]];
  const tie = ranked.length > 1 && ranked[1][1] === count;
  forum.leader = tie ? -1 : top;
  for (const f of realFactions(s)) f.vote = undefined;
  debug(s, 'major', ENGINE, () => `Forum election: ${Object.entries(forum.lastVotes).map(([v, c]) => `#${v} votes for #${c}`).join(', ')}${tie ? ' - tied' : ''}`);
  for (const f of realFactions(s)) f.lobby = {};
  if (tie) {
    log(s, -1, 'Forum election: the vote was tied. The Forum has no leader.', undefined, 'info');
    return;
  }
  const name = s.factions[top].name;
  log(s, -1, `Forum election: the ${name} leads the Forum with ${count} of ${forum.members.length} votes.`, undefined, 'info');
  for (const v of forum.members) if (forum.lastVotes[v] === top && v !== top) changeAttitude(s, top, v, 5);
  // A faction outside the Forum has no vote, so it counts against the winner.
  if (count >= votesNeeded(livingFactions(s).length) && forum.members.length >= 2 && !s.winner) {
    s.winner = { faction: top, kind: 'forum', turn: s.turn };
    debug(s, 'major', ENGINE, () => `${factionLabel(s.factions[top])} wins by the Forum election`);
  }
}

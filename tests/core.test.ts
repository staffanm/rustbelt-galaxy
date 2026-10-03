import { describe, expect, it } from 'vitest';
import { BUILDING_LORE, PLANET_LORE, PROJECT_LORE, RESOURCE_LORE, TERRAIN_LORE, UNIT_LORE } from '../src/core/data/lore';
import { PLANET_TYPES, RESOURCES, TERRAIN } from '../src/core/data/terrain';
import { BUILDINGS } from '../src/core/data/buildings';
import { TECH_LORE } from '../src/core/data/techLore';
import { BUILDING_LIST, PROJECTS } from '../src/core/data/buildings';
import { PLAYABLE, SPECIES } from '../src/core/data/species';
import { TECHS, TECH_LIST } from '../src/core/data/techs';
import { UNITS, UNIT_LIST } from '../src/core/data/units';
import { calendarDate, dateLong, dateShort } from '../src/core/calendar';
import { productionAdvice, researchAdvice } from '../src/core/advisor';
import { CAPTAINS, leadership, slotOf } from '../src/ui/captains';
import { attack, canAttack, canInvade, capture, engage, invade, invasionStrength, preview } from '../src/core/combat';
import { attitudeTarget, canDeclareWar, declareWar, proposeDeal } from '../src/core/diplomacy';
import { HOME_DEFENCE, addRoute, empireIncome, garrisonStrength, removeRoute, routeCap, setBudget, tradeSlots } from '../src/core/economy';
import { debugLevel, setDebugLevel, setDebugSink } from '../src/core/debug';
import { recordEvents } from '../src/core/events';
import { INVITE_COST, forumTick, invite, setVote, supporter, voteOf } from '../src/core/forum';
import { SAVE_VERSION, newGame } from '../src/core/game';
import { distance, neighbors, within } from '../src/core/hex';
import { canEnter, colonize, findPath, orderMove, upgradeBlocker } from '../src/core/movement';
import { decodeSave, encodeSave, validateState } from '../src/core/persist';
import { buildOptions, cancelQueued, createUnit, enqueue, moveQueued, settle } from '../src/core/planet';
import { addScience, researchPath, setResearch } from '../src/core/research';
import { homesNeeded } from '../src/core/victory';
import { meet } from '../src/core/visibility';
import { atWar, driveLevel, ownedPlanets, realFactions, resourceVisible, sumMod, techAvailable, techCost, unitAllowed } from '../src/core/rules';
import { FORUM_MEMBER_INFLUENCE, FORUM_SUPPORTER_INFLUENCE, endTurn, startFactionTurn } from '../src/core/turn';
import type { GameSettings, GameState } from '../src/core/types';

const settings: GameSettings = { galaxy: 'small', opponents: 3, difficulty: 2, playerSpecies: 'terran', seed: 42 };

function freeHexNear(s: GameState, hex: number, dist: number): number {
  return within(s, hex, dist + 1).find(
    (i) => distance(s, i, hex) === dist && s.hexes[i].terrain === 'space' && !s.units.some((u) => u.hex === i),
  )!;
}

describe('hex grid', () => {
  const g = { width: 10, height: 8 };
  it('has symmetric neighbours at distance 1', () => {
    for (let i = 0; i < 80; i++) {
      for (const n of neighbors(g, i)) {
        expect(distance(g, i, n)).toBe(1);
        expect(neighbors(g, n)).toContain(i);
      }
    }
  });
});

describe('game data', () => {
  it('has valid references', () => {
    for (const t of TECH_LIST) for (const p of t.prereqs) expect(TECHS[p], `${t.id} needs ${p}`).toBeDefined();
    for (const u of UNIT_LIST) {
      if (u.tech) expect(TECHS[u.tech], u.id).toBeDefined();
      if (u.replaces) expect(UNITS[u.replaces], u.id).toBeDefined();
      if (u.upgradesTo) expect(UNITS[u.upgradesTo], u.id).toBeDefined();
    }
    for (const b of BUILDING_LIST) if (b.tech) expect(TECHS[b.tech], b.id).toBeDefined();
    for (const p of Object.values(PROJECTS)) expect(TECHS[p.tech], p.id).toBeDefined();
    for (const sp of PLAYABLE) for (const t of SPECIES[sp].excludedTechs) expect(TECHS[t], `${sp} excludes ${t}`).toBeDefined();
    for (const sp of PLAYABLE) for (const t of SPECIES[sp].startTechs ?? []) expect(TECHS[t], `${sp} starts with ${t}`).toBeDefined();
    for (const b of BUILDING_LIST) if (b.replaces) expect(BUILDINGS[b.replaces], b.id).toBeDefined();
    for (const d of [...UNIT_LIST, ...BUILDING_LIST, ...Object.values(PROJECTS)]) if (d.resource) expect(RESOURCES[d.resource], d.id).toBeDefined();
    for (const t of TECH_LIST) for (const m of t.effects) if (m.kind === 'reveal') expect(RESOURCES[m.resource], t.id).toBeDefined();
  });

  it('has no id twice', () => {
    for (const list of [TECH_LIST, UNIT_LIST, BUILDING_LIST]) expect(new Set(list.map((d) => d.id)).size).toBe(list.length);
    for (const [id, p] of Object.entries(PROJECTS)) expect(p.id).toBe(id);
  });

  it('has no cycle in the prerequisites and in the upgrades', () => {
    const cyclic = (start: string, next: (id: string) => string[]) => {
      const visit = (id: string, path: string[]): boolean => path.includes(id) || next(id).some((n) => visit(n, [...path, id]));
      return visit(start, []);
    };
    for (const t of TECH_LIST) expect(cyclic(t.id, (id) => TECHS[id].prereqs), t.id).toBe(false);
    for (const u of UNIT_LIST) expect(cyclic(u.id, (id) => (UNITS[id].upgradesTo ? [UNITS[id].upgradesTo!] : [])), u.id).toBe(false);
  });

  it('hides a resource until the faction has the technology that reveals it', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    expect(resourceVisible(f, 'void_coffee')).toBe(true);
    expect(resourceVisible(f, 'helium3')).toBe(false);
    f.techs.push('helium_refining');
    expect(resourceVisible(f, 'helium3')).toBe(true);
  });

  it('gives each species three own technologies and three own units', () => {
    for (const sp of PLAYABLE) {
      expect(TECH_LIST.filter((t) => t.species === sp)).toHaveLength(3);
      expect(UNIT_LIST.filter((u) => u.species === sp)).toHaveLength(3);
      expect(BUILDING_LIST.filter((b) => b.species === sp)).toHaveLength(1);
    }
  });

  it('lets each species reach the victory technologies and a ground unit', () => {
    for (const sp of PLAYABLE) {
      const s = newGame({ ...settings, playerSpecies: sp });
      const f = s.factions[0];
      // The Nullset Assembly cannot found the Forum. It can join one.
      const goals = sp === 'nullset' ? ['gate_theory'] : ['gate_theory', 'interstellar_forum'];
      for (const goal of goals) {
        expect(techAvailable(f, goal), `${sp} ${goal}`).toBe(true);
        const path = researchPath(f, goal);
        expect(path[path.length - 1]).toBe(goal);
      }
      const ground = UNIT_LIST.filter((u) => u.ground && unitAllowed({ ...f, techs: TECH_LIST.filter((t) => techAvailable(f, t.id)).map((t) => t.id) }, u));
      expect(ground.length, `${sp} has a ground unit`).toBeGreaterThan(0);
    }
  });
});

describe('new game', () => {
  it('is the same for the same seed', () => {
    expect(JSON.stringify(newGame(settings))).toBe(JSON.stringify(newGame(settings)));
  });

  it('gives each faction a home planet and three units', () => {
    const s = newGame(settings);
    for (const f of realFactions(s)) {
      const planets = ownedPlanets(s, f.id);
      expect(planets).toHaveLength(1);
      expect(planets[0].homeOf).toBe(f.id);
      expect(s.units.filter((u) => u.owner === f.id)).toHaveLength(3);
    }
  });

  it('continues in the same way after save and load', () => {
    const a = newGame(settings);
    for (let i = 0; i < 12; i++) endTurn(a);
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    for (let i = 0; i < 8; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('research', () => {
  it('completes a technology and keeps the extra science', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    setResearch(s, f, 'warp_drive');
    expect(f.researching).toBe('signal_analysis');
    expect(f.researchQueue).toEqual(['warp_drive']);
    addScience(s, f, techCost(s, f, 'signal_analysis') + 5);
    expect(f.techs).toContain('signal_analysis');
    expect(f.researching).toBe('warp_drive');
    expect(f.researchProgress.warp_drive).toBe(5);
  });

  it('applies the species cost difference', () => {
    const krogg = newGame({ ...settings, playerSpecies: 'krogg' });
    const ilthari = newGame({ ...settings, playerSpecies: 'ilthari' });
    expect(techCost(krogg, krogg.factions[0], 'kinetic_weapons')).toBeLessThan(techCost(ilthari, ilthari.factions[0], 'kinetic_weapons'));
    expect(techCost(ilthari, ilthari.factions[0], 'signal_analysis')).toBeLessThan(techCost(krogg, krogg.factions[0], 'signal_analysis'));
  });
});

describe('economy', () => {
  it('limits trade routes by the empire limit', () => {
    const s = newGame({ ...settings, playerSpecies: 'ozmok' });
    const f = s.factions[0];
    const home = ownedPlanets(s, 0)[0];
    expect(routeCap(f)).toBe(3);
    expect(tradeSlots(s, home)).toBe(0);
    home.buildings.push('bazaar_ring');
    expect(tradeSlots(s, home)).toBe(2);
  });

  it('gives a positive income at the start', () => {
    const s = newGame(settings);
    const inc = empireIncome(s, s.factions[0]);
    expect(inc.cred).toBeGreaterThan(0);
    expect(inc.sci).toBeGreaterThan(0);
  });

  it('builds the item in the queue', () => {
    const s = newGame(settings);
    const home = ownedPlanets(s, 0)[0];
    const scout = { kind: 'unit' as const, id: 'scout' };
    expect(enqueue(s, home, scout)).toBe(true);
    const firstNewId = s.nextUnitId;
    let built = false;
    for (let i = 0; i < 12 && !built; i++) {
      endTurn(s);
      built = s.units.some((u) => u.owner === 0 && u.type === 'scout' && u.id >= firstNewId);
    }
    expect(built).toBe(true);
    expect(home.queue).toEqual([]);
  });

  it('adds the garrison modifiers of the faction to the garrison strength', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    const home = ownedPlanets(s, 0)[0];
    const before = garrisonStrength(s, home);
    f.techs.push('blessed_hulls'); // +5 garrison strength
    // The planet is a home planet with its first owner, so it also has the home defence bonus.
    expect(garrisonStrength(s, home) - before).toBeCloseTo((5 + 0.4) * (1 + sumMod(f, 'groundMult')) * HOME_DEFENCE, 5);
    const strong = garrisonStrength(s, home);
    home.homeOf = 1;
    expect(garrisonStrength(s, home)).toBeCloseTo(strong / HOME_DEFENCE, 5);
  });

  it('uses the modifiers of the current technologies when one technology replaces another', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    f.techs = ['warp_drive'];
    expect(driveLevel(f)).toBe(1);
    f.techs[0] = 'heavy_armour';
    expect(driveLevel(f)).toBe(0);
  });
});

describe('actions', () => {
  // A rejected action must leave the state as it was.
  const unchanged = (s: GameState, act: () => boolean) => {
    const before = JSON.stringify(s);
    expect(act()).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  };

  it('does not change the state when it reads the relation of two factions', () => {
    const s = newGame(settings);
    const before = JSON.stringify(s);
    atWar(s, 0, 1);
    canDeclareWar(s, 0, 1);
    attitudeTarget(s, 0, 1);
    canEnter(s, s.factions[0], ownedPlanets(s, 1)[0].hex + 1);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('founds a colony only with a move left', () => {
    const s = newGame(settings);
    const u = s.units.find((x) => x.owner === 0 && UNITS[x.type].canColonize)!;
    const p = s.planets.find((x) => x.owner < 0)!;
    p.type = 'terran';
    u.hex = p.hex;
    u.moves = 0;
    unchanged(s, () => colonize(s, u));
    u.moves = 1;
    expect(colonize(s, u)).toBe(true);
    expect(p.owner).toBe(0);
    expect(s.units).not.toContain(u);
  });

  it('keeps the budget shares in steps of 10 with a sum of 100 or less', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    unchanged(s, () => setBudget(f, 'research', 55));
    unchanged(s, () => setBudget(f, 'research', 110));
    expect(setBudget(f, 'research', 70)).toBe(true);
    expect(setBudget(f, 'welfare', 50)).toBe(true);
    expect(f.budget).toEqual({ research: 50, welfare: 50 });
  });

  it('starts a trade route only to a valid planet and with a free slot', () => {
    const s = newGame({ ...settings, playerSpecies: 'ozmok' });
    const home = ownedPlanets(s, 0)[0];
    const other = s.planets.filter((p) => p.owner < 0).sort((a, b) => distance(s, a.hex, home.hex) - distance(s, b.hex, home.hex))[0];
    settle(s, other, 0);
    s.factions[0].explored[other.hex] = 1;
    unchanged(s, () => addRoute(s, home, other.id)); // no Trade Hub: no slot
    home.buildings.push('bazaar_ring');
    unchanged(s, () => addRoute(s, home, home.id));
    unchanged(s, () => addRoute(s, home, 9999));
    expect(addRoute(s, home, other.id)).toBe(true);
    unchanged(s, () => addRoute(s, home, other.id));
    expect(removeRoute(home, other.id)).toBe(true);
    expect(home.routes).toEqual([]);
  });

  it('changes the production queue only at valid positions', () => {
    const s = newGame(settings);
    const home = ownedPlanets(s, 0)[0];
    const [a, b] = buildOptions(s, home).filter((o) => o.ok && o.item.kind === 'unit').map((o) => o.item);
    expect(enqueue(s, home, a)).toBe(true);
    expect(enqueue(s, home, b)).toBe(true);
    unchanged(s, () => moveQueued(home, 1, 2));
    unchanged(s, () => cancelQueued(home, -1));
    expect(moveQueued(home, 1, 0)).toBe(true);
    expect(home.queue.map((q) => q.id)).toEqual([b.id, a.id]);
    expect(cancelQueued(home, 0)).toBe(true);
    expect(home.queue.map((q) => q.id)).toEqual([a.id]);
  });

  it('gives the reason when a unit cannot upgrade', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    const home = ownedPlanets(s, 0)[0];
    const u = createUnit(s, 0, 'corvette', freeHexNear(s, home.hex, 1));
    expect(upgradeBlocker(s, u)).toBe('No upgrade is available.');
    f.techs.push('kinetic_weapons');
    f.credits = 0;
    expect(upgradeBlocker(s, u)).toMatch(/credits/);
    f.credits = 1000;
    expect(upgradeBlocker(s, u)).toBeNull();
    u.hex = s.hexes.findIndex((h, i) => h.owner === undefined && h.terrain === 'space' && i >= 0);
    expect(upgradeBlocker(s, u)).toMatch(/borders/);
  });

  it('executes a deal only when the other faction accepts it', () => {
    const s = newGame(settings);
    unchanged(s, () => proposeDeal(s, 0, 1, { giveCredits: 0, giveTechs: [], takeCredits: 10, takeTechs: [] }));
    unchanged(s, () => proposeDeal(s, 0, 1, { giveCredits: 10000, giveTechs: [], takeCredits: 0, takeTechs: [] }));
    const mine = s.factions[0].credits;
    expect(proposeDeal(s, 0, 1, { giveCredits: 10, giveTechs: [], takeCredits: 0, takeTechs: [] })).toBe(true);
    expect(s.factions[0].credits).toBe(mine - 10);
  });
});

describe('victory', () => {
  // The Exodus Gate of faction 1 is one shift from completion.
  const gateReady = (s: GameState) => {
    const home = ownedPlanets(s, 1)[0];
    s.factions[1].techs.push('gate_theory');
    const hex = s.hexes.findIndex((h) => h.owner === home.id && h.terrain !== 'planet');
    s.hexes[hex].resource = 'antimatter';
    s.hexes[hex].station = true;
    home.queue = [{ kind: 'project', id: 'exodus_gate' }];
    home.prodStore = 1e6;
  };

  it('needs half of the home planets for the Conquest victory, and 3 or more', () => {
    const needed = (opponents: number, galaxy: GameSettings['galaxy']) => homesNeeded(newGame({ ...settings, galaxy, opponents }));
    expect(needed(1, 'small')).toBe(2);
    expect(needed(3, 'small')).toBe(3);
    expect(needed(5, 'medium')).toBe(3);
    expect(needed(7, 'large')).toBe(4);
  });

  it('gives the Conquest victory at the capture of the planet', () => {
    const s = newGame(settings);
    ownedPlanets(s, 1)[0].owner = 0;
    meet(s, 0, 2);
    declareWar(s, 0, 2);
    const target = ownedPlanets(s, 2)[0];
    const hex = neighbors(s, target.hex).find((i) => s.hexes[i].terrain !== 'star' && !s.units.some((u) => u.hex === i))!;
    const troops = createUnit(s, 0, 'assault_lander', hex);
    target.hp = 0;
    target.garrisonHp = 5;
    expect(invade(s, troops, target.hex)!.won).toBe(true);
    expect(s.winner).toEqual({ faction: 0, kind: 'conquest', turn: s.turn });
  });

  it('keeps a Conquest victory when another faction completes the Exodus Gate later', () => {
    const s = newGame(settings);
    gateReady(s);
    ownedPlanets(s, 2)[0].owner = 0;
    ownedPlanets(s, 3)[0].owner = 0;
    endTurn(s);
    expect(s.winner).toEqual({ faction: 0, kind: 'conquest', turn: 1 });
  });

  it('stops the turn when production gives the Science victory', () => {
    const s = newGame(settings);
    gateReady(s);
    const units = JSON.stringify(s.units);
    endTurn(s);
    expect(s.winner).toEqual({ faction: 1, kind: 'science', turn: 1 });
    expect(JSON.stringify(s.units)).toBe(units);
    expect(s.turn).toBe(1);
  });
});

describe('save files', () => {
  const played = () => {
    const s = newGame(settings);
    for (let i = 0; i < 15; i++) endTurn(s);
    return s;
  };
  const file = (s: GameState) => JSON.parse(JSON.stringify(encodeSave(s, '2026-01-01')));

  it('accepts a save of the current version without a change', () => {
    const s = played();
    const out = decodeSave(file(s));
    expect(out).not.toBeNull();
    expect(JSON.stringify(out!.state)).toBe(JSON.stringify(s));
  });

  it('rejects data that is not a valid state', () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave({ version: SAVE_VERSION, date: '', state: { hexes: [], factions: [] } })).toBeNull();
    const later = file(played());
    later.version = SAVE_VERSION + 1;
    expect(decodeSave(later)).toBeNull();
    const badUnit = file(played());
    badUnit.state.units[0].type = 'no_such_unit';
    expect(decodeSave(badUnit)).toBeNull();
    const badRoute = file(played());
    badRoute.state.planets[0].routes = [9999];
    expect(decodeSave(badRoute)).toBeNull();
    const badSize = file(played());
    badSize.state.hexes.pop();
    expect(decodeSave(badSize)).toBeNull();
  });

  it('migrates a save of version 1', () => {
    const old = file(played());
    old.version = 1;
    old.state.version = 1;
    delete old.state.factions[0].budget;
    old.state.factions[0].techs.push('warrior_caste');
    const out = decodeSave(old)!;
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.state.version).toBe(SAVE_VERSION);
    expect(out.state.factions[0].budget).toEqual({ research: 0, welfare: 0 });
    expect(out.state.factions[0].techs).toContain('blessed_hulls');
    expect(out.state.factions[0].techs).not.toContain('warrior_caste');
  });
});

describe('hall of captains', () => {
  it('has 99 captains, at most 10 from Star Trek and at most half human, and one Star Trek captain at the top', () => {
    expect(CAPTAINS.length).toBe(99);
    expect(new Set(CAPTAINS.map((c) => c.name)).size).toBe(99);
    expect(CAPTAINS.filter((c) => /Star Trek/.test(c.source)).length).toBeLessThanOrEqual(10);
    expect(CAPTAINS.filter((c) => c.human).length * 2).toBeLessThanOrEqual(CAPTAINS.length);
    expect(/Star Trek/.test(CAPTAINS[CAPTAINS.length - 2].source)).toBe(false);
    expect(CAPTAINS.map((c) => c.name)).toContain('Zaphod Beeblebrox');
  });

  it('ranks a win above a loss, a fast win above a slow one, and an eliminated faction at the bottom', () => {
    expect(leadership(true, false, 90, 500, 500)).toBeGreaterThan(leadership(true, false, 180, 500, 500));
    expect(leadership(true, false, 180, 500, 500)).toBeGreaterThan(leadership(false, false, 120, 500, 500));
    expect(leadership(false, false, 120, 250, 500)).toBeGreaterThan(leadership(false, true, 120, 250, 500));
    expect(slotOf(leadership(false, true, 100, 0, 500))).toBeLessThanOrEqual(5);
    expect(slotOf(leadership(true, false, 80, 900, 900))).toBe(99);
  });
});

describe('calendar', () => {
  it('counts ten shifts to a rota and ten rotas to a ledger', () => {
    expect(calendarDate(1)).toEqual({ ledger: 1, rota: 1, shift: 1 });
    expect(calendarDate(10)).toEqual({ ledger: 1, rota: 1, shift: 10 });
    expect(calendarDate(36)).toEqual({ ledger: 1, rota: 4, shift: 6 });
    expect(calendarDate(101)).toEqual({ ledger: 2, rota: 1, shift: 1 });
    expect(dateShort(36)).toBe('L1·R4·S6');
    expect(dateLong(36)).toBe('Shift 6 of Rota 4, Ledger 1');
  });
});

describe('build options', () => {
  it('keeps the Frigate while the Phase Cruiser lacks its resource', () => {
    const s = newGame({ ...settings, playerSpecies: 'vessani' });
    const f = s.factions[0];
    f.techs.push('kinetic_weapons', 'helium_refining');
    const names = () => buildOptions(s, ownedPlanets(s, 0)[0]).filter((o) => o.item.kind === 'unit');
    expect(names().find((o) => o.item.id === 'frigate')?.ok).toBe(true);
    expect(names().find((o) => o.item.id === 'vessani_phase_cruiser')?.ok).toBe(false);
    expect(names().some((o) => o.item.id === 'corvette')).toBe(false);
    // The Battleship can be built, but the Phase Cruiser cannot: the Frigate stays as the cheap warship.
    const home0 = ownedPlanets(s, 0)[0];
    const hex0 = s.hexes.findIndex((h) => h.owner === home0.id && h.terrain !== 'planet');
    f.techs.push('heavy_armour');
    s.hexes[hex0].resource = 'neutronium';
    s.hexes[hex0].station = true;
    expect(names().find((o) => o.item.id === 'battleship')?.ok).toBe(true);
    expect(names().find((o) => o.item.id === 'frigate')?.ok).toBe(true);
    expect(names().some((o) => o.item.id === 'corvette')).toBe(false);
    // The species ship stays on the list with its reason, although the Battleship replaces it.
    expect(names().find((o) => o.item.id === 'vessani_phase_cruiser')?.reason).toBe('Needs Helium-3');
    // With Helium-3 connected, the Frigate is obsolete.
    const home = ownedPlanets(s, 0)[0];
    const hex = s.hexes.findIndex((h) => h.owner === home.id && h.terrain !== 'planet');
    s.hexes[hex].resource = 'helium3';
    s.hexes[hex].station = true;
    expect(names().some((o) => o.item.id === 'frigate')).toBe(false);
    expect(names().find((o) => o.item.id === 'vessani_phase_cruiser')?.ok).toBe(true);
  });
});

describe('movement and combat', () => {
  it('moves a unit along a path', () => {
    const s = newGame(settings);
    const u = s.units.find((x) => x.owner === 0 && x.type === 'scout')!;
    const target = freeHexNear(s, u.hex, 2);
    expect(findPath(s, u, target)).not.toBeNull();
    expect(orderMove(s, u, target)).toBe(true);
    expect(u.hex).toBe(target);
  });

  it('damages both units in a melee attack', () => {
    const s = newGame(settings);
    const home = ownedPlanets(s, 0)[0];
    const a = freeHexNear(s, home.hex, 3);
    const b = neighbors(s, a).find((i) => s.hexes[i].terrain === 'space' && !s.units.some((u) => u.hex === i))!;
    meet(s, 0, 1);
    declareWar(s, 0, 1);
    const mine = createUnit(s, 0, 'frigate', a);
    const theirs = createUnit(s, 1, 'corvette', b);
    const res = attack(s, mine, b)!;
    expect(res.toDefender).toBeGreaterThan(res.toAttacker);
    expect(theirs.hp).toBeLessThan(100);
    expect(mine.attacked).toBe(true);
  });

  it('moves next to a distant enemy and attacks it', () => {
    const s = newGame(settings);
    const home = ownedPlanets(s, 0)[0];
    const a = freeHexNear(s, home.hex, 3);
    const b = within(s, a, 3).find((i) => distance(s, i, a) === 2 && s.hexes[i].terrain === 'space' && !s.units.some((u) => u.hex === i))!;
    meet(s, 0, 1);
    declareWar(s, 0, 1);
    const mine = createUnit(s, 0, 'frigate', a);
    const theirs = createUnit(s, 1, 'corvette', b);
    const fight = engage(s, mine, b)!;
    expect(fight).not.toBeNull();
    expect(distance(s, mine.hex, b)).toBe(1);
    expect(fight.result).not.toBeNull();
    expect(theirs.hp).toBeLessThan(100);
  });

  it('gives the preview of an attack from another hex without a move of the unit', () => {
    const s = newGame(settings);
    const home = ownedPlanets(s, 0)[0];
    const a = freeHexNear(s, home.hex, 3);
    const b = within(s, a, 3).find((i) => distance(s, i, a) === 2 && s.hexes[i].terrain === 'space' && !s.units.some((u) => u.hex === i))!;
    const between = neighbors(s, a).find((i) => distance(s, i, b) === 1 && s.hexes[i].terrain === 'space')!;
    meet(s, 0, 1);
    declareWar(s, 0, 1);
    const mine = createUnit(s, 0, 'frigate', a);
    createUnit(s, 1, 'corvette', b);
    const before = JSON.stringify(s);
    expect(canAttack(s, mine, b)).toBe(false);
    expect(canAttack(s, mine, b, between)).toBe(true);
    const planned = preview(s, mine, b, between)!;
    expect(JSON.stringify(s)).toBe(before);
    mine.hex = between;
    expect(preview(s, mine, b)).toEqual(planned);
  });

  it('captures a planet with ground troops when the defences are down', () => {
    const s = newGame(settings);
    meet(s, 0, 1);
    declareWar(s, 0, 1);
    const target = ownedPlanets(s, 1)[0];
    const hex = neighbors(s, target.hex).find((i) => s.hexes[i].terrain !== 'star' && !s.units.some((u) => u.hex === i))!;
    const troops = createUnit(s, 0, 'assault_lander', hex);
    expect(canInvade(s, troops, target.hex)).toBe(false);
    target.hp = 0;
    target.garrisonHp = 5;
    const res = invade(s, troops, target.hex)!;
    expect(res.won).toBe(true);
    expect(target.owner).toBe(0);
    expect(s.factions[1].alive).toBe(false);
  });
});

describe('infiltration', () => {
  const setup = (species: GameSettings['playerSpecies']) => {
    const s = newGame({ ...settings, playerSpecies: species });
    meet(s, 0, 1);
    declareWar(s, 0, 1);
    const target = ownedPlanets(s, 1)[0];
    const hex = neighbors(s, target.hex).find((i) => !s.units.some((u) => u.hex === i))!;
    s.factions[0].techs.push('kinetic_weapons', 'ground_forces');
    const type = UNIT_LIST.find((d) => d.ground && unitAllowed(s.factions[0], d))!.id;
    return { s, target, troops: createUnit(s, 0, type, hex) };
  };

  it('lets Vessani troops invade a planet with its defences up, at 50% strength', () => {
    const { s, target, troops } = setup('vessani');
    expect(target.hp).toBeGreaterThan(0);
    expect(canInvade(s, troops, target.hex)).toBe(true);
    const up = invasionStrength(s, troops, target);
    target.hp = 0;
    expect(up).toBeCloseTo(invasionStrength(s, troops, target) * 0.5);
    target.hp = 10;
    target.garrisonHp = 1;
    expect(invade(s, troops, target.hex)!.won).toBe(true);
    expect(target.owner).toBe(0);
  });

  it('keeps the troops of other species out while the defences are up', () => {
    const { s, target, troops } = setup('terran');
    expect(canInvade(s, troops, target.hex)).toBe(false);
    expect(invade(s, troops, target.hex)).toBeNull();
    target.hp = 0;
    expect(canInvade(s, troops, target.hex)).toBe(true);
  });
});

describe('forum', () => {
  it('elects the faction that the members like, and gives the victory', () => {
    const s = newGame(settings);
    const n = realFactions(s).length;
    s.forum = { founder: 0, host: ownedPlanets(s, 0)[0].id, members: realFactions(s).map((f) => f.id), leader: -1, nextElection: s.turn, lastVotes: {} };
    for (let a = 1; a < n; a++) s.attitude[a][0] = 90;
    forumTick(s);
    expect(s.forum!.leader).toBe(0);
    expect(s.winner).toEqual({ faction: 0, kind: 'forum', turn: s.turn });
  });

  it('lets a human member choose its vote, and rewards a vote for the leader', () => {
    const s = newGame(settings);
    // A war declared before the Forum exists: a member at war cannot vote for its enemy.
    meet(s, 0, 2);
    declareWar(s, 0, 2);
    s.forum = { founder: 1, host: ownedPlanets(s, 1)[0].id, members: [0, 1, 2, 3], leader: -1, nextElection: s.turn, lastVotes: {} };
    expect(voteOf(s, 0)).toBe(0);
    expect(setVote(s, 0, 0)).toBe(false);
    expect(setVote(s, 0, 2)).toBe(false);
    expect(setVote(s, 0, 1)).toBe(true);
    expect(voteOf(s, 0)).toBe(1);
    // The other AI members like faction 1 enough to vote for it.
    s.attitude[2][1] = 90;
    s.attitude[3][1] = 90;
    forumTick(s);
    expect(s.forum!.leader).toBe(1);
    expect(s.factions[0].vote).toBeUndefined();
    expect(supporter(s, 0)).toBe(true);
    expect(canDeclareWar(s, 1, 0)).toBe(false);
    const before = s.factions[0].influence;
    startFactionTurn(s, s.factions[0]);
    const inc = empireIncome(s, s.factions[0]);
    expect(s.factions[0].influence - before).toBeCloseTo(inc.inf + FORUM_MEMBER_INFLUENCE + FORUM_SUPPORTER_INFLUENCE, 5);
  });

  it('counts a faction outside the Forum as a vote against the winner', () => {
    const s = newGame(settings);
    const n = realFactions(s).length;
    // 4 factions need 3 votes. With one faction outside, all 3 members must vote for the winner.
    s.forum = { founder: 0, host: ownedPlanets(s, 0)[0].id, members: [0, 1, 2], leader: -1, nextElection: s.turn, lastVotes: {} };
    expect(n).toBe(4);
    s.attitude[1][0] = 90;
    forumTick(s);
    expect(s.forum!.leader).toBe(0);
    expect(s.winner).toBeNull();
    s.attitude[2][0] = 90;
    s.forum!.nextElection = s.turn;
    forumTick(s);
    expect(s.winner).toEqual({ faction: 0, kind: 'forum', turn: s.turn });
  });

  it('tells an invitation that is not possible from one that the faction refuses', () => {
    const s = newGame(settings);
    expect(invite(s, 1)).toBe('invalid');
    s.forum = { founder: 0, host: ownedPlanets(s, 0)[0].id, members: [0], leader: -1, nextElection: s.turn + 10, lastVotes: {} };
    s.factions[0].influence = INVITE_COST - 1;
    const before = JSON.stringify(s);
    expect(invite(s, 1)).toBe('invalid');
    expect(JSON.stringify(s)).toBe(before);

    s.factions[0].influence = 2 * INVITE_COST;
    meet(s, 0, 1);
    s.attitude[1][0] = 0;
    expect(invite(s, 1)).toBe('refused');
    expect(s.factions[0].influence).toBe(INVITE_COST);
    expect(s.forum.members).toEqual([0]);

    s.attitude[1][0] = 50;
    expect(invite(s, 1)).toBe('joined');
    expect(s.factions[0].influence).toBe(0);
    expect(s.forum.members).toEqual([0, 1]);
  });

  it('gives no victory when the members prefer themselves', () => {
    const s = newGame(settings);
    s.forum = { founder: 0, host: ownedPlanets(s, 0)[0].id, members: realFactions(s).map((f) => f.id), leader: -1, nextElection: s.turn, lastVotes: {} };
    forumTick(s);
    expect(s.winner).toBeNull();
  });
});

describe('knowledge of a captured planet', () => {
  it('gives a technology to the new owner and takes one from the old owner', () => {
    const s = newGame(settings);
    const old = s.factions[1];
    const colony = s.planets.find((p) => p.owner < 0)!;
    settle(s, colony, 1);
    old.techs.push('orbital_mining', 'kinetic_weapons', 'ground_forces');
    const before = [...old.techs];
    const mine = s.factions[0].techs.length;
    capture(s, colony, 0);
    expect(s.factions[0].techs.length).toBe(mine + 1);
    expect(before).toContain(s.factions[0].techs[mine]);
    expect(old.techs.length).toBe(before.length - 1);
    // The lost technology is one that no other technology of the faction needs.
    const lost = before.find((id) => !old.techs.includes(id))!;
    expect(old.techs.some((id) => TECHS[id].prereqs.includes(lost))).toBe(false);
    expect(validateState(JSON.parse(JSON.stringify(s)))).toBeNull();
  });

  it('gives a species technology and its units at the capture of a home planet', () => {
    const s = newGame(settings);
    const old = s.factions[1];
    const own = TECH_LIST.filter((t) => t.species === old.species);
    for (const t of own) old.techs.push(t.id);
    const home = s.planets.find((p) => p.homeOf === 1)!;
    const f = s.factions[0];
    capture(s, home, 0);
    const got = f.techs.filter((id) => TECHS[id].species === old.species);
    expect(got.length).toBe(1);
    for (const u of UNIT_LIST.filter((d) => d.species === old.species && d.tech === got[0])) expect(unitAllowed(f, u), u.id).toBe(true);
    for (const u of UNIT_LIST.filter((d) => d.species === old.species && d.tech !== got[0])) expect(unitAllowed(f, u), u.id).toBe(false);
  });
});

describe('advisors', () => {
  it('suggests production that the planet can build, with a reason', () => {
    const s = newGame(settings);
    const home = ownedPlanets(s, 0)[0];
    const before = JSON.stringify(s);
    const advice = productionAdvice(s, home);
    expect(JSON.stringify(s)).toBe(before);
    expect(advice.length).toBeGreaterThan(0);
    expect(new Set(advice.map((a) => a.field)).size).toBe(advice.length);
    const ok = buildOptions(s, home).filter((o) => o.ok);
    for (const a of advice) {
      expect(ok.some((o) => o.item.kind === a.item.kind && o.item.id === a.item.id), a.field).toBe(true);
      expect(a.reason.length).toBeGreaterThan(10);
    }
    expect(advice.find((a) => a.field === 'military')?.item.kind).toBe('unit');
  });

  it('suggests research that the faction can reach, in the field of the advisor', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    const advice = researchAdvice(s, f);
    expect(advice.map((a) => a.field)).toEqual(expect.arrayContaining(['military', 'economy', 'science', 'growth']));
    for (const a of advice) {
      expect(techAvailable(f, a.tech)).toBe(true);
      expect(f.techs).not.toContain(a.tech);
      expect(researchPath(f, a.tech).length).toBe(a.steps);
    }
    expect(TECHS[advice.find((a) => a.field === 'military')!.tech].category).toBe('military');
    setResearch(s, f, advice[0].tech);
    expect(f.researching).toBeDefined();
  });
});

describe('events', () => {
  it('records moves, damage and captures as data', () => {
    const s = newGame(settings);
    const events = recordEvents(s);
    const u = s.units.find((x) => x.owner === 0 && x.type === 'scout')!;
    const from = u.hex;
    const target = freeHexNear(s, u.hex, 1);
    orderMove(s, u, target);
    expect(events).toContainEqual({ kind: 'unitMoved', unit: u.id, owner: 0, from, to: target, turn: s.turn });

    events.length = 0;
    meet(s, 0, 1);
    declareWar(s, 0, 1);
    const a = freeHexNear(s, target, 3);
    const b = neighbors(s, a).find((i) => s.hexes[i].terrain === 'space' && !s.units.some((x) => x.hex === i))!;
    const mine = createUnit(s, 0, 'frigate', a);
    const theirs = createUnit(s, 1, 'corvette', b);
    const res = attack(s, mine, b)!;
    expect(events.map((e) => e.kind)).toContain('warDeclared');
    expect(events).toContainEqual({ kind: 'unitDamaged', unit: theirs.id, owner: 1, hex: b, amount: res.toDefender, turn: s.turn });

    const planet = ownedPlanets(s, 1)[0];
    capture(s, planet, 0);
    expect(events).toContainEqual({ kind: 'planetCaptured', planet: planet.id, from: 1, by: 0, turn: s.turn });
    expect(events).toContainEqual({ kind: 'factionEliminated', faction: 1, by: 0, turn: s.turn });
  });

  it('keeps the events out of the game state', () => {
    const s = newGame(settings);
    const plain = newGame(settings);
    recordEvents(s);
    for (const x of [s, plain]) for (let t = 0; t < 5; t++) endTurn(x);
    expect(JSON.stringify(s)).toBe(JSON.stringify(plain));
  });
});

describe('debug log', () => {
  it('is off at the start and writes more lines at a more verbose level', () => {
    expect(debugLevel()).toBe('off');
    const count = (level: 'off' | 'major' | 'minor' | 'trace') => {
      const lines: string[] = [];
      setDebugSink((l) => lines.push(l));
      setDebugLevel(level);
      const s = newGame(settings);
      for (const f of s.factions) f.isHuman = false;
      for (let t = 0; t < 3; t++) endTurn(s);
      setDebugLevel('off');
      setDebugSink();
      return { lines, state: JSON.stringify(s) };
    };
    const off = count('off');
    const major = count('major');
    const minor = count('minor');
    const trace = count('trace');
    expect(off.lines).toEqual([]);
    expect(major.lines.length).toBeGreaterThan(0);
    expect(minor.lines.length).toBeGreaterThan(major.lines.length);
    expect(trace.lines.length).toBeGreaterThan(minor.lines.length);
    expect(major.lines.some((l) => /^\[t1\] AI player #1 \(.+\): Evaluated \d+ research options/.test(l))).toBe(true);
    expect(trace.lines.some((l) => /unit #\d+ of #\d+ \(.+\) moved from @ \d+,\d+ to @ \d+,\d+/.test(l))).toBe(true);
    // The log does not change the game.
    expect(trace.state).toBe(off.state);
  });
});

describe('simulation', () => {
  it('runs 80 turns with AI factions and keeps the state valid', () => {
    const s = newGame({ ...settings, galaxy: 'medium', opponents: 4 });
    for (const f of s.factions) f.isHuman = false;
    for (let t = 0; t < 80 && !s.winner; t++) {
      endTurn(s);
      const seen = new Set<string>();
      for (const u of s.units) {
        const key = `${u.hex}-${UNITS[u.type].cls}`;
        expect(seen.has(key), `two ${UNITS[u.type].cls} units on hex ${u.hex} on turn ${s.turn}`).toBe(false);
        seen.add(key);
        expect(s.hexes[u.hex].terrain).not.toBe('star');
        expect(u.hp).toBeGreaterThan(0);
      }
      for (const p of s.planets) if (p.owner >= 0) expect(p.pop).toBeGreaterThanOrEqual(1);
      expect(validateState(JSON.parse(JSON.stringify(s)))).toBeNull();
    }
    expect(realFactions(s).some((f) => ownedPlanets(s, f.id).length >= 3)).toBe(true);
  });
});

describe('budget', () => {
  it('turns a share of the credit surplus into science and morale', () => {
    const s = newGame(settings);
    const f = s.factions[0];
    const before = empireIncome(s, f);
    expect(before.surplus).toBeGreaterThan(0);
    f.budget = { research: 50, welfare: 0 };
    const after = empireIncome(s, f);
    expect(after.sci).toBeCloseTo(before.sci + before.surplus * 0.5, 5);
    expect(after.cred).toBeCloseTo(before.surplus * 0.5, 5);
    f.budget = { research: 0, welfare: 100 };
    expect(empireIncome(s, f).morale.total).toBeGreaterThan(before.morale.total);
  });
});

describe('technology lore', () => {
  it('exists for every technology and for nothing else', () => {
    for (const t of TECH_LIST) expect(TECH_LORE[t.id], t.id).toBeTruthy();
    for (const id of Object.keys(TECH_LORE)) expect(TECHS[id], id).toBeDefined();
  });
});

describe('lore', () => {
  it('exists for every unit, building, project, biome, planet type and resource', () => {
    for (const u of UNIT_LIST) expect(UNIT_LORE[u.id], u.id).toBeTruthy();
    for (const b of BUILDING_LIST) expect(BUILDING_LORE[b.id], b.id).toBeTruthy();
    for (const p of Object.values(PROJECTS)) expect(PROJECT_LORE[p.id], p.id).toBeTruthy();
    for (const t of Object.values(TERRAIN)) if (t.id !== 'planet') expect(TERRAIN_LORE[t.id], t.id).toBeTruthy();
    for (const p of Object.values(PLANET_TYPES)) expect(PLANET_LORE[p.id], p.id).toBeTruthy();
    for (const r of Object.values(RESOURCES)) expect(RESOURCE_LORE[r.id], r.id).toBeTruthy();
    for (const id of Object.keys(UNIT_LORE)) expect(UNITS[id], id).toBeDefined();
    for (const id of Object.keys(BUILDING_LORE)) expect(BUILDINGS[id], id).toBeDefined();
  });
});

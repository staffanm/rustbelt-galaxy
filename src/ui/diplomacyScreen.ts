import { SPECIES } from '../core/data/species';
import { TECHS } from '../core/data/techs';
import {
  ENVOY_INTERVAL,
  PEACE_TREATY_TURNS,
  aiAcceptsDeal,
  aiAcceptsOpenBorders,
  aiAcceptsPeace,
  attitudeLabel,
  attitudeTarget,
  canDeclareWar,
  canSendEnvoys,
  declareWar,
  envoyCost,
  envoyGain,
  giftCredits,
  makePeace,
  militaryStrength,
  proposeDeal,
  sendEnvoys,
  setOpenBorders,
  tradableTechs,
  techValue,
  type Deal,
} from '../core/diplomacy';
import {
  INVITE_COST,
  JOIN_ATTITUDE,
  LOBBY_GAIN,
  acceptsInvitation,
  canApply,
  invite,
  join,
  livingFactions,
  lobby,
  lobbyCost,
  support,
  voteOf,
  votesNeeded,
} from '../core/forum';
import { dateShort } from '../core/calendar';
import { ownedPlanets, realFactions, relation } from '../core/rules';
import type { Faction } from '../core/types';
import { score } from '../core/victory';
import type { App } from './app';
import { leaderPortrait } from './art';
import { button, fmt, h, img, signed } from './dom';
import { frame, plural } from './screens';

let dealWith = -1;
let deal: Deal = { giveCredits: 0, giveTechs: [], takeCredits: 0, takeTechs: [] };
let answer = '';

function strengthWord(mine: number, theirs: number): string {
  if (theirs > mine * 1.5) return 'much stronger than yours';
  if (theirs > mine * 1.15) return 'stronger than yours';
  if (theirs < mine * 0.66) return 'much weaker than yours';
  if (theirs < mine * 0.87) return 'weaker than yours';
  return 'about equal to yours';
}

function attitudeBox(app: App, o: Faction): HTMLElement {
  const s = app.s;
  const att = s.attitude[o.id][app.me];
  const target = attitudeTarget(s, o.id, app.me);
  const cls = att >= 20 ? 'good' : att <= -20 ? 'bad' : '';
  // The attitude moves 1 point per shift to the sum of the reasons. Gifts, envoys and declarations of war change it at once.
  const gap = Math.abs(target.total - att);
  const trend =
    gap === 0
      ? ', steady'
      : `, ${target.total > att ? 'rises' : 'falls'} 1 per shift to ${signed(target.total)} (${plural(gap, 'shift')})`;
  const reasons = target.parts.length
    ? target.parts.map((p, i) => [i ? ', ' : '', `${p.label} `, h(`span.${p.value > 0 ? 'good' : 'bad'}`, null, signed(p.value))])
    : 'none';
  return h(
    'div',
    null,
    h('div', null, 'Attitude to you: ', h(`b.${cls || 'plain'}`, null, `${attitudeLabel(att)} (${signed(att)})`), h('span.dim', null, trend)),
    h('div.dim', { title: 'The reasons are in their words: "our" is this faction, "their" is you. The sum is the value that the attitude moves to.' }, 'Their reasons: ', reasons),
  );
}

function card(app: App, o: Faction): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const sp = SPECIES[o.species];
  if (!o.alive) {
    return h('div.faction.dead', null, h('div.row', null, img(leaderPortrait(o.species), 64, 'portrait'), h('div', null, h('div.head', { style: { color: o.color } }, o.name), h('div.dim', null, 'Eliminated'))));
  }
  if (!f.met.includes(o.id)) {
    return h('div.faction.unknown', null, h('div.row', null, h('div.portrait.unknownface', null, '?'), h('div', null, h('div.head', null, 'Unknown faction'), h('div.dim', null, 'You have not met this faction. Explore the galaxy to find it.'))));
  }
  const pr = relation(s, app.me, o.id);
  const mine = militaryStrength(s, app.me);
  const theirs = militaryStrength(s, o.id);
  const actions: HTMLElement[] = [];
  const say = (text: string) => {
    answer = `${sp.leader}: ${text}`;
    dealWith = dealWith === o.id ? o.id : dealWith;
    app.refresh();
  };
  if (pr.atWar) {
    if (pr.peaceOfferedBy === o.id) {
      actions.push(button('Accept the peace offer', () => (makePeace(s, app.me, o.id), say('"A wise decision. We will send the paperwork."')), { cls: 'good' }));
    } else {
      actions.push(
        button('Propose peace', () => {
          if (aiAcceptsPeace(s, o.id, app.me)) {
            makePeace(s, app.me, o.id);
            say('"Agreed. The war was becoming expensive."');
          } else say('"No. We are not finished."');
        }),
      );
    }
  } else {
    const treaty = pr.lastChange > 0 && s.turn - pr.lastChange < PEACE_TREATY_TURNS;
    actions.push(
      button(
        'Declare war',
        () => {
          if (confirm(`Declare war on the ${o.name}? Other factions will like you less.`)) {
            declareWar(s, app.me, o.id);
            say('"You will regret this. We keep a list."');
          }
        },
        { cls: 'danger', disabled: !canDeclareWar(s, app.me, o.id), title: treaty ? `The peace treaty lasts ${PEACE_TREATY_TURNS - (s.turn - pr.lastChange)} more shifts.` : '' },
      ),
    );
    if (pr.openBorders) actions.push(button('Close borders', () => (setOpenBorders(s, app.me, o.id, false), say('"As you wish. Your ships have been shown the way out."'))));
    else {
      actions.push(
        button(
          'Ask for open borders',
          () => {
            if (aiAcceptsOpenBorders(s, o.id, app.me)) {
              setOpenBorders(s, app.me, o.id, true);
              say('"Your ships can pass. Keep them clean."');
            } else say('"We do not know you well enough. Our borders stay closed."');
          },
          { title: 'Both factions can then move units through the borders of the other. They accept when their attitude is +10 or more.' },
        ),
      );
    }
    const cost = envoyCost(s, app.me);
    const last = f.envoys[o.id];
    const wait = last !== undefined ? ENVOY_INTERVAL - (s.turn - last) : 0;
    actions.push(
      button(`Send envoys (${cost} influence)`, () => (sendEnvoys(s, app.me, o.id), say('"Your envoys are charming. They also eat a lot."')), {
        disabled: !canSendEnvoys(s, app.me, o.id),
        title: wait > 0 ? `You can send envoys again in ${wait} shifts.` : `Their attitude to you rises by ${envoyGain(s, app.me, o.id)}.`,
      }),
    );
    actions.push(button('Gift 50 credits', () => (giftCredits(s, app.me, o.id, 50), say('"A gift. How unexpected. How small."')), { disabled: f.credits < 50, title: 'Their attitude to you rises by 6.' }));
    actions.push(
      button(dealWith === o.id ? 'Close the trade table' : 'Trade', () => {
        dealWith = dealWith === o.id ? -1 : o.id;
        deal = { giveCredits: 0, giveTechs: [], takeCredits: 0, takeTechs: [] };
        answer = '';
        app.refresh();
      }),
    );
  }
  return h(
    `div.faction${pr.atWar ? '.war' : ''}`,
    { style: { borderColor: o.color } },
    h(
      'div.row',
      null,
      img(leaderPortrait(o.species), 80, 'portrait'),
      h(
        'div.grow',
        null,
        h('div.head', { style: { color: o.color } }, o.name),
        h('div', null, `${sp.leader}, ${sp.archetype}`),
        h('div', null, pr.atWar ? h('b.bad', null, 'At war') : h('b.good', null, 'At peace'), pr.openBorders ? ', open borders' : '', pr.peaceOfferedBy === o.id ? h('span.good', null, ' They offer peace.') : null),
        attitudeBox(app, o),
        h('div.dim', null, `${plural(ownedPlanets(s, o.id).length, 'planet')}, ${plural(o.techs.length, 'technology', 'technologies')}, ${score(s, o.id)} points. Their fleet is ${strengthWord(mine, theirs)}.`),
      ),
    ),
    h('div.buttons', null, actions),
    dealWith === o.id && !pr.atWar ? table(app, o) : null,
    answer && answer.startsWith(sp.leader) ? h('div.answer', null, answer) : null,
  );
}

function table(app: App, o: Faction): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const side = (title: string, from: number, to: number, techs: string[], credits: number, max: number, setCredits: (n: number) => void) => {
    const input = h('input', { type: 'number', min: '0', max: String(Math.floor(max)), step: '10', value: String(credits) }) as HTMLInputElement;
    input.addEventListener('change', () => {
      setCredits(Math.max(0, Math.min(Math.floor(max), Number(input.value) || 0)));
      app.refresh();
    });
    const options = tradableTechs(s, from, to);
    return h(
      'div.side',
      null,
      h('div.section', null, title),
      h('label.field', null, h('span', null, `Credits (of ${fmt(max)})`), input),
      options.map((id) => {
        const box = h('input', { type: 'checkbox', checked: techs.includes(id) }) as HTMLInputElement;
        box.addEventListener('change', () => {
          if (box.checked) techs.push(id);
          else techs.splice(techs.indexOf(id), 1);
          app.refresh();
        });
        return h('label.check', { title: TECHS[id].text }, box, ` ${TECHS[id].name} `, h('span.dim', null, `value ${techValue(s, s.factions[to], id)}`));
      }),
      options.length ? null : h('div.dim', null, 'No technology to trade'),
    );
  };
  const ok = aiAcceptsDeal(s, app.me, o.id, deal);
  return h(
    'div.dealtable',
    null,
    h(
      'div.row.top',
      null,
      side('You give', app.me, o.id, deal.giveTechs, deal.giveCredits, f.credits, (n) => (deal.giveCredits = n)),
      side('You get', o.id, app.me, deal.takeTechs, deal.takeCredits, o.credits, (n) => (deal.takeCredits = n)),
    ),
    h(
      'div.row',
      null,
      button('Propose the deal', () => {
        if (proposeDeal(s, app.me, o.id, deal)) {
          deal = { giveCredits: 0, giveTechs: [], takeCredits: 0, takeTechs: [] };
          answer = `${SPECIES[o.species].leader}: "Done. A pleasure, within reason."`;
        } else answer = `${SPECIES[o.species].leader}: "No. Offer more or ask for less."`;
        app.refresh();
      }),
      h('span.dim', null, ok ? 'They will accept this deal.' : 'They will not accept this deal. A better attitude gives better prices.'),
    ),
  );
}

export function renderDiplomacy(app: App): HTMLElement {
  const s = app.s;
  const others = realFactions(s).filter((o) => o.id !== app.me);
  return frame(
    app,
    'Diplomacy',
    [
      h('div.dim', null, 'Attitude shows how much a faction likes you. It changes what they accept. Each faction lists its reasons, and the attitude moves 1 point per shift to the sum of them.'),
      h(
        'div',
        { title: 'Points: 6 for each technology, 10 for each planet, 3 for each population point, 2 for each building. Points rank the factions. They have no other effect.' },
        `You: ${plural(ownedPlanets(s, app.me).length, 'planet')}, ${plural(app.faction.techs.length, 'technology', 'technologies')}, ${score(s, app.me)} points. `,
        h('span.dim', null, 'Points count technologies, planets, population and buildings. They rank the factions and have no other effect.'),
      ),
      h('div.factions.keepscroll', { 'data-id': 'diplo' }, others.map((o) => card(app, o))),
    ],
    { wide: true },
  );
}

export function renderForum(app: App): HTMLElement {
  const s = app.s;
  const f = app.faction;
  const forum = s.forum;
  const rules = h(
    'div.rules',
    null,
    h('div.section', null, 'Rules'),
    h('ul', null, [
      'One faction founds the Forum with the Forum Station project. The technology Interstellar Forum permits the project.',
      `The founder invites the other factions. An invitation costs ${INVITE_COST} influence. A faction accepts when its attitude to the founder is +${JOIN_ATTITUDE} or more and they are not at war.`,
      'The members elect a leader each 10 shifts. Each member votes for the faction that it supports most. A faction supports itself also.',
      `Support is attitude plus lobby points. A lobby action gives +${LOBBY_GAIN} support from one member until the election. Each action on the same member costs more.`,
      'You win when you get more than half of the votes of all factions. A faction outside the Forum has no vote.',
      'A member that declares war on another member leaves the Forum.',
      'Members get +1 influence per shift. The leader gets +3.',
    ].map((t) => h('li', null, t))),
  );
  if (!forum) {
    const has = f.techs.includes('interstellar_forum');
    return frame(app, 'Interstellar Forum', [
      h('div.endtext', null, 'The Forum does not exist yet.'),
      h('div', null, has ? 'You have the technology. Build the Forum Station project on one of your planets.' : 'Research the technology Interstellar Forum. Then build the Forum Station project on one of your planets.'),
      rules,
    ]);
  }
  const founder = s.factions[forum.founder];
  const member = forum.members.includes(app.me);
  const living = livingFactions(s);
  const need = votesNeeded(living.length);
  const rows = living.map((o) => {
    const isMember = forum.members.includes(o.id);
    const cells: (HTMLElement | string | null)[] = [];
    cells.push(h('td', null, img(leaderPortrait(o.species), 40, 'portrait')));
    cells.push(h('td', { style: { color: o.color } }, o.name, o.id === app.me ? ' (you)' : '', o.id === forum.founder ? h('span.dim', null, ' founder') : null, o.id === forum.leader ? h('b.good', null, ' leader') : null));
    cells.push(h('td', null, isMember ? h('span.good', null, 'Member') : h('span.dim', null, 'Not a member')));
    if (o.id === app.me || !f.met.includes(o.id)) {
      cells.push(h('td', null, o.id === app.me ? '' : h('span.dim', null, 'Not met')));
      cells.push(h('td'));
      cells.push(h('td'));
      return h('tr', null, cells);
    }
    const att = s.attitude[o.id][app.me];
    cells.push(h('td', null, `Attitude ${signed(att)}`));
    if (isMember && member) {
      const mine = support(s, o.id, app.me);
      const pick = voteOf(s, o.id);
      const top = support(s, o.id, pick);
      cells.push(
        h(
          'td',
          { title: 'Support is attitude plus your lobby points.' },
          `Support for you ${fmt(mine)}. `,
          pick === app.me ? h('span.good', null, 'Votes for you.') : h('span.bad', null, `Votes for ${pick === o.id ? 'itself' : s.factions[pick].name} (${fmt(top)}).`),
        ),
      );
      const cost = lobbyCost(f, o.id);
      cells.push(h('td', null, button(`Lobby (${cost} influence)`, () => (lobby(s, app.me, o.id), app.refresh()), { disabled: f.influence < cost, cls: 'small' })));
    } else if (!isMember && forum.founder === app.me) {
      const will = acceptsInvitation(s, o.id);
      cells.push(h('td', null, will ? h('span.good', null, 'Will accept an invitation.') : h('span.bad', null, `Will refuse. Needs attitude +${JOIN_ATTITUDE} and peace with you.`)));
      cells.push(h('td', null, button(`Invite (${INVITE_COST} influence)`, () => (invite(s, o.id), app.refresh()), { disabled: f.influence < INVITE_COST, cls: 'small' })));
    } else {
      cells.push(h('td'));
      cells.push(h('td'));
    }
    return h('tr', null, cells);
  });
  const lastVotes = Object.entries(forum.lastVotes);
  return frame(
    app,
    'Interstellar Forum',
    [
      h('div', null, `Founder: `, h('b', { style: { color: founder.color } }, founder.name), `. Host planet: ${s.planets[forum.host].name}. Members: ${forum.members.length} of ${living.length} factions.`),
      h('div', null, `Next election: ${dateShort(forum.nextElection)} (in ${Math.max(0, forum.nextElection - s.turn)} shifts). Votes for a victory: ${need} of ${living.length}.`, forum.members.length < living.length ? ' A faction outside the Forum has no vote.' : ''),
      h('div', null, `Your influence: ${fmt(f.influence)}.`),
      !member
        ? h(
            'div.row',
            null,
            button('Join the Forum', () => (join(s, app.me), app.refresh()), { disabled: !canApply(s, app.me), cls: 'big' }),
            h('span.dim', null, canApply(s, app.me) ? 'The founder accepts you.' : 'The founder accepts you when its attitude to you is 0 or more and you are at peace.'),
          )
        : null,
      h('table.scores', null, rows),
      lastVotes.length ? h('div.dim', null, 'Last election: ' + lastVotes.map(([v, c]) => `${SPECIES[s.factions[Number(v)].species].adjective} voted for ${SPECIES[s.factions[Number(c)].species].adjective}`).join(', ') + '.') : null,
      rules,
    ],
    { wide: true },
  );
}

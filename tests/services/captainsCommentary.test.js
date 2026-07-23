import { describe, it, expect } from 'vitest';
import {
  describeGames,
  buildPreRoundPrompt,
  buildPostRoundPrompt,
  isCaptainSubscriber,
  isConfigured,
} from '../../src/services/captainsCommentary.js';

// Captain's Commentary prompt construction — verify all round data fields are
// correctly assembled into the prompt string the Edge Function receives.

const PRE = {
  courseName: 'Prestonwood Meadows',
  players: [
    { name: 'Peter Newton', handicapIndex: 9.6, characterNote: 'Sandbags every October.' },
    { name: 'Brooks Kaufman', handicapIndex: 11.0, characterNote: '' },
  ],
  games: [
    { label: 'Skins', detail: '$80 pool' },
    { label: 'Wolf', detail: '$2/pt' },
    { label: 'Snake', detail: '$10' },
    { label: 'Greenie', detail: '$2' },
  ],
  teams: null,
  captainNote: 'Brooks showed up hungover.',
};

describe('describeGames', () => {
  it('joins games with their bet detail', () => {
    expect(describeGames(PRE.games)).toBe('Skins ($80 pool), Wolf ($2/pt), Snake ($10), Greenie ($2)');
  });
  it('handles no games', () => {
    expect(describeGames([])).toBe('None');
    expect(describeGames(undefined)).toBe('None');
  });
});

describe('buildPreRoundPrompt', () => {
  const out = buildPreRoundPrompt(PRE);

  it('includes course, every player + handicap, and the games/bets', () => {
    expect(out).toContain('Course: Prestonwood Meadows.');
    expect(out).toContain('Peter Newton (handicap 9.6)');
    expect(out).toContain('Brooks Kaufman (handicap 11.0)');
    expect(out).toContain('Games: Skins ($80 pool), Wolf ($2/pt), Snake ($10), Greenie ($2).');
  });

  it('includes character notes (only for players that have one) and the captain note', () => {
    expect(out).toContain('- Peter Newton: Sandbags every October.');
    expect(out).not.toContain('- Brooks Kaufman:');
    expect(out).toContain('Captain’s note: Brooks showed up hungover.');
  });

  it('includes a teams line only when a team game is set', () => {
    expect(out).not.toContain('Teams:');
    const withTeams = buildPreRoundPrompt({
      ...PRE,
      teams: { A: ['Peter Newton', 'Brooks Kaufman'], B: ['Jim', 'JP'] },
    });
    expect(withTeams).toContain('Teams: Team A — Peter Newton & Brooks Kaufman; Team B — Jim & JP.');
  });

  it('notes "(none on file)" when nobody has a character note', () => {
    const out2 = buildPreRoundPrompt({ ...PRE, players: [{ name: 'JP', handicapIndex: 4.2 }] });
    expect(out2).toContain('Character notes:\n(none on file)');
  });
});

describe('buildPostRoundPrompt', () => {
  const POST = {
    ...PRE,
    holeScores: [
      { name: 'Peter Newton', gross: [4, 5, 3], grossTotal: 84, net: 74 },
      { name: 'Brooks Kaufman', gross: [5, 6, 4], grossTotal: 90, net: 79 },
    ],
    matchResult: 'Team A wins 3 & 2',
    skins: [{ name: 'Peter Newton', skins: 3 }, { name: 'Brooks Kaufman', skins: 1 }],
    snakeHolder: 'Brooks Kaufman',
    sideBets: [
      { name: 'Peter Newton', greenies: 1, sandies: 0, netBirdies: 2, netEagles: 0, total: 6 },
      { name: 'Brooks Kaufman', greenies: 0, sandies: 1, netBirdies: 0, netEagles: 0, total: -6 },
    ],
    settlement: {
      nets: [{ name: 'Peter Newton', net: 54 }, { name: 'Brooks Kaufman', net: -54 }],
      instructions: ['Brooks Kaufman pays Peter Newton $54.00'],
    },
    preRoundSummary: 'The Captain warned you.',
  };
  const out = buildPostRoundPrompt(POST);

  it('carries the pre-round context (course, players, games, notes, captain note)', () => {
    expect(out).toContain('Course: Prestonwood Meadows.');
    expect(out).toContain('Peter Newton (handicap 9.6)');
    expect(out).toContain('Games: Skins ($80 pool), Wolf ($2/pt), Snake ($10), Greenie ($2).');
    expect(out).toContain('- Peter Newton: Sandbags every October.');
    expect(out).toContain('Captain’s note: Brooks showed up hungover.');
  });

  it('includes hole-by-hole gross, totals, and net per player', () => {
    expect(out).toContain('- Peter Newton: holes 4, 5, 3 | gross 84, net 74');
    expect(out).toContain('- Brooks Kaufman: holes 5, 6, 4 | gross 90, net 79');
  });

  it('includes match, skins, snake, side bets, and settlement', () => {
    expect(out).toContain('Match play: Team A wins 3 & 2.');
    expect(out).toContain('Skins: Peter Newton 3, Brooks Kaufman 1.');
    expect(out).toContain('Snake (final holder): Brooks Kaufman.');
    expect(out).toContain('- Peter Newton: 1G 0S 2NB 0NE, +$6.00');
    expect(out).toContain('- Brooks Kaufman: 0G 1S 0NB 0NE, -$6.00');
    expect(out).toContain('- Peter Newton: +$54.00');
    expect(out).toContain('Brooks Kaufman pays Peter Newton $54.00');
  });

  it('includes the pre-round summary for continuity', () => {
    expect(out).toContain('Pre-round Captain’s Log (for continuity):');
    expect(out).toContain('The Captain warned you.');
  });
});

describe('gating + config', () => {
  it('treats the Captain as a subscriber by default', () => {
    expect(isCaptainSubscriber()).toBe(true);
  });
  it('reports not-configured when no Supabase env is set (test env)', () => {
    expect(isConfigured()).toBe(false);
  });
});

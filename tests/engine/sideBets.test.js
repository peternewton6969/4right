import { describe, it, expect } from 'vitest';
import { resolveSideBets, computeSideBetTotals } from '../../src/engine/sideBets.js';

// --- July 3 Meadows fixture (spec section 3.3) ---------------------------------

const MEADOWS_HOLES = [
  { number: 1, par: 4, hcpRank: 7, isParThree: false },
  { number: 2, par: 3, hcpRank: 15, isParThree: true },
  { number: 3, par: 5, hcpRank: 3, isParThree: false },
  { number: 4, par: 4, hcpRank: 1, isParThree: false },
  { number: 5, par: 5, hcpRank: 13, isParThree: false },
  { number: 6, par: 4, hcpRank: 11, isParThree: false },
  { number: 7, par: 3, hcpRank: 17, isParThree: true },
  { number: 8, par: 4, hcpRank: 5, isParThree: false },
  { number: 9, par: 4, hcpRank: 9, isParThree: false },
  { number: 10, par: 3, hcpRank: 18, isParThree: true },
  { number: 11, par: 4, hcpRank: 2, isParThree: false },
  { number: 12, par: 5, hcpRank: 14, isParThree: false },
  { number: 13, par: 4, hcpRank: 6, isParThree: false },
  { number: 14, par: 3, hcpRank: 16, isParThree: true },
  { number: 15, par: 4, hcpRank: 10, isParThree: false },
  { number: 16, par: 4, hcpRank: 8, isParThree: false },
  { number: 17, par: 5, hcpRank: 12, isParThree: false },
  { number: 18, par: 4, hcpRank: 4, isParThree: false },
];

// Gross scores, index 0 = hole 1.
const GROSS = {
  peter: [5, 4, 5, 6, 6, 5, 4, 3, 7, 3, 5, 6, 5, 4, 7, 7, 7, 5],
  aaron: [3, 3, 7, 5, 6, 4, 4, 6, 4, 4, 6, 4, 5, 4, 5, 6, 4, 6],
  sean: [4, 2, 6, 5, 7, 7, 5, 7, 6, 4, 6, 5, 6, 5, 7, 5, 6, 4],
  brooks: [6, 3, 5, 4, 5, 7, 4, 5, 7, 3, 5, 5, 6, 4, 4, 6, 5, 5],
};

const PLAYER_IDS = ['peter', 'aaron', 'sean', 'brooks'];

// Full course handicaps (spec 3.1): Peter 12, Aaron 9, Sean 21, Brooks 13.
const PLAYER_ROUNDS = [
  { playerId: 'peter', courseHandicap: 12 },
  { playerId: 'aaron', courseHandicap: 9 },
  { playerId: 'sean', courseHandicap: 21 },
  { playerId: 'brooks', courseHandicap: 13 },
];

// Per-hole per-player flag overrides (inBunker / closestOnParThree). The scorecard
// records exactly one sandie: Peter on hole 3. No closest-to-pin flags were
// recorded, so no greenie is ever awarded.
const FLAGS = {
  3: { peter: { inBunker: true } },
};

function holeScoresFor(holeNumber) {
  const idx = holeNumber - 1;
  const scores = {};
  for (const id of PLAYER_IDS) {
    const override = (FLAGS[holeNumber] && FLAGS[holeNumber][id]) || {};
    scores[id] = {
      gross: GROSS[id][idx],
      inBunker: override.inBunker === true,
      closestOnParThree: override.closestOnParThree === true,
    };
  }
  return { holeNumber, scores };
}

const ALL_HOLE_SCORES = MEADOWS_HOLES.map((h) => holeScoresFor(h.number));
const holeData = (n) => MEADOWS_HOLES[n - 1];

// NOTE ON SPEC DIVERGENCE (approved): spec section 3.3's hand-written side-bet
// rows are an incomplete/loose record and section 3.5's side-bet totals are
// stale (they sum to -$4, impossible for a zero-sum pool). The data model (1.6)
// has no manual net-birdie/eagle fields — these are COMPUTED from gross + full-CH
// strokes. Under the section 2.5 rules the true results differ from 3.3/3.5, e.g.
// Sean's hole 2 (gross 2 - 1 stroke = net 1 on a par 3) is a net EAGLE, not the
// "net birdie" scribbled on the card. These tests assert the engine-correct
// output; section 3.5 was corrected to match (side bets: Peter -10, Aaron -2,
// Sean +14, Brooks -2; all columns reconcile to $0). Hole 5 is a par 5 (official
// scorecard), so Brooks nets 4 there for a net birdie.

// --- resolveSideBets: per-hole events (spec 3.3 anchors) -----------------------

describe('resolveSideBets — July 3 Meadows per-hole (spec 3.3)', () => {
  it('hole 1: Aaron net eagle (gross 3 - 1 = net 2, par-2); Sean net birdie', () => {
    const res = resolveSideBets(ALL_HOLE_SCORES[0], PLAYER_ROUNDS, holeData(1));
    expect(res.netEagles).toEqual(['aaron']);
    expect(res.netBirdies).toEqual(['sean']);
    expect(res.greenie).toBe(null);
    expect(res.sandies).toEqual([]);
  });

  it('hole 2: Sean is a net EAGLE, not a birdie (card mislabels it)', () => {
    const res = resolveSideBets(ALL_HOLE_SCORES[1], PLAYER_ROUNDS, holeData(2));
    expect(res.netEagles).toEqual(['sean']); // gross 2 - 1 stroke = net 1 = par-2
    expect(res.netBirdies).toEqual([]);
    expect(res.greenie).toBe(null); // par 3 but no closest-to-pin flag
  });

  it('hole 3: Peter sandie (in bunker, net 4 on par 5); no greenie (par 5)', () => {
    const res = resolveSideBets(ALL_HOLE_SCORES[2], PLAYER_ROUNDS, holeData(3));
    expect(res.sandies).toEqual(['peter']);
    expect(res.greenie).toBe(null);
    // Peter/Sean/Brooks all net 4 on par 5 -> net birdies on this hole too.
    expect(res.netBirdies.sort()).toEqual(['brooks', 'peter', 'sean']);
  });

  it('hole 5: Brooks net birdie (net 4 on the corrected par 5)', () => {
    const res = resolveSideBets(ALL_HOLE_SCORES[4], PLAYER_ROUNDS, holeData(5));
    // gross 5 - 1 stroke (hcp13 <= CH13) = net 4 = par-1. Nobody else reaches par-1.
    expect(res.netBirdies).toEqual(['brooks']);
    expect(res.netEagles).toEqual([]);
  });

  it('greenie is never awarded all round (no closest-to-pin flags recorded)', () => {
    for (const hs of ALL_HOLE_SCORES) {
      const res = resolveSideBets(hs, PLAYER_ROUNDS, holeData(hs.holeNumber));
      expect(res.greenie).toBe(null);
    }
  });

  it('eagle supersedes birdie: a player is never in both lists on a hole', () => {
    for (const hs of ALL_HOLE_SCORES) {
      const res = resolveSideBets(hs, PLAYER_ROUNDS, holeData(hs.holeNumber));
      const overlap = res.netEagles.filter((id) => res.netBirdies.includes(id));
      expect(overlap).toEqual([]);
    }
  });
});

// --- computeSideBetTotals: per-player dollars (corrected settlement) ------------

describe('computeSideBetTotals — July 3 Meadows (corrected §3.5)', () => {
  const round = {
    playerRounds: PLAYER_ROUNDS,
    holes: ALL_HOLE_SCORES,
    courseHoles: MEADOWS_HOLES,
    payouts: { greenie: 2, netBirdie: 2, netEagle: 4, sandie: 2 },
  };

  it('matches the engine-correct side-bet totals', () => {
    const totals = computeSideBetTotals(round);
    expect(totals.peter.total).toBe(-10);
    expect(totals.aaron.total).toBe(-2);
    expect(totals.sean.total).toBe(14);
    expect(totals.brooks.total).toBe(-2);
  });

  it('breaks down correctly: win counts, per-category dollars, and total', () => {
    const totals = computeSideBetTotals(round);
    expect(totals.peter).toEqual({
      greenies: 0, netBirdies: 1, netEagles: 1, sandies: 1,
      greeniesDollars: 0, netBirdiesDollars: -20, netEaglesDollars: 4, sandiesDollars: 6,
      total: -10,
    });
    expect(totals.aaron).toEqual({
      greenies: 0, netBirdies: 3, netEagles: 1, sandies: 0,
      greeniesDollars: 0, netBirdiesDollars: -4, netEaglesDollars: 4, sandiesDollars: -2,
      total: -2,
    });
    expect(totals.sean).toEqual({
      greenies: 0, netBirdies: 5, netEagles: 1, sandies: 0,
      greeniesDollars: 0, netBirdiesDollars: 12, netEaglesDollars: 4, sandiesDollars: -2,
      total: 14,
    });
    expect(totals.brooks).toEqual({
      greenies: 0, netBirdies: 5, netEagles: 0, sandies: 0,
      greeniesDollars: 0, netBirdiesDollars: 12, netEaglesDollars: -12, sandiesDollars: -2,
      total: -2,
    });
  });

  it('win counts are non-negative and dollar fields sum to the total', () => {
    const totals = computeSideBetTotals(round);
    for (const id of PLAYER_IDS) {
      const t = totals[id];
      for (const c of ['greenies', 'netBirdies', 'netEagles', 'sandies']) {
        expect(t[c]).toBeGreaterThanOrEqual(0);
      }
      expect(t.greeniesDollars + t.netBirdiesDollars + t.netEaglesDollars + t.sandiesDollars).toBe(t.total);
    }
  });

  it('all side bets are zero-sum: totals sum to $0', () => {
    const totals = computeSideBetTotals(round);
    const sum = PLAYER_IDS.reduce((a, id) => a + totals[id].total, 0);
    expect(sum).toBe(0);
  });
});

// --- Synthetic edge cases (spec 2.5) -------------------------------------------

describe('side bets — edge cases (spec 2.5)', () => {
  const scratch = [
    { playerId: 'peter', courseHandicap: 0 },
    { playerId: 'aaron', courseHandicap: 0 },
    { playerId: 'sean', courseHandicap: 0 },
    { playerId: 'brooks', courseHandicap: 0 },
  ];
  const par3 = { number: 2, par: 3, hcpRank: 15, isParThree: true };

  const mkHole = (perPlayer) => ({
    holeNumber: 2,
    scores: Object.fromEntries(
      ['peter', 'aaron', 'sean', 'brooks'].map((id) => [
        id,
        { gross: 3, inBunker: false, closestOnParThree: false, ...perPlayer[id] },
      ]),
    ),
  });

  it('greenie: closest to pin AND par-or-better gross wins', () => {
    const res = resolveSideBets(mkHole({ aaron: { gross: 3, closestOnParThree: true } }), scratch, par3);
    expect(res.greenie).toBe('aaron');
  });

  it('greenie: closest to pin but over par does NOT win (no carry)', () => {
    const res = resolveSideBets(mkHole({ aaron: { gross: 4, closestOnParThree: true } }), scratch, par3);
    expect(res.greenie).toBe(null);
  });

  it('greenie: only par-3 holes are eligible', () => {
    const par4 = { number: 1, par: 4, hcpRank: 7, isParThree: false };
    const hole = {
      holeNumber: 1,
      scores: Object.fromEntries(
        ['peter', 'aaron', 'sean', 'brooks'].map((id) => [
          id,
          { gross: 3, inBunker: false, closestOnParThree: id === 'aaron' },
        ]),
      ),
    };
    const res = resolveSideBets(hole, scratch, par4);
    expect(res.greenie).toBe(null);
  });

  it('sandie needs both a bunker and par-or-better net', () => {
    // In bunker but over par -> no sandie.
    const overPar = resolveSideBets(
      mkHole({ peter: { gross: 5, inBunker: true } }),
      scratch,
      par3,
    );
    expect(overPar.sandies).toEqual([]);
    // In bunker and at par -> sandie.
    const atPar = resolveSideBets(
      mkHole({ peter: { gross: 3, inBunker: true } }),
      scratch,
      par3,
    );
    expect(atPar.sandies).toEqual(['peter']);
  });
});

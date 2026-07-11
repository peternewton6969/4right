import { describe, it, expect } from 'vitest';
import { resolveSnake, computeSnakeFinal } from '../../src/engine/snake.js';

// --- July 3 Meadows snake fixture (spec section 3.3) ---------------------------
//
// Scorecard snake row (a mark = that player three-putted on that hole):
//   Snake | BK | | | | | PN | PN | AB | | | | | | PN | | | AB | |
//
// Abbreviations -> player ids: PN=peter, AB=aaron, SC=sean, BK=brooks.
// Expected transfers: BK holds after hole 1, PN takes hole 6, AB takes hole 8,
// PN retakes hole 14, AB takes hole 17 and holds through 18.

const PLAYER_IDS = ['peter', 'aaron', 'sean', 'brooks'];

// holeNumber -> ids of players who three-putted that hole.
const THREE_PUTTS = {
  1: ['brooks'],
  6: ['peter'],
  7: ['peter'], // PN three-putts again while already holding -> no change
  8: ['aaron'],
  14: ['peter'],
  17: ['aaron'],
};

// Expected snake holder after each hole resolves (spec 3.3 walk-through).
const EXPECTED_HOLDER = {
  1: 'brooks',
  2: 'brooks',
  3: 'brooks',
  4: 'brooks',
  5: 'brooks',
  6: 'peter',
  7: 'peter',
  8: 'aaron',
  9: 'aaron',
  10: 'aaron',
  11: 'aaron',
  12: 'aaron',
  13: 'aaron',
  14: 'peter',
  15: 'peter',
  16: 'peter',
  17: 'aaron',
  18: 'aaron',
};

function holeScoresFor(holeNumber) {
  const putters = THREE_PUTTS[holeNumber] || [];
  const scores = {};
  for (const id of PLAYER_IDS) {
    scores[id] = { threePutt: putters.includes(id) };
  }
  return { holeNumber, scores, snakeHolder: EXPECTED_HOLDER[holeNumber] };
}

const ALL_HOLE_SCORES = Array.from({ length: 18 }, (_, i) => holeScoresFor(i + 1));

const PLAYER_ROUNDS = PLAYER_IDS.map((playerId) => ({ playerId }));

// --- resolveSnake: hole-by-hole transfers --------------------------------------

describe('resolveSnake — July 3 Meadows transfers (spec 3.3)', () => {
  it('tracks the holder correctly through all 18 holes', () => {
    let holder = null;
    for (const hs of ALL_HOLE_SCORES) {
      const res = resolveSnake(hs, holder, hs.snakeHolder);
      expect(res.holder).toBe(EXPECTED_HOLDER[hs.holeNumber]);
      holder = res.holder;
    }
    expect(holder).toBe('aaron'); // AB holds at 18
  });

  it('reports `changed` true only on an actual transfer', () => {
    let holder = null;
    const changedAt = [];
    for (const hs of ALL_HOLE_SCORES) {
      const res = resolveSnake(hs, holder, hs.snakeHolder);
      if (res.changed) changedAt.push(hs.holeNumber);
      holder = res.holder;
    }
    // Transfers happen at holes 1, 6, 8, 14, 17. Hole 7 is PN re-taking while
    // already holding -> no change. Holes with no three-putts -> no change.
    expect(changedAt).toEqual([1, 6, 8, 14, 17]);
  });

  it('a three-putt by the current holder is not a transfer (hole 7)', () => {
    const hole7 = ALL_HOLE_SCORES[6];
    const res = resolveSnake(hole7, 'peter', hole7.snakeHolder);
    expect(res.holder).toBe('peter');
    expect(res.changed).toBe(false);
  });
});

// --- computeSnakeFinal: settlement ---------------------------------------------

describe('computeSnakeFinal — July 3 Meadows settlement (spec 3.3)', () => {
  const round = {
    playerRounds: PLAYER_ROUNDS,
    holes: ALL_HOLE_SCORES,
    payouts: { snake: 10 },
  };

  it('AB holds at the end and pays each other player $10 (net -$30)', () => {
    const { holder, payout } = computeSnakeFinal(round);
    expect(holder).toBe('aaron');
    expect(payout.aaron).toBe(-30);
    expect(payout.peter).toBe(10);
    expect(payout.sean).toBe(10);
    expect(payout.brooks).toBe(10);
  });

  it('snake payout is zero-sum across the group', () => {
    const { payout } = computeSnakeFinal(round);
    const sum = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});

// --- Edge cases (spec 2.4) -----------------------------------------------------

describe('snake — edge cases (spec 2.4)', () => {
  const noThreePutts = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    scores: Object.fromEntries(PLAYER_IDS.map((id) => [id, { threePutt: false }])),
  }));

  it('no three-putts all round: holder null, no payout', () => {
    const { holder, payout } = computeSnakeFinal({
      playerRounds: PLAYER_ROUNDS,
      holes: noThreePutts,
      payouts: { snake: 10 },
    });
    expect(holder).toBe(null);
    expect(Object.values(payout).every((v) => v === 0)).toBe(true);
  });

  it('empty three-putts leaves the previous holder unchanged', () => {
    const res = resolveSnake(noThreePutts[0], 'sean');
    expect(res.holder).toBe('sean');
    expect(res.changed).toBe(false);
    expect(res.simultaneous).toBe(false);
  });

  it('simultaneous three-putt requires a manually selected holder', () => {
    const hole = {
      holeNumber: 5,
      scores: {
        peter: { threePutt: true },
        aaron: { threePutt: true },
        sean: { threePutt: false },
        brooks: { threePutt: false },
      },
    };
    // No selection passed -> throws.
    expect(() => resolveSnake(hole, 'brooks')).toThrow(/manually selected/i);

    // With a valid selection -> that player holds it, simultaneous flagged.
    const res = resolveSnake(hole, 'brooks', 'aaron');
    expect(res.holder).toBe('aaron');
    expect(res.changed).toBe(true);
    expect(res.simultaneous).toBe(true);
  });

  it('a selected holder must be one of the three-putters', () => {
    const hole = {
      holeNumber: 5,
      scores: {
        peter: { threePutt: true },
        aaron: { threePutt: true },
        sean: { threePutt: false },
        brooks: { threePutt: false },
      },
    };
    expect(() => resolveSnake(hole, 'brooks', 'sean')).toThrow(/one of the three-putting/i);
  });
});

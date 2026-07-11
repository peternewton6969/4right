import { describe, it, expect } from 'vitest';
import { resolveMatchPlayHole, computeMatchPlayStatus } from '../../src/engine/matchPlay.js';

// --- July 3 Meadows fixture (spec section 3.3) ---------------------------------

const MEADOWS_HOLES = [
  { number: 1, par: 4, hcpRank: 7 },
  { number: 2, par: 3, hcpRank: 15 },
  { number: 3, par: 5, hcpRank: 3 },
  { number: 4, par: 4, hcpRank: 1 },
  { number: 5, par: 5, hcpRank: 13 },
  { number: 6, par: 4, hcpRank: 11 },
  { number: 7, par: 3, hcpRank: 17 },
  { number: 8, par: 4, hcpRank: 5 },
  { number: 9, par: 4, hcpRank: 9 },
  { number: 10, par: 3, hcpRank: 18 },
  { number: 11, par: 4, hcpRank: 2 },
  { number: 12, par: 5, hcpRank: 14 },
  { number: 13, par: 4, hcpRank: 6 },
  { number: 14, par: 3, hcpRank: 16 },
  { number: 15, par: 4, hcpRank: 10 },
  { number: 16, par: 4, hcpRank: 8 },
  { number: 17, par: 5, hcpRank: 12 },
  { number: 18, par: 4, hcpRank: 4 },
];

// Gross scores, index 0 = hole 1.
const GROSS = {
  peter: [5, 4, 5, 6, 6, 5, 4, 3, 7, 3, 5, 6, 5, 4, 7, 7, 7, 5],
  aaron: [3, 3, 7, 5, 6, 4, 4, 6, 4, 4, 6, 4, 5, 4, 5, 6, 4, 6],
  sean: [4, 2, 6, 5, 7, 7, 5, 7, 6, 4, 6, 5, 6, 5, 7, 5, 6, 4],
  brooks: [6, 3, 5, 4, 5, 7, 4, 5, 7, 3, 5, 5, 6, 4, 4, 6, 5, 5],
};

const PLAYER_IDS = ['peter', 'aaron', 'sean', 'brooks'];

// Differentials off Aaron (low man, CH 9): Peter 3, Aaron 0, Sean 12, Brooks 4.
const PLAYER_ROUNDS = [
  { playerId: 'peter', differential: 3 },
  { playerId: 'aaron', differential: 0 },
  { playerId: 'sean', differential: 12 },
  { playerId: 'brooks', differential: 4 },
];

const TEAMS = { A: ['peter', 'sean'], B: ['aaron', 'brooks'] };

function holeScoresFor(holeNumber) {
  const idx = holeNumber - 1;
  const scores = {};
  for (const id of PLAYER_IDS) {
    scores[id] = { gross: GROSS[id][idx] };
  }
  return { holeNumber, scores };
}

const ALL_HOLE_SCORES = MEADOWS_HOLES.map((h) => holeScoresFor(h.number));

// Expected hole-by-hole winner, index 0 = hole 1 (hand-derived from the scorecard).
const EXPECTED_WINNERS = [
  'halved', // 1
  'A', // 2
  'halved', // 3
  'B', // 4
  'B', // 5
  'B', // 6
  'halved', // 7
  'A', // 8
  'B', // 9
  'halved', // 10
  'halved', // 11
  'B', // 12
  'halved', // 13
  'halved', // 14
  'B', // 15
  'A', // 16
  'B', // 17
  'A', // 18
];

// --- resolveMatchPlayHole ------------------------------------------------------

describe('resolveMatchPlayHole — July 3 Meadows (spec 3.3)', () => {
  MEADOWS_HOLES.forEach((h) => {
    const expected = EXPECTED_WINNERS[h.number - 1];
    it(`hole ${h.number} -> ${expected}`, () => {
      const { winner } = resolveMatchPlayHole(
        holeScoresFor(h.number),
        PLAYER_ROUNDS,
        TEAMS,
        MEADOWS_HOLES,
      );
      expect(winner).toBe(expected);
    });
  });

  it('hole 4 net scores: Peter 5, Sean 4, Aaron 5, Brooks 3 (Team B wins)', () => {
    const { winner, netScores } = resolveMatchPlayHole(
      holeScoresFor(4),
      PLAYER_ROUNDS,
      TEAMS,
      MEADOWS_HOLES,
    );
    expect(netScores).toEqual({ peter: 5, sean: 4, aaron: 5, brooks: 3 });
    expect(winner).toBe('B');
  });
});

// --- computeMatchPlayStatus ----------------------------------------------------

describe('computeMatchPlayStatus — July 3 Meadows (spec 3.3)', () => {
  const round = {
    teams: TEAMS,
    playerRounds: PLAYER_ROUNDS,
    holes: ALL_HOLE_SCORES,
    courseHoles: MEADOWS_HOLES,
  };

  it('final result: Team B wins 4&3, holes won A 4 / B 7', () => {
    const result = computeMatchPlayStatus(round);
    expect(result.holesPlayed).toBe(18);
    expect(result.score).toEqual({ A: 4, B: 7 });
    expect(result.winner).toBe('B');
    expect(result.status).toBe('Team B wins 4&3');
  });

  it('in progress through 9: reports running lead, no winner yet', () => {
    const partial = { ...round, holes: ALL_HOLE_SCORES.slice(0, 9) };
    const result = computeMatchPlayStatus(partial);
    // Through 9: A wins holes 2 & 8; B wins 4,5,6,9 -> B up 2.
    expect(result.holesPlayed).toBe(9);
    expect(result.score).toEqual({ A: 2, B: 4 });
    expect(result.winner).toBeNull();
    expect(result.status).toBe('Team B 2UP');
  });
});

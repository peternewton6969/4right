import { describe, it, expect } from 'vitest';
import {
  resolveScrambleHole,
  computeScrambleStatus,
  computeScrambleSettlement,
} from '../../src/engine/scramble.js';

// --- resolveScrambleHole -------------------------------------------------------

describe('resolveScrambleHole', () => {
  it('Team A wins the hole on gross 4 vs 5', () => {
    expect(resolveScrambleHole({ A: 4, B: 5 })).toEqual({ winner: 'A' });
  });

  it('Team B wins the hole on gross 3 vs 4', () => {
    expect(resolveScrambleHole({ A: 4, B: 3 })).toEqual({ winner: 'B' });
  });

  it('halves the hole on gross 4 vs 4', () => {
    expect(resolveScrambleHole({ A: 4, B: 4 })).toEqual({ winner: 'halved' });
  });

  it('returns null winner when both teams picked up', () => {
    expect(resolveScrambleHole({ A: null, B: null })).toEqual({ winner: null });
  });

  it('a team that picked up loses to a team that finished', () => {
    expect(resolveScrambleHole({ A: null, B: 5 })).toEqual({ winner: 'B' });
    expect(resolveScrambleHole({ A: 5, B: null })).toEqual({ winner: 'A' });
  });
});

// --- helpers -------------------------------------------------------------------

// Build a hole record from a per-hole A/B gross pair.
const hole = (holeNumber, A, B) => ({ holeNumber, teamScores: { A, B } });

const TEAMS = { A: ['peter', 'sean'], B: ['aaron', 'brooks'] };

// --- computeScrambleStatus -----------------------------------------------------

describe('computeScrambleStatus', () => {
  it('reports Team A 2UP in progress through 9', () => {
    // A wins holes 1 & 2, holes 3-9 halved -> A up 2 with 9 to play.
    const holes = [
      hole(1, 4, 5),
      hole(2, 4, 5),
      hole(3, 4, 4),
      hole(4, 4, 4),
      hole(5, 4, 4),
      hole(6, 4, 4),
      hole(7, 4, 4),
      hole(8, 4, 4),
      hole(9, 4, 4),
    ];
    const result = computeScrambleStatus({ teams: TEAMS }, holes);
    expect(result.holesPlayed).toBe(9);
    expect(result.score).toEqual({ A: 2, B: 0 });
    expect(result.winner).toBeNull();
    expect(result.status).toBe('Team A 2UP');
  });

  it('closes the match out early: Team A wins 3&2', () => {
    // Holes 1-13 halved, A wins 14, 15, 16 -> up 3 with 2 to play (clinch at 16).
    const holes = [];
    for (let n = 1; n <= 13; n += 1) holes.push(hole(n, 4, 4));
    holes.push(hole(14, 4, 5));
    holes.push(hole(15, 4, 5));
    holes.push(hole(16, 4, 5));
    const result = computeScrambleStatus({ teams: TEAMS }, holes);
    expect(result.score).toEqual({ A: 3, B: 0 });
    expect(result.winner).toBe('A');
    expect(result.status).toBe('Team A wins 3&2');
  });

  it('all 18 halved is All Square with no winner', () => {
    const holes = [];
    for (let n = 1; n <= 18; n += 1) holes.push(hole(n, 4, 4));
    const result = computeScrambleStatus({ teams: TEAMS }, holes);
    expect(result.holesPlayed).toBe(18);
    expect(result.winner).toBeNull();
    expect(result.status).toBe('All Square');
  });
});

// --- computeScrambleSettlement -------------------------------------------------

describe('computeScrambleSettlement', () => {
  it('winning team each receive the payout, losing team each pay it', () => {
    const holes = [];
    for (let n = 1; n <= 18; n += 1) holes.push(hole(n, n <= 3 ? 4 : 4, n <= 3 ? 5 : 4));
    // A wins holes 1-3, rest halved -> A wins the match.
    const round = { teams: TEAMS, holes, payouts: { teamGame: 20 } };
    const settlement = computeScrambleSettlement(round);
    expect(settlement).toEqual({ peter: 20, sean: 20, aaron: -20, brooks: -20 });
    // Zero-sum.
    const sum = Object.values(settlement).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });

  it('a tie after 18 pays nobody', () => {
    const holes = [];
    for (let n = 1; n <= 18; n += 1) holes.push(hole(n, 4, 4));
    const round = { teams: TEAMS, holes, payouts: { teamGame: 20 } };
    const settlement = computeScrambleSettlement(round);
    expect(settlement).toEqual({ peter: 0, sean: 0, aaron: 0, brooks: 0 });
  });
});

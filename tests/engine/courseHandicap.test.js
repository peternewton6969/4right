import { describe, it, expect } from 'vitest';
import { computeCourseHandicap, computeDifferential } from '../../src/engine/courseHandicap.js';

// Meadows, Blue Tees (spec section 3.1). Differentials are taken off Aaron, the low man (CH 9).
const MEADOWS = { slope: 133, rating: 72.3, par: 72 };
const AARON_CH = 9;

describe('courseHandicap — Meadows Blue Tees (slope 133, rating 72.3, par 72)', () => {
  it('Peter: index 9.6 -> CH 12, differential 3', () => {
    const ch = computeCourseHandicap(9.6, MEADOWS.slope, MEADOWS.rating, MEADOWS.par);
    expect(ch).toBe(12);
    expect(computeDifferential(ch, AARON_CH)).toBe(3);
  });

  it('Aaron: index 7.2 -> CH 9, differential 0 (low man)', () => {
    const ch = computeCourseHandicap(7.2, MEADOWS.slope, MEADOWS.rating, MEADOWS.par);
    expect(ch).toBe(9);
    expect(computeDifferential(ch, AARON_CH)).toBe(0);
  });

  it('Sean: index 17.3 -> CH 21, differential 12', () => {
    const ch = computeCourseHandicap(17.3, MEADOWS.slope, MEADOWS.rating, MEADOWS.par);
    expect(ch).toBe(21);
    expect(computeDifferential(ch, AARON_CH)).toBe(12);
  });

  it('Brooks: index 11.0 -> CH 13, differential 4', () => {
    const ch = computeCourseHandicap(11.0, MEADOWS.slope, MEADOWS.rating, MEADOWS.par);
    expect(ch).toBe(13);
    expect(computeDifferential(ch, AARON_CH)).toBe(4);
  });
});

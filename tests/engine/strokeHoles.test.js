import { describe, it, expect } from 'vitest';
import { computeStrokeHolesMatchPlay, computeStrokeHolesSkins } from '../../src/engine/strokeHoles.js';

// Meadows, Blue Tees hole data (spec section 1.3). Only number + hcpRank matter for stroke holes.
const MEADOWS_HOLES = [
  { number: 1, hcpRank: 7 },
  { number: 2, hcpRank: 15 },
  { number: 3, hcpRank: 3 },
  { number: 4, hcpRank: 1 },
  { number: 5, hcpRank: 13 },
  { number: 6, hcpRank: 11 },
  { number: 7, hcpRank: 17 },
  { number: 8, hcpRank: 5 },
  { number: 9, hcpRank: 9 },
  { number: 10, hcpRank: 18 },
  { number: 11, hcpRank: 2 },
  { number: 12, hcpRank: 14 },
  { number: 13, hcpRank: 6 },
  { number: 14, hcpRank: 16 },
  { number: 15, hcpRank: 10 },
  { number: 16, hcpRank: 8 },
  { number: 17, hcpRank: 12 },
  { number: 18, hcpRank: 4 },
];

// Compare stroke-hole membership independent of ordering: spec 3.2 lists holes in a
// hand-written order that is not a clean sort, so we validate the exact SET.
const sortedNums = (arr) => [...arr].sort((a, b) => a - b);
const holesOf = (obj) => sortedNums(Object.keys(obj).map(Number));

describe('computeStrokeHolesMatchPlay — Meadows Blue Tees (spec 3.2)', () => {
  it('Peter (differential 3): strokes on holes 3, 4, 11', () => {
    const holes = computeStrokeHolesMatchPlay(3, MEADOWS_HOLES);
    expect(sortedNums(holes)).toEqual([3, 4, 11]);
  });

  it('Aaron (differential 0): no stroke holes', () => {
    expect(computeStrokeHolesMatchPlay(0, MEADOWS_HOLES)).toEqual([]);
  });

  it('Sean (differential 12): strokes on hcp1-12', () => {
    const holes = computeStrokeHolesMatchPlay(12, MEADOWS_HOLES);
    expect(sortedNums(holes)).toEqual([1, 3, 4, 6, 8, 9, 11, 13, 15, 16, 17, 18]);
  });

  it('Brooks (differential 4): strokes on holes 3, 4, 11, 18', () => {
    const holes = computeStrokeHolesMatchPlay(4, MEADOWS_HOLES);
    expect(sortedNums(holes)).toEqual([3, 4, 11, 18]);
  });
});

describe('computeStrokeHolesSkins — Meadows Blue Tees (spec 3.2)', () => {
  const totalStrokes = (obj) => Object.values(obj).reduce((s, n) => s + n, 0);

  it('Peter (CH 12): one stroke on each of 12 holes', () => {
    const skins = computeStrokeHolesSkins(12, MEADOWS_HOLES);
    expect(holesOf(skins)).toEqual([1, 3, 4, 6, 8, 9, 11, 13, 15, 16, 17, 18]);
    expect(Object.values(skins).every((n) => n === 1)).toBe(true);
    expect(totalStrokes(skins)).toBe(12);
  });

  it('Aaron (CH 9): one stroke on each of 9 holes', () => {
    const skins = computeStrokeHolesSkins(9, MEADOWS_HOLES);
    expect(holesOf(skins)).toEqual([1, 3, 4, 8, 9, 11, 13, 16, 18]);
    expect(Object.values(skins).every((n) => n === 1)).toBe(true);
    expect(totalStrokes(skins)).toBe(9);
  });

  it('Brooks (CH 13): one stroke on each of 13 holes', () => {
    const skins = computeStrokeHolesSkins(13, MEADOWS_HOLES);
    expect(holesOf(skins)).toEqual([1, 3, 4, 5, 6, 8, 9, 11, 13, 15, 16, 17, 18]);
    expect(Object.values(skins).every((n) => n === 1)).toBe(true);
    expect(totalStrokes(skins)).toBe(13);
  });

  it('Sean (CH 21 > 18): a stroke on all 18 holes, with double strokes on the lowest-ranked holes', () => {
    const skins = computeStrokeHolesSkins(21, MEADOWS_HOLES);
    // A stroke on every hole.
    expect(holesOf(skins)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    // Explicit double-stroke validation: holes 4 (hcp1) and 11 (hcp2) receive 2 strokes.
    expect(skins[4]).toBe(2);
    expect(skins[11]).toBe(2);
    // Total strokes must equal the course handicap (18 base + 3 lapped strokes = 21).
    expect(totalStrokes(skins)).toBe(21);
    // The three double-stroke holes are the lowest-ranked: hcp1=4, hcp2=11, hcp3=3.
    const doubles = sortedNums(Object.entries(skins).filter(([, n]) => n === 2).map(([k]) => Number(k)));
    expect(doubles).toEqual([3, 4, 11]);
  });
});

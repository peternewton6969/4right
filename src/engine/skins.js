// Skins resolution (full course-handicap stroke method, including double strokes).
// Pure functions, no side effects, no React dependencies. See spec sections 2.1, 2.3.

import { computeStrokeHolesSkins } from './strokeHoles.js';

const FINAL_HOLE = 18;

/**
 * Resolve skins for a single hole.
 *
 * skinsAtStake = skinsCarryIn + 1. Eligible players are those with a gross
 * score entered. Net scores use the full course-handicap stroke object (double
 * strokes included). A unique lowest net wins all skins at stake; any tie
 * (or no eligible players) carries the whole stake to the next hole.
 *
 * @param {{holeNumber:number, scores:Object<string,{gross:number}>}} holeScores
 * @param {Array<{playerId:string, courseHandicap:number}>} playerRounds
 * @param {Array<{number:number, hcpRank:number}>} holes - Course holes.
 * @param {number} skinsCarryIn - Skins carried into this hole.
 * @returns {{winner:(string|null), skinsAwarded:number, skinsCarryOut:number}}
 */
export function resolveSkinsHole(holeScores, playerRounds, holes, skinsCarryIn) {
  const skinsAtStake = skinsCarryIn + 1;

  const eligible = [];
  for (const pr of playerRounds) {
    const s = holeScores.scores[pr.playerId];
    if (!s || s.gross == null) continue;
    const strokeMap = computeStrokeHolesSkins(pr.courseHandicap, holes);
    const strokes = strokeMap[holeScores.holeNumber] || 0;
    eligible.push({ playerId: pr.playerId, net: s.gross - strokes });
  }

  if (eligible.length === 0) {
    return { winner: null, skinsAwarded: 0, skinsCarryOut: skinsAtStake };
  }

  const minNet = Math.min(...eligible.map((e) => e.net));
  const lows = eligible.filter((e) => e.net === minNet);

  if (lows.length === 1) {
    return { winner: lows[0].playerId, skinsAwarded: skinsAtStake, skinsCarryOut: 0 };
  }
  return { winner: null, skinsAwarded: 0, skinsCarryOut: skinsAtStake };
}

/**
 * Compute skins standings through the holes entered so far.
 *
 * A carry into hole 18 that is not won leaves the pot dead (unawarded, no
 * split): `unresolved` is true and those skins are not credited to anyone.
 *
 * @param {{
 *   playerRounds:Array<{playerId:string, courseHandicap:number}>,
 *   holes:Array<{holeNumber:number, scores:Object}>,   // entered hole scores (spec round.holes)
 *   courseHoles:Array<{number:number, hcpRank:number}>  // course hole definitions
 * }} round
 * @returns {{standings:Array<{playerId:string, skinsWon:number}>, currentCarry:number, unresolved:boolean}}
 */
export function computeSkinsStandings(round) {
  const { playerRounds, courseHoles } = round;
  const entered = [...round.holes].sort((a, b) => a.holeNumber - b.holeNumber);

  const skinsWon = {};
  for (const pr of playerRounds) skinsWon[pr.playerId] = 0;

  let carry = 0;
  let lastHoleNumber = null;
  let lastCarried = false;

  for (const hs of entered) {
    const res = resolveSkinsHole(hs, playerRounds, courseHoles, carry);
    if (res.winner) {
      skinsWon[res.winner] += res.skinsAwarded;
      carry = 0;
      lastCarried = false;
    } else {
      carry = res.skinsCarryOut;
      lastCarried = true;
    }
    lastHoleNumber = hs.holeNumber;
  }

  const unresolved = lastHoleNumber === FINAL_HOLE && lastCarried;

  const standings = playerRounds
    .map((pr) => ({ playerId: pr.playerId, skinsWon: skinsWon[pr.playerId] }))
    .sort((a, b) => b.skinsWon - a.skinsWon);

  return { standings, currentCarry: carry, unresolved };
}

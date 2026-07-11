// Scramble: 2v2 team stroke play, gross score only (no handicap strokes).
// Both players on a team hit every shot, the team plays its best ball, and the
// single team gross recorded for the hole is what competes. Lower gross wins the
// hole; the match is decided the moment one team leads by more holes than remain
// (standard closeout notation). Pure functions, no side effects, no React deps.
// See spec sections 2.1, 2.6.

const TOTAL_HOLES = 18;

/**
 * Read the two team gross scores off a scramble hole record. Supports the
 * canonical `hole.teamScores = {A, B}` shape; a missing team score is null
 * (that team picked up / did not complete the hole).
 */
function teamScoresOf(hole) {
  const ts = (hole && hole.teamScores) || {};
  return {
    A: ts.A == null ? null : ts.A,
    B: ts.B == null ? null : ts.B,
  };
}

/**
 * Resolve the winner of a single scramble hole from the two team gross scores.
 *
 * Lower gross wins; equal gross is halved. A null team score means that team
 * picked up. If both teams picked up the hole has no winner (`null`).
 *
 * @param {{A:(number|null), B:(number|null)}} teamScores
 * @returns {{winner:('A'|'B'|'halved'|null)}}
 */
export function resolveScrambleHole(teamScores) {
  const a = teamScores && teamScores.A != null ? teamScores.A : null;
  const b = teamScores && teamScores.B != null ? teamScores.B : null;

  if (a == null && b == null) return { winner: null };
  if (a == null) return { winner: 'B' };
  if (b == null) return { winner: 'A' };
  if (a < b) return { winner: 'A' };
  if (b < a) return { winner: 'B' };
  return { winner: 'halved' };
}

/**
 * Compute the scramble match result through the holes entered so far.
 *
 * The match is decided the moment one team leads by more holes than remain
 * (closeout notation, e.g. "Team A wins 3&2"). All 18 holes are still played in
 * v1, but the reported result reflects the closeout point.
 *
 * @param {Object} round - Full round object (unused fields tolerated).
 * @param {Array<{holeNumber:number, teamScores:{A:(number|null),B:(number|null)}}>} holes
 * @returns {{holesPlayed:number, score:{A:number,B:number}, status:string, winner:('A'|'B'|null)}}
 */
export function computeScrambleStatus(round, holes) {
  const entered = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);

  let aWins = 0;
  let bWins = 0;
  let clinch = null; // { team, margin, remaining } at the hole the match was decided

  for (const hole of entered) {
    const { winner } = resolveScrambleHole(teamScoresOf(hole));
    if (winner === 'A') aWins += 1;
    else if (winner === 'B') bWins += 1;

    const lead = aWins - bWins;
    const remaining = TOTAL_HOLES - hole.holeNumber;
    if (!clinch && Math.abs(lead) > remaining) {
      clinch = { team: lead > 0 ? 'A' : 'B', margin: Math.abs(lead), remaining };
    }
  }

  const holesPlayed = entered.length;
  const score = { A: aWins, B: bWins };
  const finalLead = aWins - bWins;

  let status;
  let winner;
  if (clinch) {
    winner = clinch.team;
    status =
      clinch.remaining > 0
        ? `Team ${clinch.team} wins ${clinch.margin}&${clinch.remaining}`
        : `Team ${clinch.team} wins ${clinch.margin}UP`;
  } else if (holesPlayed >= TOTAL_HOLES) {
    // All 18 played and never clinched: tied.
    winner = null;
    status = 'All Square';
  } else {
    // Still in progress.
    winner = null;
    if (finalLead > 0) status = `Team A ${finalLead}UP`;
    else if (finalLead < 0) status = `Team B ${-finalLead}UP`;
    else status = 'All Square';
  }

  return { holesPlayed, score, status, winner };
}

/**
 * Compute the scramble settlement for a round.
 *
 * Each player on the winning team receives the team-game payout; each player on
 * the losing team pays it. For the standard 2v2 this is zero-sum (±payout). A
 * tie (or a match still in progress) pays nothing.
 *
 * @param {{
 *   teams:{A:string[], B:string[]},
 *   holes:Array<{holeNumber:number, teamScores:Object}>,
 *   payouts?:{teamGame?:number},
 *   teamGamePayout?:number
 * }} round
 * @returns {Object<string, number>} playerId -> net dollars (positive = receives).
 */
export function computeScrambleSettlement(round) {
  const teams = round.teams || { A: [], B: [] };
  const ids = [...teams.A, ...teams.B];
  const result = Object.fromEntries(ids.map((id) => [id, 0]));

  const payout = (round.payouts && round.payouts.teamGame) ?? round.teamGamePayout ?? 0;

  const { winner } = computeScrambleStatus(round, round.holes || []);
  if (!winner) return result; // tie or in progress: no payout

  const winners = teams[winner];
  const losers = teams[winner === 'A' ? 'B' : 'A'];
  for (const id of winners) result[id] = payout;
  for (const id of losers) result[id] = -payout;
  return result;
}

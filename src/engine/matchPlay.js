// Match play resolution (best-ball, differential stroke method).
// Pure functions, no side effects, no React dependencies. See spec sections 2.1, 2.6.

import { computeStrokeHolesMatchPlay } from './strokeHoles.js';

const TOTAL_HOLES = 18;

/**
 * Net score for one player on one hole using match-play (differential) strokes.
 * Returns null when the player has no gross entered.
 */
function netForPlayer(holeNumber, playerScore, differential, holes) {
  if (!playerScore || playerScore.gross == null) {
    return null;
  }
  const strokeHoles = computeStrokeHolesMatchPlay(differential, holes);
  const stroke = strokeHoles.includes(holeNumber) ? 1 : 0;
  return playerScore.gross - stroke;
}

/**
 * Best-ball net for a two-person team: the lower net of the team's players.
 * Players with no gross (null net) are excluded. If neither player has a ball
 * in play the team returns null (that team loses the hole).
 */
function bestBallNet(teamPlayerIds, netScores) {
  const nets = teamPlayerIds
    .map((id) => netScores[id])
    .filter((n) => n != null);
  if (nets.length === 0) return null;
  return Math.min(...nets);
}

/**
 * Resolve the match-play winner of a single hole.
 *
 * @param {{holeNumber:number, scores:Object<string,{gross:number}>}} holeScores
 * @param {Array<{playerId:string, differential:number}>} playerRounds
 * @param {{A:string[], B:string[]}} teams
 * @param {Array<{number:number, hcpRank:number}>} holes - Course holes.
 * @returns {{winner:'A'|'B'|'halved', netScores:Object<string, number|null>}}
 */
export function resolveMatchPlayHole(holeScores, playerRounds, teams, holes) {
  const netScores = {};
  for (const pr of playerRounds) {
    netScores[pr.playerId] = netForPlayer(
      holeScores.holeNumber,
      holeScores.scores[pr.playerId],
      pr.differential,
      holes,
    );
  }

  const aNet = bestBallNet(teams.A, netScores);
  const bNet = bestBallNet(teams.B, netScores);

  let winner;
  if (aNet == null && bNet == null) {
    // Neither team has a ball in play: no one wins the hole.
    winner = 'halved';
  } else if (aNet == null) {
    winner = 'B';
  } else if (bNet == null) {
    winner = 'A';
  } else if (aNet < bNet) {
    winner = 'A';
  } else if (bNet < aNet) {
    winner = 'B';
  } else {
    winner = 'halved';
  }

  return { winner, netScores };
}

/**
 * Compute the match-play result through the holes entered so far.
 *
 * The match is decided the moment one team leads by more holes than remain
 * (standard closeout notation, e.g. "Team B wins 4&3"). All 18 holes are still
 * played in v1, but the reported result reflects the closeout point.
 *
 * @param {{
 *   teams:{A:string[],B:string[]},
 *   playerRounds:Array<{playerId:string, differential:number}>,
 *   holes:Array<{holeNumber:number, scores:Object}>,   // entered hole scores (spec round.holes)
 *   courseHoles:Array<{number:number, hcpRank:number}>  // course hole definitions
 * }} round
 * @returns {{holesPlayed:number, score:{A:number,B:number}, status:string, winner:'A'|'B'|null}}
 */
export function computeMatchPlayStatus(round) {
  const { teams, playerRounds, courseHoles } = round;
  const enteredHoles = [...round.holes].sort((a, b) => a.holeNumber - b.holeNumber);

  let aWins = 0;
  let bWins = 0;
  let clinch = null; // { team, margin, remaining } at the hole the match was decided

  for (const hs of enteredHoles) {
    const { winner } = resolveMatchPlayHole(hs, playerRounds, teams, courseHoles);
    if (winner === 'A') aWins += 1;
    else if (winner === 'B') bWins += 1;

    const lead = aWins - bWins;
    const remaining = TOTAL_HOLES - hs.holeNumber;
    if (!clinch && Math.abs(lead) > remaining) {
      clinch = {
        team: lead > 0 ? 'A' : 'B',
        margin: Math.abs(lead),
        remaining,
      };
    }
  }

  const holesPlayed = enteredHoles.length;
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
    // All 18 played and never clinched: the match is tied.
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

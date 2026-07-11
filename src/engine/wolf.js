// Wolf: a per-hole individual game for exactly four players. Each hole one player
// is the Wolf and either takes a partner (2v2) or goes it alone (Lone Wolf, 1v3).
// Hole outcomes use NET scores under the full course-handicap stroke method
// (same allocation as skins / side bets). Pure functions, no side effects, no
// React dependencies. See spec sections 2.1, 2.5.

const STANDARD_ROUND_HOLES = 18;

/**
 * Full course-handicap strokes received on a single hole. Mirrors
 * computeStrokeHolesSkins / sideBets: every hole gets floor(CH/18) strokes, then
 * holes ranked hcpRank <= (CH mod 18) get one more (double strokes when CH > 18).
 */
function strokesForHole(courseHandicap, hcpRank) {
  const ch = courseHandicap || 0;
  const base = Math.floor(ch / STANDARD_ROUND_HOLES);
  const remainder = ch % STANDARD_ROUND_HOLES;
  return base + (hcpRank <= remainder ? 1 : 0);
}

/** The playerIds carried on a round, from either playerIds or playerRounds. */
function playerIdsOf(round) {
  if (Array.isArray(round.playerIds)) return round.playerIds;
  if (Array.isArray(round.playerRounds)) return round.playerRounds.map((pr) => pr.playerId);
  return [];
}

/**
 * The Wolf player id for a given hole. The rotation follows playerIds order:
 * hole 1 -> index 0, hole 2 -> index 1, ... cycling every four holes. Holes 17
 * and 18 simply continue the cycle (index 0, then 1).
 *
 * @param {number} holeNumber - 1-based hole number.
 * @param {string[]} playerIds - Rotation order established at round setup.
 * @returns {string} The Wolf's player id.
 */
export function getWolfForHole(holeNumber, playerIds) {
  return playerIds[(holeNumber - 1) % playerIds.length];
}

/**
 * Resolve a single Wolf hole from net scores.
 *
 * Partner Wolf (2v2): the Wolf's side and the opposing pair each play best ball
 *   (lowest net of the two). Lower net wins: winners +1 each, losers -1 each;
 *   equal nets halve the hole with no point movement.
 * Lone Wolf (1v3): the Wolf's net is compared with the best net of the other
 *   three. The Wolf wins only by being strictly lower than every opponent —
 *   tying the lowest opponent is a loss. Win: Wolf +2 from each opponent
 *   (+2*opponents total), each opponent -2. Loss: the reverse. A Lone Wolf hole
 *   cannot be halved.
 *
 * A player who picked up (pickedUp true) or has no gross has a null net and is
 * excluded from their side's best ball; a side with no net loses the hole.
 *
 * @param {Object<string,{gross:(number|null), pickedUp?:boolean}>} holeScores
 * @param {string} wolfPlayerId
 * @param {string|null} partnerPlayerId - null means Lone Wolf.
 * @param {Array<{playerId:string, courseHandicap:number}>} playerRounds
 * @param {{number:number, par:number, hcpRank:number, isParThree:boolean}} holeData
 * @returns {{
 *   wolfResult:('won'|'lost'|'halved'),
 *   isLoneWolf:boolean,
 *   pointChanges:Object<string, number>,
 *   netScores:Object<string, (number|null)>
 * }}
 */
export function resolveWolfHole(holeScores, wolfPlayerId, partnerPlayerId, playerRounds, holeData) {
  const isLoneWolf = partnerPlayerId == null;
  const ids = playerRounds.map((pr) => pr.playerId);
  const chById = {};
  for (const pr of playerRounds) chById[pr.playerId] = pr.courseHandicap;

  const netScores = {};
  for (const id of ids) {
    const s = holeScores[id];
    if (!s || s.pickedUp === true || s.gross == null) {
      netScores[id] = null;
    } else {
      netScores[id] = s.gross - strokesForHole(chById[id], holeData.hcpRank);
    }
  }

  const pointChanges = {};
  for (const id of ids) pointChanges[id] = 0;

  const opponents = ids.filter((id) => id !== wolfPlayerId && id !== partnerPlayerId);
  const bestNet = (group) => {
    const nets = group.map((id) => netScores[id]).filter((n) => n != null);
    return nets.length ? Math.min(...nets) : null;
  };

  let wolfResult;
  if (isLoneWolf) {
    const wolfNet = netScores[wolfPlayerId];
    const oppBest = bestNet(opponents);
    // Wolf wins only if strictly lower than every opponent; a tie is a loss.
    let won;
    if (wolfNet == null) won = false;
    else if (oppBest == null) won = true;
    else won = wolfNet < oppBest;

    wolfResult = won ? 'won' : 'lost';
    const swing = won ? 2 : -2;
    pointChanges[wolfPlayerId] = swing * opponents.length;
    for (const id of opponents) pointChanges[id] = -swing;
  } else {
    const wolfTeamNet = bestNet([wolfPlayerId, partnerPlayerId]);
    const oppTeamNet = bestNet(opponents);

    if (wolfTeamNet == null && oppTeamNet == null) wolfResult = 'halved';
    else if (oppTeamNet == null) wolfResult = 'won';
    else if (wolfTeamNet == null) wolfResult = 'lost';
    else if (wolfTeamNet < oppTeamNet) wolfResult = 'won';
    else if (oppTeamNet < wolfTeamNet) wolfResult = 'lost';
    else wolfResult = 'halved';

    if (wolfResult === 'won') {
      pointChanges[wolfPlayerId] = 1;
      pointChanges[partnerPlayerId] = 1;
      for (const id of opponents) pointChanges[id] = -1;
    } else if (wolfResult === 'lost') {
      pointChanges[wolfPlayerId] = -1;
      pointChanges[partnerPlayerId] = -1;
      for (const id of opponents) pointChanges[id] = 1;
    }
    // halved: no point movement.
  }

  return { wolfResult, isLoneWolf, pointChanges, netScores };
}

/**
 * Build the persisted WolfHoleRecord for a hole by resolving the outcome and
 * folding in the decision context. `declaredLoneWolf` distinguishes a Wolf who
 * proactively called Lone Wolf from one who simply never picked a partner: a
 * Lone Wolf hole with no declaration is an *automatic* Lone Wolf.
 *
 * @param {number} holeNumber
 * @param {{wolfPlayerId:string, partnerPlayerId?:(string|null), declaredLoneWolf?:boolean}} decision
 * @param {Object<string,{gross:(number|null), pickedUp?:boolean}>} holeScores
 * @param {Array<{playerId:string, courseHandicap:number}>} playerRounds
 * @param {{number:number, par:number, hcpRank:number, isParThree:boolean}} holeData
 * @returns {Object} WolfHoleRecord
 */
export function createWolfHoleRecord(holeNumber, decision, holeScores, playerRounds, holeData) {
  const wolfPlayerId = decision.wolfPlayerId;
  const partnerPlayerId = decision.partnerPlayerId ?? null;
  const declaredLoneWolf = decision.declaredLoneWolf === true;

  const resolved = resolveWolfHole(holeScores, wolfPlayerId, partnerPlayerId, playerRounds, holeData);
  const isLoneWolf = resolved.isLoneWolf;

  return {
    holeNumber,
    wolfPlayerId,
    partnerPlayerId,
    isLoneWolf,
    isAutomaticLoneWolf: isLoneWolf && !declaredLoneWolf,
    wolfResult: resolved.wolfResult,
    pointChanges: resolved.pointChanges,
    netScores: resolved.netScores,
  };
}

/**
 * Compute Wolf standings from the per-hole records entered so far.
 *
 * @param {Object} round - Carries playerIds (or playerRounds).
 * @param {Array<Object>} wolfHoles - WolfHoleRecord objects.
 * @returns {{standings:Array<{playerId:string, points:number, holesAsWolf:number, holesAsPartner:number}>}}
 *   Sorted by points descending, ties broken by playerId for determinism.
 */
export function computeWolfStandings(round, wolfHoles) {
  const ids = playerIdsOf(round);
  const points = {};
  const holesAsWolf = {};
  const holesAsPartner = {};
  for (const id of ids) {
    points[id] = 0;
    holesAsWolf[id] = 0;
    holesAsPartner[id] = 0;
  }

  for (const rec of wolfHoles) {
    const changes = rec.pointChanges || {};
    for (const id of ids) points[id] += changes[id] || 0;
    if (rec.wolfPlayerId != null && holesAsWolf[rec.wolfPlayerId] !== undefined) {
      holesAsWolf[rec.wolfPlayerId] += 1;
    }
    if (rec.partnerPlayerId != null && holesAsPartner[rec.partnerPlayerId] !== undefined) {
      holesAsPartner[rec.partnerPlayerId] += 1;
    }
  }

  const standings = ids
    .map((id) => ({
      playerId: id,
      points: points[id],
      holesAsWolf: holesAsWolf[id],
      holesAsPartner: holesAsPartner[id],
    }))
    .sort((a, b) => b.points - a.points || (a.playerId < b.playerId ? -1 : 1));

  return { standings };
}

/**
 * Compute the Wolf settlement in dollars.
 *
 * Points are conserved every hole (each hole's point changes sum to zero and
 * encode peer-to-peer swings), so a player's net settlement is simply their
 * total points times the per-point dollar value — point-to-point between players
 * in aggregate, and zero-sum across the group.
 *
 * @param {Object} round - Carries playerIds and the point value
 *   (round.payouts.wolfPointValue or round.wolfPointValue).
 * @param {Array<Object>} wolfHoles - WolfHoleRecord objects.
 * @returns {Object<string, number>} playerId -> net dollars (positive = receives).
 */
export function computeWolfSettlement(round, wolfHoles) {
  const ids = playerIdsOf(round);
  const value = (round.payouts && round.payouts.wolfPointValue) ?? round.wolfPointValue ?? 0;
  const { standings } = computeWolfStandings(round, wolfHoles);

  const result = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const s of standings) result[s.playerId] = s.points * value;
  return result;
}

// Side bets: greenie, net birdie, net eagle, sandie.
// Pure functions, no side effects, no React dependencies. See spec sections 2.1, 2.5.
//
// Net scores use the full course-handicap ("skins") stroke allocation, matching
// skins.js — including double strokes when a course handicap laps 18. Players
// with no recorded gross are excluded from a bet.

const STANDARD_ROUND_HOLES = 18;

/**
 * Full-CH strokes received on a single hole. Mirrors computeStrokeHolesSkins
 * (strokeHoles.js) for one hole, using the standard 18-hole lapping divisor.
 */
function strokesForHole(courseHandicap, hcpRank) {
  const base = Math.floor(courseHandicap / STANDARD_ROUND_HOLES);
  const remainder = courseHandicap % STANDARD_ROUND_HOLES;
  return base + (hcpRank <= remainder ? 1 : 0);
}

/** Net score for a player on a hole, or null if they have no scoring result. */
function netScoreFor(playerScore, courseHandicap, holeData) {
  if (!playerScore || playerScore.gross == null) return null;
  return playerScore.gross - strokesForHole(courseHandicap, holeData.hcpRank);
}

/**
 * Resolve all four side bets for a single hole.
 *
 * Greenie: par-3 holes only. A player must be closest to the pin AND make par
 *   or better (gross). At most one winner; no carry when nobody qualifies.
 * Net birdie: net <= par - 1.
 * Net eagle: net <= par - 2. Eagle supersedes birdie for the same player on the
 *   same hole (a qualifier appears in netEagles, never also in netBirdies).
 * Sandie: inBunker true AND par or better net.
 *
 * @param {{holeNumber:number, scores:Object<string,{gross:number, inBunker?:boolean, closestOnParThree?:boolean}>}} holeScores
 * @param {Array<{playerId:string, courseHandicap:number}>} playerRounds
 * @param {{number:number, par:number, hcpRank:number, isParThree:boolean}} holeData
 * @returns {{greenie:(string|null), netBirdies:string[], netEagles:string[], sandies:string[]}}
 */
export function resolveSideBets(holeScores, playerRounds, holeData) {
  const scores = (holeScores && holeScores.scores) || {};

  // --- Greenie (par 3 only, max one winner, no carry) ---
  let greenie = null;
  if (holeData.isParThree) {
    const winner = playerRounds
      .map((pr) => pr.playerId)
      .find((id) => {
        const s = scores[id];
        if (!s || s.gross == null) return false;
        return s.closestOnParThree === true && s.gross <= holeData.par;
      });
    greenie = winner ?? null;
  }

  // --- Net eagles / net birdies (eagle supersedes birdie) ---
  const netEagles = [];
  const netBirdies = [];
  for (const pr of playerRounds) {
    const net = netScoreFor(scores[pr.playerId], pr.courseHandicap, holeData);
    if (net == null) continue;
    if (net <= holeData.par - 2) netEagles.push(pr.playerId);
    else if (net <= holeData.par - 1) netBirdies.push(pr.playerId);
  }

  // --- Sandies (in bunker + par or better net) ---
  const sandies = [];
  for (const pr of playerRounds) {
    const s = scores[pr.playerId];
    if (!s || s.gross == null || s.inBunker !== true) continue;
    const net = netScoreFor(s, pr.courseHandicap, holeData);
    if (net != null && net <= holeData.par) sandies.push(pr.playerId);
  }

  return { greenie, netBirdies, netEagles, sandies };
}

/**
 * Compute per-player side-bet win counts and dollar totals across every hole.
 *
 * Each bet is a pool: every qualifier collects `amount` from every non-qualifier.
 * For each category, the plain field (`greenies`, `netBirdies`, `netEagles`,
 * `sandies`) is the WIN COUNT — how many holes that player qualified for that
 * bet. The `*Dollars` field is the NET DOLLARS for that category (positive =
 * received, negative = paid). `total` is the sum of the four dollar fields —
 * the settlement figure. Every category is zero-sum, so all totals sum to $0.
 *
 * @param {{
 *   playerRounds:Array<{playerId:string, courseHandicap:number}>,
 *   holes:Array<{holeNumber:number, scores:Object}>,
 *   courseHoles:Array<{number:number, par:number, hcpRank:number, isParThree:boolean}>,
 *   payouts:{greenie:number, netBirdie:number, netEagle:number, sandie:number}
 * }} round
 * @returns {Object<string,{
 *   greenies:number, netBirdies:number, netEagles:number, sandies:number,
 *   greeniesDollars:number, netBirdiesDollars:number, netEaglesDollars:number, sandiesDollars:number,
 *   total:number
 * }>}
 */
export function computeSideBetTotals(round) {
  const { playerRounds, holes, courseHoles, payouts } = round;
  const ids = playerRounds.map((pr) => pr.playerId);

  const holeByNumber = {};
  for (const h of courseHoles) holeByNumber[h.number] = h;

  const acc = {};
  for (const id of ids) {
    acc[id] = {
      greenies: 0, netBirdies: 0, netEagles: 0, sandies: 0,
      greeniesDollars: 0, netBirdiesDollars: 0, netEaglesDollars: 0, sandiesDollars: 0,
    };
  }

  // `countField` gets +1 per winner (win count); `dollarField` gets the net pool flow.
  const applyPool = (winners, amount, countField, dollarField) => {
    if (!winners.length) return;
    const nonWinners = ids.filter((id) => !winners.includes(id));
    for (const w of winners) {
      acc[w][countField] += 1;
      acc[w][dollarField] += amount * nonWinners.length;
    }
    for (const n of nonWinners) acc[n][dollarField] -= amount * winners.length;
  };

  for (const hs of holes) {
    const holeData = holeByNumber[hs.holeNumber];
    if (!holeData) continue;
    const { greenie, netBirdies, netEagles, sandies } = resolveSideBets(hs, playerRounds, holeData);
    if (greenie) applyPool([greenie], payouts.greenie, 'greenies', 'greeniesDollars');
    applyPool(netEagles, payouts.netEagle, 'netEagles', 'netEaglesDollars');
    applyPool(netBirdies, payouts.netBirdie, 'netBirdies', 'netBirdiesDollars');
    applyPool(sandies, payouts.sandie, 'sandies', 'sandiesDollars');
  }

  const result = {};
  for (const id of ids) {
    const c = acc[id];
    result[id] = {
      ...c,
      total: c.greeniesDollars + c.netBirdiesDollars + c.netEaglesDollars + c.sandiesDollars,
    };
  }
  return result;
}

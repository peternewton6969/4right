// Final settlement: combine the team game (best-ball match play OR scramble),
// the individual games (skins, wolf), snake, and the junk/side bets into a single
// per-player net and a plain-English list of who-pays-whom.
// Pure functions, no side effects, no React dependencies. See spec sections 2.1, 2.6.
//
// Game selection follows the round data model (store.js):
//   round.teamGame              : 'bestBall' | 'scramble' | null  (one team game or none)
//   round.teamGamePayout        : number
//   round.teamAssignments       : { [playerId]: 'A' | 'B' }
//   round.individualGames       : subset of ['skins', 'wolf']
//   round.individualGamePayouts : { skins, wolfPointValue }
//   round.junkGames             : subset of ['greenie','snake','sandy','netBirdie','netEagle']
//   round.junkGamePayouts       : { greenie, snake, sandy, netBirdie, netEagle }
//   round.playerIds             : string[] (2-4 players)
//   round.wolfHoles             : WolfHoleRecord[]
//
// A legacy round that instead carries a boolean `round.games` map, `round.teams`
// { A, B } arrays, and a flat `round.payouts` object is still accepted: the
// resolvers below normalize both shapes into `teams` + `payouts` up front, and
// the game-selection helpers fall back to `round.games`, so older callers keep
// working.

import { computeMatchPlayStatus } from './matchPlay.js';
import { computeSkinsStandings } from './skins.js';
import { computeSnakeFinal } from './snake.js';
import { computeSideBetTotals } from './sideBets.js';
import { computeScrambleSettlement } from './scramble.js';
import { computeWolfSettlement } from './wolf.js';

// All money is accumulated in integer cents so every column is exact and the
// net column sums to exactly zero; dollars are derived only at the boundary.
const toCents = (dollars) => Math.round(dollars * 100);
const toDollars = (cents) => cents / 100;
const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;

// --- Game-selection helpers (new model first, legacy `games` map fallback) ------

/**
 * Which team game is active: 'bestBall', 'scramble', or null.
 * New model reads round.teamGame directly. Legacy rounds (no teamGame field)
 * treat match play as on unless round.games.matchPlay === false.
 */
function teamGameKind(round) {
  if (round.teamGame !== undefined) return round.teamGame; // 'bestBall' | 'scramble' | null
  if (!round.games || round.games.matchPlay !== false) return 'bestBall';
  return null;
}

/** Is an individual game ('skins' | 'wolf') active this round? */
function individualActive(round, game) {
  if (round.individualGames !== undefined) return round.individualGames.includes(game);
  // Legacy model has no wolf; skins is on unless explicitly toggled off.
  if (game === 'skins') return !(round.games && round.games.skins === false);
  return false;
}

/** Is snake active this round? */
function snakeActive(round) {
  if (round.junkGames !== undefined) return round.junkGames.includes('snake');
  return !(round.games && round.games.snake === false);
}

/**
 * Is a junk/side bet ('greenie'|'netBirdie'|'netEagle'|'sandy') active?
 * Legacy rounds applied all side bets unconditionally, so default to true.
 */
function junkActive(round, game) {
  if (round.junkGames !== undefined) return round.junkGames.includes(game);
  return true;
}

// --- Shape resolvers (normalize new-model fields into teams + payouts) -----------

/** The player ids for the round: round.playerIds, else derived from playerRounds. */
function playerIdsOf(round) {
  if (Array.isArray(round.playerIds) && round.playerIds.length > 0) return round.playerIds;
  return (round.playerRounds || []).map((pr) => pr.playerId);
}

/**
 * Resolve `{ A, B }` team arrays. Prefers an explicit legacy `round.teams`; else
 * builds them from `round.teamAssignments` ({ playerId: 'A'|'B' }) in player order.
 */
function resolveTeams(round) {
  if (round.teams && Array.isArray(round.teams.A) && Array.isArray(round.teams.B)) {
    return round.teams;
  }
  const assignments = round.teamAssignments || {};
  const A = [];
  const B = [];
  for (const id of playerIdsOf(round)) {
    if (assignments[id] === 'A') A.push(id);
    else if (assignments[id] === 'B') B.push(id);
  }
  return { A, B };
}

/**
 * Resolve the flat `payouts` object the sub-engines read, drawing from the new
 * grouped fields first (teamGamePayout / individualGamePayouts / junkGamePayouts)
 * and falling back to a legacy flat `round.payouts`. Note the junk `sandy` key
 * maps to the side-bet engine's `sandie`.
 */
function resolvePayouts(round) {
  const p = round.payouts || {};
  const ig = round.individualGamePayouts || {};
  const jg = round.junkGamePayouts || {};
  const teamPay = round.teamGamePayout ?? p.teamGame ?? p.matchPlay;
  return {
    matchPlay: round.teamGamePayout ?? p.matchPlay, // best-ball stake
    teamGame: teamPay, // scramble per-player payout
    skinsPool: ig.skins ?? p.skinsPool,
    wolfPointValue: ig.wolfPointValue ?? p.wolfPointValue,
    snake: jg.snake ?? p.snake,
    greenie: jg.greenie ?? p.greenie,
    netBirdie: jg.netBirdie ?? p.netBirdie,
    netEagle: jg.netEagle ?? p.netEagle,
    sandie: jg.sandy ?? p.sandie,
  };
}

// --- Column computations (each returns a { playerId: cents } map) ---------------

/**
 * Best-ball (match play) net in cents. Pairwise settlement (matching the snake
 * and side-bet model and the corrected spec 3.5): each losing-team player pays
 * each winning-team player the match-play stake. For 2v2 at $25 this is ±$50.
 */
function bestBallCents(round, ids) {
  const cents = Object.fromEntries(ids.map((id) => [id, 0]));
  const { winner } = computeMatchPlayStatus(round);
  if (!winner) return cents; // tie or in progress: no payout

  const stake = toCents(round.payouts.matchPlay);
  const winners = round.teams[winner];
  const losers = round.teams[winner === 'A' ? 'B' : 'A'];
  for (const w of winners) cents[w] += stake * losers.length;
  for (const l of losers) cents[l] -= stake * winners.length;
  return cents;
}

/** Scramble net in cents (delegates to the scramble engine, which is zero-sum). */
function scrambleCents(round, ids) {
  const cents = Object.fromEntries(ids.map((id) => [id, 0]));
  const dollars = computeScrambleSettlement(round);
  for (const id of ids) cents[id] = toCents(dollars[id] || 0);
  return cents;
}

/**
 * Team-game net in cents, dispatched on the active team game. null => zeroes.
 */
function teamGameCents(round, ids) {
  const kind = teamGameKind(round);
  if (kind === 'scramble') return scrambleCents(round, ids);
  if (kind === 'bestBall') return bestBallCents(round, ids);
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

/**
 * Skins net in cents. Every player buys into the pool equally; each skin won
 * pays pool / totalSkins. Net = skinsWon * perSkin - buyIn. Exact division is
 * used, then the per-cent rounding residual (if any) is folded into the biggest
 * skins winner so the column still sums to exactly zero.
 */
function skinsCents(round, ids) {
  const cents = Object.fromEntries(ids.map((id) => [id, 0]));
  const { standings } = computeSkinsStandings(round);
  const wonById = Object.fromEntries(standings.map((s) => [s.playerId, s.skinsWon]));
  const totalSkins = standings.reduce((sum, s) => sum + s.skinsWon, 0);
  if (totalSkins === 0) return cents; // pool never distributed

  const pool = round.payouts.skinsPool;
  const buyIn = pool / ids.length;
  const perSkin = pool / totalSkins;
  for (const id of ids) cents[id] = toCents((wonById[id] || 0) * perSkin - buyIn);

  // Reconcile any rounding residual (keeps the column zero-sum to the cent).
  const residual = -ids.reduce((sum, id) => sum + cents[id], 0);
  if (residual !== 0) {
    const biggestWinner = [...ids].sort(
      (a, b) => (wonById[b] || 0) - (wonById[a] || 0) || (a < b ? -1 : 1),
    )[0];
    cents[biggestWinner] += residual;
  }
  return cents;
}

/**
 * Wolf net in cents (delegates to the wolf engine, which is zero-sum). Reads the
 * per-point value from round.individualGamePayouts.wolfPointValue and the
 * per-hole records from round.wolfHoles.
 */
function wolfCents(round, ids) {
  const cents = Object.fromEntries(ids.map((id) => [id, 0]));
  const pointValue =
    (round.individualGamePayouts && round.individualGamePayouts.wolfPointValue) ??
    (round.payouts && round.payouts.wolfPointValue) ??
    0;
  const dollars = computeWolfSettlement(
    { playerRounds: round.playerRounds, wolfPointValue: pointValue },
    round.wolfHoles || [],
  );
  for (const id of ids) cents[id] = toCents(dollars[id] || 0);
  return cents;
}

/**
 * Junk/side-bet net in cents. computeSideBetTotals returns per-category dollar
 * fields; we sum only the categories active this round, so an inactive junk game
 * contributes 0 to every player (and each active category is itself zero-sum).
 */
function sideBetsCents(round, ids) {
  const cents = Object.fromEntries(ids.map((id) => [id, 0]));
  const totals = computeSideBetTotals(round);
  for (const id of ids) {
    const t = totals[id] || {};
    let dollars = 0;
    if (junkActive(round, 'greenie')) dollars += t.greeniesDollars || 0;
    if (junkActive(round, 'netBirdie')) dollars += t.netBirdiesDollars || 0;
    if (junkActive(round, 'netEagle')) dollars += t.netEaglesDollars || 0;
    if (junkActive(round, 'sandy')) dollars += t.sandiesDollars || 0;
    cents[id] = toCents(dollars);
  }
  return cents;
}

// --- Instructions + names -------------------------------------------------------

/**
 * Build the minimal-ish list of transfers via a greedy debtor→creditor match.
 * Deterministic: largest debts and credits settle first, ties broken by id.
 */
function buildInstructions(netCents, nameOf) {
  const debtors = [];
  const creditors = [];
  for (const id of Object.keys(netCents)) {
    if (netCents[id] < 0) debtors.push({ id, cents: -netCents[id] });
    else if (netCents[id] > 0) creditors.push({ id, cents: netCents[id] });
  }
  const byAmount = (a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1);
  debtors.sort(byAmount);
  creditors.sort(byAmount);

  const instructions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].cents, creditors[j].cents);
    if (pay > 0) {
      instructions.push(`${nameOf(debtors[i].id)} pays ${nameOf(creditors[j].id)} ${fmt(pay)}`);
    }
    debtors[i].cents -= pay;
    creditors[j].cents -= pay;
    if (debtors[i].cents === 0) i += 1;
    if (creditors[j].cents === 0) j += 1;
  }
  return instructions;
}

function buildNameMap(round) {
  const map = {};
  if (Array.isArray(round.players)) {
    for (const p of round.players) map[p.id] = p.name;
  }
  for (const pr of round.playerRounds) {
    if (pr.name != null && map[pr.playerId] == null) map[pr.playerId] = pr.name;
  }
  return map;
}

// --- Public entry point ---------------------------------------------------------

/**
 * Compute the full settlement for a round.
 *
 * Accepts the new round shape (grouped fields) or the legacy shape (flat
 * `payouts` + `teams` + `games`); both are normalized internally.
 *
 * @param {{
 *   playerIds?:string[],
 *   playerRounds:Array<{playerId:string, name?:string, courseHandicap:number, differential:number}>,
 *   players?:Array<{id:string, name:string}>,
 *   holes:Array<Object>,
 *   courseHoles:Array<{number:number, par:number, hcpRank:number, isParThree:boolean}>,
 *   teamGame?:('bestBall'|'scramble'|null),
 *   teamGamePayout?:number,
 *   teamAssignments?:Object<string,('A'|'B')>,
 *   individualGames?:string[],
 *   individualGamePayouts?:{skins?:number, wolfPointValue?:number},
 *   junkGames?:string[],
 *   junkGamePayouts?:{greenie?:number, snake?:number, sandy?:number, netBirdie?:number, netEagle?:number},
 *   wolfHoles?:Array<Object>,
 *   teams?:{A:string[], B:string[]},
 *   payouts?:{matchPlay?:number, skinsPool?:number, snake?:number, greenie?:number, netBirdie?:number, netEagle?:number, sandie?:number, teamGame?:number},
 *   games?:Object<string, boolean>
 * }} round
 * @returns {Object} A map of playerId -> {teamGame, skins, wolf, snake, sideBets, net}
 *   (all in dollars), plus an `instructions` string[] of who-pays-whom.
 */
export function computeSettlement(round) {
  const ids = playerIdsOf(round);
  const zero = () => Object.fromEntries(ids.map((id) => [id, 0]));

  // Normalize the round so every sub-engine sees a single `teams` + `payouts`
  // shape, regardless of whether the caller used the new grouped fields or the
  // legacy flat ones. Game-selection fields (teamGame/individualGames/junkGames)
  // are preserved by the spread and read directly by the *Active helpers.
  const norm = { ...round, teams: resolveTeams(round), payouts: resolvePayouts(round) };

  const teamGame = teamGameCents(norm, ids);
  const skins = individualActive(norm, 'skins') ? skinsCents(norm, ids) : zero();
  const wolf = individualActive(norm, 'wolf') ? wolfCents(norm, ids) : zero();

  const snake = zero();
  if (snakeActive(norm)) {
    const { payout } = computeSnakeFinal(norm);
    for (const id of ids) snake[id] = toCents(payout[id] || 0);
  }

  const sideBets = sideBetsCents(norm, ids);

  const netCents = {};
  for (const id of ids) {
    netCents[id] = teamGame[id] + skins[id] + wolf[id] + snake[id] + sideBets[id];
  }

  const nameMap = buildNameMap(norm);
  const nameOf = (id) => nameMap[id] ?? id;

  const result = {};
  for (const id of ids) {
    result[id] = {
      teamGame: toDollars(teamGame[id]),
      skins: toDollars(skins[id]),
      wolf: toDollars(wolf[id]),
      snake: toDollars(snake[id]),
      sideBets: toDollars(sideBets[id]),
      net: toDollars(netCents[id]),
    };
  }
  result.instructions = buildInstructions(netCents, nameOf);
  return result;
}

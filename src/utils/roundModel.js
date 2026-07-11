// Bridge from the current grouped round shape (spec §1.4 — teamGame /
// individualGames / junkGames / teamAssignments / *Payouts) to the legacy
// `games` boolean map, `teams: {A,B}` arrays, and flat `payouts` object that
// some UI components (ScoreEntry, Scoreboard) still read.
//
// The settlement engine already normalizes both shapes internally; this does the
// same for the view layer so a freshly-created round renders instead of crashing
// on `round.games.matchPlay` (undefined). Pure and idempotent: fields already
// present (legacy or historical rounds) are preserved, never overwritten.

/** Build `{ A, B }` id arrays from a `{ id: 'A'|'B' }` assignment map. */
function teamsFromAssignments(assignments) {
  const A = [];
  const B = [];
  if (assignments && typeof assignments === 'object') {
    for (const [id, side] of Object.entries(assignments)) {
      if (side === 'A') A.push(id);
      else if (side === 'B') B.push(id);
    }
  }
  return { A, B };
}

/**
 * Return `round` augmented with legacy `games` / `teams` / `payouts` view fields
 * derived from the grouped shape. Existing fields win, so this is a no-op for
 * rounds that already carry them.
 * @param {Object|null} round
 * @returns {Object|null}
 */
export function withLegacyRoundFields(round) {
  if (!round || typeof round !== 'object') return round;
  if (round.games && round.teams && round.payouts) return round;

  const teamGame = round.teamGame ?? null;
  const individualGames = Array.isArray(round.individualGames) ? round.individualGames : [];
  const junkGames = Array.isArray(round.junkGames) ? round.junkGames : [];
  const ig = round.individualGamePayouts ?? {};
  const jg = round.junkGamePayouts ?? {};

  const games = round.games ?? {
    matchPlay: teamGame === 'bestBall', // best-ball is the team match-play game
    bestBall: teamGame === 'bestBall',
    scramble: teamGame === 'scramble',
    skins: individualGames.includes('skins'),
    wolf: individualGames.includes('wolf'),
    greenie: junkGames.includes('greenie'),
    snake: junkGames.includes('snake'),
    sandie: junkGames.includes('sandy'), // junk key `sandy` -> engine/board key `sandie`
    netBirdie: junkGames.includes('netBirdie'),
    netEagle: junkGames.includes('netEagle'),
  };

  const teams = round.teams ?? teamsFromAssignments(round.teamAssignments);

  const payouts = round.payouts ?? {
    matchPlay: round.teamGamePayout, // best-ball team stake
    teamGame: round.teamGamePayout,
    skinsPool: ig.skins,
    skins: ig.skins,
    wolfPointValue: ig.wolfPointValue,
    snake: jg.snake,
    greenie: jg.greenie,
    sandie: jg.sandy,
    netBirdie: jg.netBirdie,
    netEagle: jg.netEagle,
  };

  return { ...round, games, teams, payouts };
}

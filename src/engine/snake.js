// Snake tracking: a "hot potato" bet held by the most recent three-putter.
// Pure functions, no side effects, no React dependencies. See spec sections 2.1, 2.4.

const FINAL_HOLE = 18;

/**
 * Resolve who holds the snake after a single hole.
 *
 * Per spec 2.4:
 *   - No three-putts:      holder is unchanged (carries over).
 *   - Exactly one:         that player takes (or keeps) the snake.
 *   - Two or more:         a simultaneous three-putt. The holder cannot be
 *                          derived — the UI must ask Peter who was last to
 *                          complete the putting stroke, and that manually
 *                          selected holder is passed in. `simultaneous` is
 *                          returned true so the caller can record it.
 *
 * @param {{scores:Object<string,{threePutt?:boolean}>}} holeScores - Full HoleScore object.
 * @param {string|null} previousSnakeHolder - Holder carried in from the prior hole.
 * @param {string|null} [selectedHolder] - Manually selected holder; required only
 *   when two or more players three-putt this hole. Must be one of the three-putters.
 *   Ignored otherwise (spec's per-hole `snakeHolder` may be passed unconditionally).
 * @returns {{holder:(string|null), changed:boolean, simultaneous:boolean}}
 */
export function resolveSnake(holeScores, previousSnakeHolder, selectedHolder = null) {
  const prev = previousSnakeHolder ?? null;
  const scores = (holeScores && holeScores.scores) || {};
  const threePutters = Object.keys(scores).filter(
    (id) => scores[id] && scores[id].threePutt === true,
  );

  if (threePutters.length === 0) {
    return { holder: prev, changed: false, simultaneous: false };
  }

  if (threePutters.length === 1) {
    const holder = threePutters[0];
    return { holder, changed: holder !== prev, simultaneous: false };
  }

  // Two or more three-putters: require a manually selected holder.
  if (selectedHolder == null) {
    throw new Error(
      'Simultaneous three-putt: a manually selected snake holder must be passed in.',
    );
  }
  if (!threePutters.includes(selectedHolder)) {
    throw new Error('Selected snake holder must be one of the three-putting players.');
  }
  return { holder: selectedHolder, changed: selectedHolder !== prev, simultaneous: true };
}

/**
 * Compute the final snake holder and payout after replaying every entered hole.
 *
 * Per spec 2.4: after hole 18 the holder pays the snake amount to each other
 * player (net for holder = -(others) * snakePayout, net for each other =
 * +snakePayout). If no one ever three-putts, the snake is never held and there
 * is no payout — every player nets 0.
 *
 * For a hole with a simultaneous three-putt, the stored per-hole `snakeHolder`
 * (Peter's manual selection) is used to resolve it.
 *
 * @param {{
 *   playerRounds:Array<{playerId:string}>,
 *   holes:Array<{holeNumber:number, scores:Object, snakeHolder?:(string|null)}>,
 *   payouts:{snake:number}
 * }} round
 * @returns {{holder:(string|null), payout:Object<string,number>}}
 *   payout: positive = receives, negative = pays.
 */
export function computeSnakeFinal(round) {
  const { playerRounds, payouts } = round;
  const snakePayout = payouts.snake;
  const playerIds = playerRounds.map((pr) => pr.playerId);

  const entered = [...round.holes].sort((a, b) => a.holeNumber - b.holeNumber);

  let holder = null;
  for (const hs of entered) {
    holder = resolveSnake(hs, holder, hs.snakeHolder ?? null).holder;
  }

  const payout = {};
  for (const id of playerIds) payout[id] = 0;

  if (holder == null) {
    return { holder: null, payout };
  }

  const others = playerIds.filter((id) => id !== holder);
  payout[holder] = -others.length * snakePayout;
  for (const id of others) payout[id] = snakePayout;

  return { holder, payout };
}

export { FINAL_HOLE };

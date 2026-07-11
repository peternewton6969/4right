// Course handicap and differential calculations.
// Pure functions, no side effects, no React dependencies. See spec sections 1.5 and 2.1.

/**
 * Compute the USGA course handicap for one player.
 *
 *   courseHandicap = round( handicapIndex * (slope / 113) + (rating - par) )
 *
 * @param {number} handicapIndex - Player handicap index (one decimal place).
 * @param {number} slope - Course slope rating.
 * @param {number} rating - Course rating.
 * @param {number} par - Course par.
 * @returns {number} Course handicap, rounded to the nearest integer.
 */
export function computeCourseHandicap(handicapIndex, slope, rating, par) {
  return Math.round(handicapIndex * (slope / 113) + (rating - par));
}

/**
 * Compute a player's differential given the low man's course handicap.
 * The differential is the player's course handicap minus the low man's.
 * Never negative; the low man's differential is always 0.
 *
 * @param {number} playerCH - This player's course handicap.
 * @param {number} lowManCH - The low man's course handicap.
 * @returns {number} Differential, always >= 0.
 */
export function computeDifferential(playerCH, lowManCH) {
  return Math.max(0, playerCH - lowManCH);
}

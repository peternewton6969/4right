// Player display helpers for the new player profile model
// ({ id, firstName, lastName, nickname, handicapIndex, createdAt, updatedAt }).
// Pure functions, no storage or React dependencies.

/**
 * Short display name: the nickname when present and non-empty, otherwise the
 * first name.
 * @param {{firstName?:string, nickname?:string}} player
 * @returns {string}
 */
export function getPlayerName(player) {
  if (!player) return '';
  const nickname = typeof player.nickname === 'string' ? player.nickname.trim() : '';
  if (nickname !== '') return player.nickname;
  return player.firstName ?? '';
}

/**
 * Full name: firstName + " " + lastName.
 * @param {{firstName?:string, lastName?:string}} player
 * @returns {string}
 */
export function getPlayerFullName(player) {
  if (!player) return '';
  return `${player.firstName ?? ''} ${player.lastName ?? ''}`;
}

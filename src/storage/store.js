// Local-storage read/write layer for the four top-level keys (spec section 1).
// No React dependencies. Works against the browser's localStorage when present;
// falls back to an in-memory backend (tests, SSR, any non-browser context) so
// the same API behaves identically everywhere.

import { generateId } from '../utils/generateId.js';

export const STORAGE_KEYS = {
  players: 'roastandrake_players',
  courses: 'roastandrake_courses',
  rounds: 'roastandrake_rounds',
  activeRound: 'roastandrake_active_round',
};

// --- Storage backend -----------------------------------------------------------

const memoryStore = new Map();
const memoryBackend = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => { memoryStore.set(k, String(v)); },
  removeItem: (k) => { memoryStore.delete(k); },
};

/**
 * Resolve the active backend at call time (not cached), so tests can inject or
 * remove globalThis.localStorage between operations. Access is wrapped in a
 * try/catch because touching localStorage can throw in locked-down sandboxes.
 */
function backend() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* fall through to memory backend */
  }
  return memoryBackend;
}

function readKey(key, fallback) {
  const raw = backend().getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt/non-JSON value: treat as absent rather than throwing.
    return fallback;
  }
}

function writeKey(key, value) {
  backend().setItem(key, JSON.stringify(value));
  return value;
}

function clearKey(key) {
  backend().removeItem(key);
}

// --- One-time key migration (4 Right! -> Roast and Rake rebrand) ----------------
// The app's localStorage keys were renamed from the `fourright_` prefix to
// `roastandrake_`. This copies any existing data from each old key to the new key
// (raw string copy, so it works for both JSON blobs and plain-string API keys),
// without clobbering data already under the new key, then retires the old key.
// Idempotent — safe to run on every startup. Must run BEFORE any store reads.
const LEGACY_KEY_RENAMES = [
  ['fourright_players', 'roastandrake_players'],
  ['fourright_courses', 'roastandrake_courses'],
  ['fourright_rounds', 'roastandrake_rounds'],
  ['fourright_active_round', 'roastandrake_active_round'],
  ['fourright_anthropic_key', 'roastandrake_anthropic_key'],
  ['fourright_golfapi_key', 'roastandrake_golfapi_key'],
  ['fourright_course_cache', 'roastandrake_course_cache'],
  ['fourright_analytics', 'roastandrake_analytics'],
];

/** Copy pre-rebrand `fourright_*` values to their `roastandrake_*` keys once. */
export function migrateStorageKeys() {
  const store = backend();
  for (const [oldKey, newKey] of LEGACY_KEY_RENAMES) {
    try {
      const oldVal = store.getItem(oldKey);
      if (oldVal == null) continue; // nothing stored under the old key
      if (store.getItem(newKey) == null) store.setItem(newKey, oldVal); // don't clobber
      store.removeItem(oldKey); // retire the old key either way
    } catch {
      /* one key failing must not abort the rest */
    }
  }
}

// --- Players (variable-size roster) --------------------------------------------
// Raw accessors read/write the full roster array as-is (no validation, no
// transformation) — savePlayer/deletePlayer below are the validated upsert API.

export const getPlayers = () => readKey(STORAGE_KEYS.players, []);
export const setPlayers = (players) => writeKey(STORAGE_KEYS.players, players);
export const clearPlayers = () => clearKey(STORAGE_KEYS.players);

// --- Courses (pre-loaded Prestonwood set + on-demand fetched courses) ----------

export const getCourses = () => readKey(STORAGE_KEYS.courses, []);
export const setCourses = (courses) => writeKey(STORAGE_KEYS.courses, courses);
export const clearCourses = () => clearKey(STORAGE_KEYS.courses);

/**
 * Insert or replace one course by id, leaving the rest untouched. Used when a
 * course fetched via the API (or a chosen tee thereof) is committed to a round, so
 * every screen that resolves `round.courseId` through getCourses() keeps working.
 * @returns {Array<Object>} the full course list after the upsert
 */
export function upsertCourse(course) {
  if (!course || typeof course.id !== 'string' || course.id === '') {
    throw new Error('upsertCourse: a course with a string id is required');
  }
  const list = getCourses();
  const idx = list.findIndex((c) => c.id === course.id);
  const next = idx >= 0 ? list.map((c, i) => (i === idx ? course : c)) : [...list, course];
  setCourses(next);
  return next;
}

// --- Favorite courses ("My Courses") -------------------------------------------
//
// A user-curated list of courses, persisted independently of the round-resolution
// `courses` key so it survives across sessions and the startup re-seed. Each record
// is { courseId, courseName, rating, slope, par, holes:[{number,par,hcpRank,isParThree}] }.
// A record whose `holes` is populated is "round-ready" (selectable without a re-fetch,
// e.g. the pre-seeded Prestonwood courses); a record added from a bare search result
// carries only id/name until it is resolved through a tee, which upgrades it in place.

export const FAVORITE_COURSES_KEY = 'rr_favorite_courses';

export const getFavoriteCourses = () => readKey(FAVORITE_COURSES_KEY, []);
export const setFavoriteCourses = (list) => writeKey(FAVORITE_COURSES_KEY, list);

/** True if a course id is currently favorited. */
export function isFavoriteCourse(courseId) {
  return getFavoriteCourses().some((f) => f.courseId === courseId);
}

/** Normalize any course-shaped object into the stored favorite record. */
function toFavoriteRecord(course) {
  const holes = Array.isArray(course.holes)
    ? course.holes.map((h) => ({
        number: h.number,
        par: h.par,
        hcpRank: h.hcpRank,
        isParThree: h.isParThree ?? h.par === 3,
      }))
    : [];
  return {
    courseId: course.id ?? course.courseId,
    courseName: course.name ?? course.courseName,
    rating: course.rating ?? null,
    slope: course.slope ?? null,
    par: course.par ?? null,
    holes,
  };
}

/**
 * Add a course to favorites if absent, remove it if present (matched by id).
 * @returns {{favorites: Array, favorited: boolean}} the new list and whether it is now favorited.
 */
export function toggleFavoriteCourse(course) {
  const id = course?.id ?? course?.courseId;
  if (typeof id !== 'string' || id === '') {
    throw new Error('toggleFavoriteCourse: a course with a string id is required');
  }
  const list = getFavoriteCourses();
  const idx = list.findIndex((f) => f.courseId === id);
  if (idx >= 0) {
    const favorites = list.filter((_, i) => i !== idx);
    setFavoriteCourses(favorites);
    return { favorites, favorited: false };
  }
  const favorites = [...list, toFavoriteRecord(course)];
  setFavoriteCourses(favorites);
  return { favorites, favorited: true };
}

/** Remove a favorite by course id. @returns {Array} the new favorites list. */
export function removeFavoriteCourse(courseId) {
  const favorites = getFavoriteCourses().filter((f) => f.courseId !== courseId);
  setFavoriteCourses(favorites);
  return favorites;
}

/** Delete the favorites key entirely (used by a full reset). */
export const clearFavoriteCourses = () => clearKey(FAVORITE_COURSES_KEY);

/**
 * Replace an existing favorite with a fully-resolved (round-ready) version, but only
 * if that course is already favorited. Called after a tee is chosen so a favorite
 * added from a bare search result gains its rating/slope/par/holes for next time.
 * @returns {Array} the (possibly unchanged) favorites list.
 */
export function updateFavoriteCourseIfPresent(course) {
  const id = course?.id ?? course?.courseId;
  const list = getFavoriteCourses();
  const idx = list.findIndex((f) => f.courseId === id);
  if (idx < 0) return list;
  const favorites = list.map((f, i) => (i === idx ? toFavoriteRecord(course) : f));
  setFavoriteCourses(favorites);
  return favorites;
}

/**
 * Seed the three Prestonwood courses into favorites the first time only — when the
 * key has never been written. A user who later removes every favorite keeps it empty
 * (we key off key-absence, not list length, so seeds are not resurrected).
 * @returns {Array} the favorites list after seeding.
 */
export function seedFavoriteCoursesIfEmpty() {
  if (backend().getItem(FAVORITE_COURSES_KEY) != null) return getFavoriteCourses();
  const seeded = defaultCourses().map(toFavoriteRecord);
  setFavoriteCourses(seeded);
  return seeded;
}

// --- Rounds (history) ----------------------------------------------------------

export const getRounds = () => readKey(STORAGE_KEYS.rounds, []);
export const setRounds = (rounds) => writeKey(STORAGE_KEYS.rounds, rounds);
export const clearRounds = () => clearKey(STORAGE_KEYS.rounds);

// --- Active round (single object or null) --------------------------------------

export const getActiveRound = () => readKey(STORAGE_KEYS.activeRound, null);
export const setActiveRound = (round) => writeKey(STORAGE_KEYS.activeRound, round);
export const clearActiveRound = () => clearKey(STORAGE_KEYS.activeRound);

/** Clear all top-level keys (convenience for a full reset). */
export function clearAll() {
  clearPlayers();
  clearCourses();
  clearRounds();
  clearActiveRound();
  clearFavoriteCourses();
}

// --- Player profile API (upsert / delete / lookup, validated) ------------------
//
// New player profile model:
//   { id, firstName, lastName, nickname, handicapIndex, createdAt, updatedAt }
// nickname: <= 5 chars (trimmed). handicapIndex: number in [0.0, 54.0].

/** Validate + normalize a nickname (trim, enforce max length). */
function normalizeNickname(raw) {
  const nickname = typeof raw === 'string' ? raw.trim() : '';
  if (nickname.length > 5) {
    throw new Error('savePlayer: nickname must be 5 characters or fewer');
  }
  return nickname;
}

/** Validate a handicap index is a number within [0.0, 54.0]. */
function validateHandicapIndex(hi) {
  if (typeof hi !== 'number' || Number.isNaN(hi) || hi < 0 || hi > 54) {
    throw new Error('savePlayer: handicapIndex must be a number between 0.0 and 54.0');
  }
  return hi;
}

/**
 * Upsert a player by id. Generates an id when missing, trims/validates the
 * nickname (<=5 chars) and handicapIndex (0.0-54.0), and stamps timestamps.
 * @returns {Object} the saved player.
 */
export function savePlayer(player) {
  if (!player || typeof player !== 'object') {
    throw new Error('savePlayer: a player object is required');
  }
  const nickname = normalizeNickname(player.nickname);
  const handicapIndex = validateHandicapIndex(player.handicapIndex);

  const roster = getPlayers();
  const now = new Date().toISOString();
  const id = player.id ?? generateId();
  const idx = roster.findIndex((p) => p.id === id);
  const existing = idx >= 0 ? roster[idx] : null;

  const saved = {
    id,
    firstName: player.firstName ?? '',
    lastName: player.lastName ?? '',
    nickname,
    handicapIndex,
    // Character notes are an append-only log ([{ id, text, createdAt }]); the summary
    // is the most recent AI-generated blurb. Preserve both across profile edits.
    characterNotes: Array.isArray(player.characterNotes)
      ? player.characterNotes
      : (existing?.characterNotes ?? []),
    characterSummary: player.characterSummary ?? existing?.characterSummary ?? '',
    createdAt: existing?.createdAt ?? player.createdAt ?? now,
    updatedAt: now,
  };

  const next = idx >= 0 ? roster.map((p, i) => (i === idx ? saved : p)) : [...roster, saved];
  setPlayers(next);
  return saved;
}

/** Remove a player from the roster by id. @returns {Array} the new roster. */
export function deletePlayer(id) {
  const next = getPlayers().filter((p) => p.id !== id);
  setPlayers(next);
  return next;
}

/** Look up a single player by id, or null. */
export function getPlayerById(id) {
  return getPlayers().find((p) => p.id === id) ?? null;
}

// --- Character notes (append-only log + AI summary) ----------------------------
//
// Each player profile carries `characterNotes: [{ id, text, createdAt }]` (append
// and delete only, never edited in place) and a `characterSummary` string (the most
// recently generated blurb). These helpers mutate just those fields on an existing
// player, leaving the rest of the profile untouched.

/** Update one player in place by id via `mutate`, or return null if not found. */
function updatePlayer(playerId, mutate) {
  const roster = getPlayers();
  const idx = roster.findIndex((p) => p.id === playerId);
  if (idx < 0) return null;
  const updated = { ...mutate(roster[idx]), updatedAt: new Date().toISOString() };
  setPlayers(roster.map((p, i) => (i === idx ? updated : p)));
  return updated;
}

/** Append a timestamped character note. Empty/blank text is ignored. @returns updated player | null */
export function addCharacterNote(playerId, text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') return getPlayerById(playerId);
  return updatePlayer(playerId, (p) => {
    const notes = Array.isArray(p.characterNotes) ? p.characterNotes : [];
    const note = { id: generateId(), text: trimmed, createdAt: new Date().toISOString() };
    return { ...p, characterNotes: [...notes, note] };
  });
}

/** Remove a single character note by its id. @returns updated player | null */
export function deleteCharacterNote(playerId, noteId) {
  return updatePlayer(playerId, (p) => {
    const notes = Array.isArray(p.characterNotes) ? p.characterNotes : [];
    return { ...p, characterNotes: notes.filter((n) => n.id !== noteId) };
  });
}

/** Store the most recently generated AI character summary. @returns updated player | null */
export function setCharacterSummary(playerId, summary) {
  return updatePlayer(playerId, (p) => ({ ...p, characterSummary: String(summary ?? '') }));
}

// --- Round game-type vocabulary + validation -----------------------------------

export const TEAM_GAMES = ['bestBall', 'scramble'];
export const INDIVIDUAL_GAMES = ['skins', 'wolf'];
export const JUNK_GAMES = ['greenie', 'snake', 'sandy', 'netBirdie', 'netEagle'];

/** Enforce the round data-model rules (playerIds count + game vocabularies). */
function validateRound(round) {
  if (!round || typeof round !== 'object') {
    throw new Error('saveRound: a round object is required');
  }
  const ids = round.playerIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4) {
    throw new Error('saveRound: playerIds must have 2-4 entries');
  }
  if (!(round.teamGame == null || TEAM_GAMES.includes(round.teamGame))) {
    throw new Error('saveRound: teamGame must be null, "bestBall", or "scramble"');
  }
  if (round.individualGames !== undefined) {
    if (
      !Array.isArray(round.individualGames) ||
      !round.individualGames.every((g) => INDIVIDUAL_GAMES.includes(g))
    ) {
      throw new Error('saveRound: individualGames entries must be "skins" or "wolf"');
    }
  }
  if (round.junkGames !== undefined) {
    if (
      !Array.isArray(round.junkGames) ||
      !round.junkGames.every((g) => JUNK_GAMES.includes(g))
    ) {
      throw new Error(
        'saveRound: junkGames entries must be one of greenie|snake|sandy|netBirdie|netEagle',
      );
    }
  }
}

// --- Round history API (upsert / lookup, validated) ----------------------------

/**
 * Upsert a round into the rounds history by id. Generates an id when missing,
 * validates the round shape, and stamps timestamps.
 * @returns {Object} the saved round.
 */
export function saveRound(round) {
  validateRound(round);
  const rounds = getRounds();
  const now = new Date().toISOString();
  const id = round.id ?? generateId();
  const idx = rounds.findIndex((r) => r.id === id);
  const existing = idx >= 0 ? rounds[idx] : null;

  const saved = {
    ...round,
    id,
    createdAt: round.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = idx >= 0 ? rounds.map((r, i) => (i === idx ? saved : r)) : [...rounds, saved];
  setRounds(next);
  return saved;
}

/** Look up a single round in history by id, or null. */
export function getRoundById(id) {
  return getRounds().find((r) => r.id === id) ?? null;
}

/** Permanently remove a round from history by id. @returns {Array} the new history. */
export function deleteRound(id) {
  const next = getRounds().filter((r) => r.id !== id);
  setRounds(next);
  return next;
}

// --- Legacy player migration ---------------------------------------------------

/**
 * Migrate any legacy player profiles (single "name" field) to the new model.
 * Splits name on the first space into firstName/lastName, derives a nickname
 * from the first 5 lowercased characters of firstName, and preserves id,
 * handicapIndex, createdAt, and updatedAt. Idempotent: players already in the
 * new format (they have firstName) are left untouched. Writes back only when a
 * migration actually happened.
 * @returns {Array} the (possibly migrated) roster.
 */
export function migratePlayers() {
  const roster = getPlayers();
  if (!Array.isArray(roster) || roster.length === 0) return roster;

  let changed = false;
  const migrated = roster.map((p) => {
    // Already new format, or not a legacy record — leave as-is.
    if (!p || typeof p !== 'object' || p.firstName !== undefined || typeof p.name !== 'string') {
      return p;
    }
    changed = true;
    const raw = p.name.trim();
    const sp = raw.indexOf(' ');
    const firstName = sp === -1 ? raw : raw.slice(0, sp);
    const lastName = sp === -1 ? '' : raw.slice(sp + 1).trim();
    const nickname = firstName.slice(0, 5).toLowerCase();
    return {
      id: p.id,
      firstName,
      lastName,
      nickname,
      handicapIndex: p.handicapIndex,
      characterNotes: Array.isArray(p.characterNotes) ? p.characterNotes : [],
      characterSummary: p.characterSummary ?? '',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });

  if (changed) setPlayers(migrated);
  return migrated;
}

// --- Pre-loaded course data (spec section 1.3) ---------------------------------

// Each row is [par, hcpRank] in hole order 1..18. Par-3 flag is derived from par.
const MEADOWS_ROWS = [
  [4, 7], [3, 15], [5, 3], [4, 1], [5, 13], [4, 11], [3, 17], [4, 5], [4, 9],
  [3, 18], [4, 2], [5, 14], [4, 6], [3, 16], [4, 10], [4, 8], [5, 12], [4, 4],
];
const HIGHLANDS_ROWS = [
  [4, 1], [4, 9], [3, 13], [5, 11], [4, 5], [3, 17], [4, 3], [4, 15], [5, 7],
  [4, 14], [4, 12], [3, 18], [5, 10], [4, 2], [4, 4], [5, 8], [3, 16], [4, 6],
];
const FAIRWAYS_ROWS = [
  [4, 12], [3, 16], [5, 8], [4, 2], [3, 10], [4, 4], [3, 18], [4, 14], [4, 6],
  [5, 7], [4, 5], [3, 17], [5, 9], [4, 11], [3, 15], [4, 13], [4, 3], [4, 1],
];

function buildHoles(rows) {
  return rows.map(([par, hcpRank], i) => ({
    number: i + 1,
    par,
    hcpRank,
    isParThree: par === 3,
  }));
}

/**
 * Build a fresh copy of the three pre-loaded Prestonwood courses. IDs are stable
 * slugs (not random) so reloading is idempotent and round.courseId references
 * stay valid. Par reflects the spec's stated course par (used by the course-
 * handicap formula).
 *
 * @returns {Array<{id:string, name:string, rating:number, slope:number, par:number, holes:Array}>}
 */
export function defaultCourses() {
  return [
    { id: 'prestonwood-meadows', name: 'Prestonwood Meadows', rating: 72.3, slope: 133, par: 72, holes: buildHoles(MEADOWS_ROWS) },
    { id: 'prestonwood-highlands', name: 'Prestonwood Highlands', rating: 72.0, slope: 129, par: 72, holes: buildHoles(HIGHLANDS_ROWS) },
    { id: 'prestonwood-fairways', name: 'Prestonwood Fairways', rating: 68.4, slope: 127, par: 70, holes: buildHoles(FAIRWAYS_ROWS) },
  ];
}

/**
 * Pre-populate the courses key with the three Prestonwood courses and return them.
 * @returns {Array<Object>} the courses that were written.
 */
export function loadDefaultCourses() {
  const courses = defaultCourses();
  setCourses(courses);
  return courses;
}

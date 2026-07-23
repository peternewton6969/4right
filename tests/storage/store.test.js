import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  STORAGE_KEYS,
  getPlayers, setPlayers, clearPlayers,
  getCourses, setCourses, clearCourses,
  getRounds, setRounds, clearRounds,
  getActiveRound, setActiveRound, clearActiveRound,
  clearAll,
  defaultCourses, loadDefaultCourses,
  migrateStorageKeys,
  FAVORITE_COURSES_KEY,
  getFavoriteCourses, setFavoriteCourses, isFavoriteCourse,
  toggleFavoriteCourse, removeFavoriteCourse,
  updateFavoriteCourseIfPresent, seedFavoriteCoursesIfEmpty,
  saveCaptainsPreRound, saveCaptainsPostRound,
} from '../../src/storage/store.js';

// A minimal localStorage stand-in for exercising the browser code path.
function makeFakeLocalStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

beforeEach(() => {
  delete globalThis.localStorage; // default to the in-memory backend
  clearAll();
});

afterEach(() => {
  delete globalThis.localStorage;
});

// --- Defaults when unset -------------------------------------------------------

describe('store — defaults when a key is unset', () => {
  it('collection keys default to [], active round defaults to null', () => {
    expect(getPlayers()).toEqual([]);
    expect(getCourses()).toEqual([]);
    expect(getRounds()).toEqual([]);
    expect(getActiveRound()).toBeNull();
  });
});

// --- Players -------------------------------------------------------------------

describe('store — players', () => {
  const players = [
    { id: 'p1', name: 'Peter Newton', handicapIndex: 9.6 },
    { id: 'p2', name: 'Aaron Bailey', handicapIndex: 7.2 },
    { id: 'p3', name: 'Sean Cunningham', handicapIndex: 17.3 },
    { id: 'p4', name: 'Brooks Kaufman', handicapIndex: 11.0 },
  ];

  it('round-trips the roster through set/get', () => {
    setPlayers(players);
    expect(getPlayers()).toEqual(players);
  });

  it('clear removes the roster', () => {
    setPlayers(players);
    clearPlayers();
    expect(getPlayers()).toEqual([]);
  });

  it('returns a fresh copy each read (no shared references)', () => {
    setPlayers(players);
    const a = getPlayers();
    a[0].name = 'MUTATED';
    expect(getPlayers()[0].name).toBe('Peter Newton');
  });
});

// --- Courses + loadDefaultCourses ----------------------------------------------

describe('store — courses', () => {
  it('set/get/clear round-trips a courses array', () => {
    const courses = defaultCourses();
    setCourses(courses);
    expect(getCourses()).toEqual(courses);
    clearCourses();
    expect(getCourses()).toEqual([]);
  });

  it('loadDefaultCourses writes all three Prestonwood courses and returns them', () => {
    const returned = loadDefaultCourses();
    const stored = getCourses();
    expect(returned).toEqual(stored);
    expect(stored.map((c) => c.name)).toEqual([
      'Prestonwood Meadows',
      'Prestonwood Highlands',
      'Prestonwood Fairways',
    ]);
  });

  it('every course has 18 holes with unique hcpRanks 1..18 and derived par-3 flags', () => {
    for (const course of loadDefaultCourses()) {
      expect(course.holes).toHaveLength(18);
      const ranks = course.holes.map((h) => h.hcpRank).sort((a, b) => a - b);
      expect(ranks).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      expect(course.holes.map((h) => h.number)).toEqual(
        Array.from({ length: 18 }, (_, i) => i + 1),
      );
      for (const h of course.holes) expect(h.isParThree).toBe(h.par === 3);
    }
  });

  it('Meadows matches spec 1.3 (rating/slope/par and par-3 holes 2,7,10,14)', () => {
    const meadows = loadDefaultCourses().find((c) => c.name === 'Prestonwood Meadows');
    expect(meadows.rating).toBe(72.3);
    expect(meadows.slope).toBe(133);
    expect(meadows.par).toBe(72);
    // Hole pars foot to the stated par (hole 5 is a par 5 per the official card).
    expect(meadows.holes.reduce((s, h) => s + h.par, 0)).toBe(72);
    expect(meadows.holes.find((h) => h.number === 5).par).toBe(5);
    const par3s = meadows.holes.filter((h) => h.isParThree).map((h) => h.number);
    expect(par3s).toEqual([2, 7, 10, 14]);
    // Hole 4 is the number-one stroke hole.
    expect(meadows.holes.find((h) => h.number === 4).hcpRank).toBe(1);
  });

  it('Highlands and Fairways match spec 1.3 par-3 holes', () => {
    const courses = loadDefaultCourses();
    const highlands = courses.find((c) => c.name === 'Prestonwood Highlands');
    const fairways = courses.find((c) => c.name === 'Prestonwood Fairways');
    expect(highlands.holes.filter((h) => h.isParThree).map((h) => h.number)).toEqual([3, 6, 12, 17]);
    expect(highlands.par).toBe(72);
    expect(fairways.holes.filter((h) => h.isParThree).map((h) => h.number)).toEqual([2, 5, 7, 12, 15]);
    expect(fairways.par).toBe(70);
    // Fairways' hole pars genuinely sum to its stated par (70).
    expect(fairways.holes.reduce((s, h) => s + h.par, 0)).toBe(70);
  });

  it('loadDefaultCourses is idempotent (stable ids, no duplication)', () => {
    const first = loadDefaultCourses();
    const second = loadDefaultCourses();
    expect(getCourses()).toHaveLength(3);
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });
});

// --- Rounds --------------------------------------------------------------------

describe('store — rounds', () => {
  const rounds = [
    { id: 'r1', courseId: 'prestonwood-meadows', status: 'complete', holes: [] },
    { id: 'r2', courseId: 'prestonwood-highlands', status: 'complete', holes: [] },
  ];

  it('set/get/clear round-trips the rounds array', () => {
    setRounds(rounds);
    expect(getRounds()).toEqual(rounds);
    clearRounds();
    expect(getRounds()).toEqual([]);
  });
});

// --- Active round --------------------------------------------------------------

describe('store — active round', () => {
  const round = {
    id: 'r1',
    courseId: 'prestonwood-meadows',
    status: 'active',
    teams: { A: ['p1', 'p3'], B: ['p2', 'p4'] },
    holes: [
      { holeNumber: 1, scores: { p1: { gross: 5, threePutt: false } }, snakeHolder: null },
    ],
  };

  it('set/get round-trips a nested round object', () => {
    setActiveRound(round);
    expect(getActiveRound()).toEqual(round);
  });

  it('clear resets it to null', () => {
    setActiveRound(round);
    clearActiveRound();
    expect(getActiveRound()).toBeNull();
  });
});

// --- Key isolation -------------------------------------------------------------

describe('store — key isolation', () => {
  it('writing one key never disturbs the others', () => {
    setPlayers([{ id: 'p1' }]);
    loadDefaultCourses();
    setRounds([{ id: 'r1' }]);
    setActiveRound({ id: 'r1' });

    clearPlayers();
    expect(getPlayers()).toEqual([]);
    // Others untouched.
    expect(getCourses()).toHaveLength(3);
    expect(getRounds()).toEqual([{ id: 'r1' }]);
    expect(getActiveRound()).toEqual({ id: 'r1' });
  });

  it('uses the spec-defined storage keys', () => {
    expect(STORAGE_KEYS).toEqual({
      players: 'roastandrake_players',
      courses: 'roastandrake_courses',
      rounds: 'roastandrake_rounds',
      activeRound: 'roastandrake_active_round',
    });
  });
});

// --- Browser localStorage code path --------------------------------------------

describe('store — localStorage backend', () => {
  it('reads and writes through globalThis.localStorage when present', () => {
    const fake = makeFakeLocalStorage();
    globalThis.localStorage = fake;

    setPlayers([{ id: 'p1', name: 'Peter' }]);
    // Value is JSON-serialized under the spec key in the real backend.
    expect(fake.map.get(STORAGE_KEYS.players)).toBe(JSON.stringify([{ id: 'p1', name: 'Peter' }]));
    expect(getPlayers()).toEqual([{ id: 'p1', name: 'Peter' }]);

    clearPlayers();
    expect(fake.map.has(STORAGE_KEYS.players)).toBe(false);
  });

  it('falls back to the default on corrupt JSON', () => {
    const fake = makeFakeLocalStorage();
    globalThis.localStorage = fake;
    fake.map.set(STORAGE_KEYS.courses, '{not valid json');
    expect(getCourses()).toEqual([]);
  });
});

// --- Rebrand key migration (fourright_ -> roastandrake_) ------------------------

describe('store — migrateStorageKeys', () => {
  it('copies legacy fourright_ values to the new keys and retires the old ones', () => {
    const fake = makeFakeLocalStorage();
    globalThis.localStorage = fake;
    fake.map.set('fourright_players', JSON.stringify([{ id: 'p1' }])); // JSON blob
    fake.map.set('fourright_anthropic_key', 'sk-ant-legacy'); // plain string, not JSON

    migrateStorageKeys();

    expect(fake.map.get('roastandrake_players')).toBe(JSON.stringify([{ id: 'p1' }]));
    expect(fake.map.get('roastandrake_anthropic_key')).toBe('sk-ant-legacy');
    expect(fake.map.has('fourright_players')).toBe(false);
    expect(fake.map.has('fourright_anthropic_key')).toBe(false);
    // The store now reads the migrated roster through the new key.
    expect(getPlayers()).toEqual([{ id: 'p1' }]);
  });

  it('does not clobber data already under the new key, but still retires the old', () => {
    const fake = makeFakeLocalStorage();
    globalThis.localStorage = fake;
    fake.map.set('fourright_analytics', JSON.stringify([{ type: 'old' }]));
    fake.map.set('roastandrake_analytics', JSON.stringify([{ type: 'new' }]));

    migrateStorageKeys();

    expect(fake.map.get('roastandrake_analytics')).toBe(JSON.stringify([{ type: 'new' }]));
    expect(fake.map.has('fourright_analytics')).toBe(false);
  });

  it('is idempotent and leaves untouched keys alone', () => {
    const fake = makeFakeLocalStorage();
    globalThis.localStorage = fake;
    fake.map.set('roastandrake_rounds', JSON.stringify([{ id: 'r1' }]));

    migrateStorageKeys();
    migrateStorageKeys();

    expect(fake.map.get('roastandrake_rounds')).toBe(JSON.stringify([{ id: 'r1' }]));
    expect(fake.map.has('fourright_rounds')).toBe(false);
  });
});

// --- Favorite courses ("My Courses") -------------------------------------------

// Local mirror of the store's internal normalizer, for building test fixtures.
function toFav(c) {
  return {
    courseId: c.id ?? c.courseId,
    courseName: c.name ?? c.courseName,
    rating: c.rating ?? null,
    slope: c.slope ?? null,
    par: c.par ?? null,
    holes: Array.isArray(c.holes)
      ? c.holes.map((h) => ({ number: h.number, par: h.par, hcpRank: h.hcpRank, isParThree: h.isParThree ?? h.par === 3 }))
      : [],
  };
}

describe('store — favorite courses', () => {
  const searchHit = { id: 'og-123', name: 'Pebble Beach' }; // bare pointer (no tee data)
  const resolved = {
    id: 'og-123',
    name: 'Pebble Beach',
    rating: 74.9,
    slope: 144,
    par: 72,
    holes: [{ number: 1, par: 4, hcpRank: 6, isParThree: false }],
  };

  it('defaults to an empty list', () => {
    expect(getFavoriteCourses()).toEqual([]);
    expect(isFavoriteCourse('og-123')).toBe(false);
  });

  it('toggles a bare search result into a normalized pointer record', () => {
    const { favorited, favorites } = toggleFavoriteCourse(searchHit);
    expect(favorited).toBe(true);
    expect(favorites).toEqual([
      { courseId: 'og-123', courseName: 'Pebble Beach', rating: null, slope: null, par: null, holes: [] },
    ]);
    expect(isFavoriteCourse('og-123')).toBe(true);
  });

  it('toggling an existing favorite removes it', () => {
    toggleFavoriteCourse(searchHit);
    const { favorited, favorites } = toggleFavoriteCourse({ id: 'og-123', name: 'whatever' });
    expect(favorited).toBe(false);
    expect(favorites).toEqual([]);
    expect(isFavoriteCourse('og-123')).toBe(false);
  });

  it('stores full hole/tee data when a resolved course is favorited', () => {
    toggleFavoriteCourse(resolved);
    expect(getFavoriteCourses()[0]).toEqual({
      courseId: 'og-123',
      courseName: 'Pebble Beach',
      rating: 74.9,
      slope: 144,
      par: 72,
      holes: [{ number: 1, par: 4, hcpRank: 6, isParThree: false }],
    });
  });

  it('removeFavoriteCourse deletes by id', () => {
    setFavoriteCourses([
      toFav(resolved),
      { courseId: 'x', courseName: 'X', rating: null, slope: null, par: null, holes: [] },
    ]);
    const next = removeFavoriteCourse('og-123');
    expect(next.map((f) => f.courseId)).toEqual(['x']);
  });

  it('updateFavoriteCourseIfPresent upgrades an existing pointer, ignores absent ids', () => {
    toggleFavoriteCourse(searchHit); // pointer, no holes
    updateFavoriteCourseIfPresent(resolved); // same id, now round-ready
    expect(getFavoriteCourses()[0].holes).toHaveLength(1);
    expect(getFavoriteCourses()[0].par).toBe(72);

    // A course that isn't favorited must not be added.
    updateFavoriteCourseIfPresent({ id: 'not-saved', name: 'Nope', par: 70, holes: [] });
    expect(getFavoriteCourses().map((f) => f.courseId)).toEqual(['og-123']);
  });

  it('rejects a toggle without a string id', () => {
    expect(() => toggleFavoriteCourse({ name: 'no id' })).toThrow();
  });

  describe('seedFavoriteCoursesIfEmpty', () => {
    it('seeds the three Prestonwood courses when the key is absent', () => {
      const seeded = seedFavoriteCoursesIfEmpty();
      expect(seeded).toHaveLength(3);
      expect(seeded.map((f) => f.courseId)).toEqual([
        'prestonwood-meadows',
        'prestonwood-highlands',
        'prestonwood-fairways',
      ]);
      expect(seeded[0]).toMatchObject({ courseName: 'Prestonwood Meadows', par: 72 });
      expect(seeded[0].holes).toHaveLength(18);
      expect(FAVORITE_COURSES_KEY).toBe('rr_favorite_courses');
    });

    it('does not overwrite an existing (even empty) favorites list', () => {
      setFavoriteCourses([]); // key now present but empty (user cleared everything)
      expect(seedFavoriteCoursesIfEmpty()).toEqual([]);
      expect(getFavoriteCourses()).toEqual([]);
    });

    it('is a no-op when favorites already exist', () => {
      toggleFavoriteCourse(resolved);
      const after = seedFavoriteCoursesIfEmpty();
      expect(after.map((f) => f.courseId)).toEqual(['og-123']);
    });
  });
});

// --- Captain's Commentary fields on the round ----------------------------------

describe('store — captain\'s commentary', () => {
  it('saves pre- and post-round summaries onto the active round without clobbering', () => {
    setActiveRound({ id: 'r1', playerIds: ['p1', 'p2'], holes: [] });

    saveCaptainsPreRound('The Captain sizes up the field.');
    expect(getActiveRound().captainsPreRound).toBe('The Captain sizes up the field.');

    saveCaptainsPostRound('Final verdict: everyone lost but Peter.');
    const r = getActiveRound();
    expect(r.captainsPostRound).toBe('Final verdict: everyone lost but Peter.');
    expect(r.captainsPreRound).toBe('The Captain sizes up the field.'); // preserved
  });

  it('a regenerated summary overwrites the previous one', () => {
    setActiveRound({ id: 'r1', playerIds: ['p1', 'p2'], holes: [] });
    saveCaptainsPreRound('first');
    saveCaptainsPreRound('second');
    expect(getActiveRound().captainsPreRound).toBe('second');
  });

  it('returns null when there is no active round', () => {
    clearActiveRound();
    expect(saveCaptainsPreRound('x')).toBeNull();
    expect(saveCaptainsPostRound('y')).toBeNull();
  });
});

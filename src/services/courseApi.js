// Course search + scorecard fetch for Round Setup. Two external services are used
// per the feature spec: OpenGolfAPI for name search, and golfApi.io for the full
// scorecard (par / stroke index / rating / slope / tees). This app has no backend,
// so calls go straight from the browser and the golfApi.io key lives in this
// device's localStorage (same model as the Anthropic key in characterSummary.js).
//
// IMPORTANT: the exact JSON shapes of these third-party APIs are not verified here
// (no key / unknown CORS at build time). Requests are coded against the documented
// shapes below and normalized through the map* helpers — if the live contract
// differs, adjust ONLY those helpers; the rest of the app consumes the normalized
// shape { id, name, city, state, tees:[{ name, rating, slope, yardage, par, holes }] }.

const OPENGOLF_BASE = 'https://api.opengolfapi.org/v1';
const GOLFAPI_BASE = 'https://api.golfapi.io/v1';

const KEY_STORAGE = 'roastandrake_golfapi_key';
const CACHE_STORAGE = 'roastandrake_course_cache'; // { [courseId]: normalizedScorecard }

// --- golfApi.io key (entered once, kept on this device) ------------------------

/**
 * Resolve the golfApi.io key. Prefers the build-time env var VITE_GOLFAPI_KEY (set
 * in .env) so the user never has to enter it; falls back to a key saved on this
 * device (local dev without .env, or a legacy stored key).
 *
 * SECURITY: Vite inlines VITE_* vars into the client bundle at build time, so on a
 * PUBLIC deploy the key is embedded in the shipped JS and extractable by anyone.
 * Use a usage-restricted / rotatable golfApi.io key.
 */
export function getGolfApiKey() {
  const envKey = import.meta.env?.VITE_GOLFAPI_KEY;
  if (envKey) return String(envKey);
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/** True when a golfApi.io key is saved on this device. */
export function hasGolfApiKey() {
  return getGolfApiKey() !== '';
}

/** Save (or clear) the golfApi.io key. */
export function setGolfApiKey(key) {
  const trimmed = typeof key === 'string' ? key.trim() : '';
  try {
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore write failure */
  }
}

/** Clear a stored key (e.g. after an auth error) so the UI re-collects it. */
export function clearGolfApiKey() {
  setGolfApiKey('');
}

// --- Scorecard cache (localStorage, keyed by course id) ------------------------

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Return the cached normalized scorecard for a course id, or null. */
export function getCachedScorecard(courseId) {
  return readCache()[courseId] ?? null;
}

function cacheScorecard(courseId, scorecard) {
  try {
    const cache = readCache();
    cache[courseId] = scorecard;
    localStorage.setItem(CACHE_STORAGE, JSON.stringify(cache));
  } catch {
    /* ignore write failure — a cache miss next time is harmless */
  }
}

// --- Normalizers (the only place that knows the raw API shapes) ----------------

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null);

/** Map a search response into [{ id, name, city, state }]. Tolerates a bare array. */
export function mapSearchResults(json) {
  const rows = Array.isArray(json) ? json : Array.isArray(json?.courses) ? json.courses : [];
  return rows
    .map((r) => ({
      id: String(firstDefined(r.id, r.courseId, r.course_id, '')),
      name: String(firstDefined(r.name, r.courseName, r.club, '') || 'Unknown course'),
      city: String(firstDefined(r.city, r.location?.city, '') || ''),
      state: String(firstDefined(r.state, r.region, r.location?.state, '') || ''),
    }))
    .filter((r) => r.id !== '');
}

function mapHoles(rawHoles) {
  const holes = Array.isArray(rawHoles) ? rawHoles : [];
  return holes.map((h, i) => {
    const par = Number(firstDefined(h.par, h.holePar, 4)) || 4;
    return {
      number: Number(firstDefined(h.number, h.holeNumber, h.hole, i + 1)),
      par,
      hcpRank: Number(firstDefined(h.strokeIndex, h.handicap, h.hcp, h.index, i + 1)),
      isParThree: par === 3,
    };
  });
}

/**
 * Map a scorecard response into { id, name, city, state, tees:[...] }. Each tee is
 * { name, rating, slope, yardage, par, holes:[{number,par,hcpRank,isParThree}] }.
 * Hole data may live per-tee or at course level; par falls back to the sum of hole pars.
 */
export function mapScorecard(json, fallbackId) {
  const courseHoles = mapHoles(firstDefined(json?.holes, json?.scorecard, []));
  const rawTees = Array.isArray(json?.tees) ? json.tees : [];
  const tees = (rawTees.length ? rawTees : [{}]).map((t, i) => {
    const holes = t.holes ? mapHoles(t.holes) : courseHoles;
    const par =
      Number(firstDefined(t.par, json?.par)) ||
      holes.reduce((sum, h) => sum + h.par, 0) ||
      72;
    return {
      name: String(firstDefined(t.name, t.teeName, t.tee, t.color, `Tee ${i + 1}`)),
      rating: Number(firstDefined(t.rating, t.courseRating, json?.rating)) || null,
      slope: Number(firstDefined(t.slope, t.slopeRating, json?.slope)) || null,
      yardage: Number(firstDefined(t.yardage, t.totalYards, t.yards, t.length)) || null,
      par,
      holes,
    };
  });
  return {
    id: String(firstDefined(json?.id, json?.courseId, fallbackId, '')),
    name: String(firstDefined(json?.name, json?.courseName, 'Course')),
    city: String(firstDefined(json?.city, json?.location?.city, '') || ''),
    state: String(firstDefined(json?.state, json?.location?.state, '') || ''),
    tees,
  };
}

/**
 * Turn a chosen tee into the round-ready course shape the engine + downstream
 * screens expect: { id, name, rating, slope, par, holes, teeName, yardage }.
 * The id stays the base course id so history lookups and analytics group correctly.
 */
export function buildCourseFromTee(scorecard, tee) {
  return {
    id: scorecard.id,
    name: scorecard.name,
    rating: tee.rating ?? 72,
    slope: tee.slope ?? 113,
    par: tee.par,
    holes: tee.holes,
    teeName: tee.name,
    yardage: tee.yardage ?? null,
  };
}

// --- Network calls -------------------------------------------------------------

function apiError(message, extra = {}) {
  const err = new Error(message);
  Object.assign(err, extra);
  return err;
}

/**
 * Search courses by name via OpenGolfAPI (public, no key).
 * @param {string} query
 * @returns {Promise<Array<{id,name,city,state}>>}
 */
export async function searchCourses(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  let res;
  try {
    res = await fetch(`${OPENGOLF_BASE}/courses/search?q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    throw apiError('Course search is unavailable right now. Check your connection.', {
      code: 'network',
      cause: e,
    });
  }
  if (!res.ok) {
    throw apiError(`Course search failed (${res.status}).`, { status: res.status });
  }
  return mapSearchResults(await res.json());
}

/**
 * Get a full normalized scorecard for a course id. Serves from the localStorage
 * cache when present; otherwise fetches from golfApi.io (requires a key), caches
 * it, and returns it. The `source` tells the caller whether it was cache or live.
 *
 * @param {string} courseId
 * @returns {Promise<{ scorecard:Object, source:'cache'|'live', durationMs:number }>}
 */
export async function getScorecard(courseId) {
  const cached = getCachedScorecard(courseId);
  if (cached) return { scorecard: cached, source: 'cache', durationMs: 0 };

  const key = getGolfApiKey();
  if (!key) throw apiError('A golfApi.io API key is required to load course data.', { code: 'no_key' });

  const start = Date.now();
  let res;
  try {
    res = await fetch(`${GOLFAPI_BASE}/courses/${encodeURIComponent(courseId)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
    });
  } catch (e) {
    throw apiError('Could not reach the course service. Check your connection.', {
      code: 'network',
      cause: e,
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw apiError('That golfApi.io key was rejected.', { status: res.status, code: 'bad_key' });
  }
  if (!res.ok) {
    throw apiError(`Course fetch failed (${res.status}).`, { status: res.status });
  }
  const scorecard = mapScorecard(await res.json(), courseId);
  cacheScorecard(courseId, scorecard);
  return { scorecard, source: 'live', durationMs: Date.now() - start };
}

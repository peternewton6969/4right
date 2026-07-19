// Course search + scorecard fetch for Round Setup. Both use OpenGolfAPI (one
// provider, so the id from search is valid for the detail call — mixing providers
// caused the earlier 404). OpenGolfAPI is public and keyless (ODbL-licensed), so
// there is no API key anywhere: nothing is entered by the user or embedded in the
// build. This app has no backend; calls go straight from the browser.
//
//   search:  GET https://api.opengolfapi.org/v1/courses/search?q={query}
//   detail:  GET https://api.opengolfapi.org/api/v1/courses/{id}   (full scorecard)
//
// Responses are normalized through the map* helpers into the shape the app uses:
//   { id, name, city, state, tees:[{ key, name, rating, slope, yardage, par, holes }] }
// where holes are { number, par, hcpRank, isParThree }. If the live contract
// shifts, adjust ONLY those helpers.

const OPENGOLF_BASE = 'https://api.opengolfapi.org';

const CACHE_STORAGE = 'roastandrake_course_cache'; // { [courseId]: normalizedScorecard }

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
      // OpenGolfAPI carries the stroke index as `handicap_index`.
      hcpRank: Number(
        firstDefined(h.handicap_index, h.strokeIndex, h.stroke_index, h.handicap, h.hcp, h.index, i + 1),
      ),
      isParThree: par === 3,
    };
  });
}

/**
 * Map an OpenGolfAPI detail response into { id, name, city, state, tees:[...] }.
 * Per-course holes live in `holes_data`; `tees` carry rating/slope/yardage/par but
 * no holes, so every tee shares the same holes (stroke index is per course). Each
 * tee is { key, name, rating, slope, yardage, par, holes:[{number,par,hcpRank,isParThree}] }.
 */
export function mapScorecard(json, fallbackId) {
  const holes = mapHoles(firstDefined(json?.holes_data, json?.holes, json?.scorecard, []));
  const coursePar =
    Number(firstDefined(json?.par, json?.total_par)) ||
    holes.reduce((sum, h) => sum + h.par, 0) ||
    72;
  const rawTees = Array.isArray(json?.tees) ? json.tees : [];
  const tees = (rawTees.length ? rawTees : [{}]).map((t, i) => {
    const base = String(firstDefined(t.tee_name, t.name, t.tee_color, t.color, `Tee ${i + 1}`));
    const female = String(t.gender || '').toLowerCase() === 'female';
    return {
      key: String(firstDefined(t.tee_key, `${base}-${i}`)), // unique React key (male/female dupes)
      name: female ? `${base} (F)` : base,
      rating: Number(firstDefined(t.course_rating, t.rating)) || null,
      slope: Number(firstDefined(t.slope, t.slope_rating)) || null,
      yardage: Number(firstDefined(t.yardage, t.yards, t.length)) || null,
      par: Number(firstDefined(t.par, coursePar)) || coursePar,
      holes,
    };
  });
  return {
    id: String(firstDefined(json?.id, json?.courseId, fallbackId, '')),
    name: String(firstDefined(json?.name, json?.course_name, json?.courseName, 'Course')),
    city: String(firstDefined(json?.city, '') || ''),
    state: String(firstDefined(json?.state, '') || ''),
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
  const url = `${OPENGOLF_BASE}/v1/courses/search?q=${encodeURIComponent(q)}`;
  // eslint-disable-next-line no-console
  console.info('[courseApi] SEARCH GET', url);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw apiError('Course search is unavailable right now. Check your connection.', {
      code: 'network',
      cause: e,
    });
  }
  if (!res.ok) {
    throw apiError(`Course search failed (${res.status}).`, { status: res.status });
  }
  const json = await res.json();
  const rows = mapSearchResults(json);
  // Diagnostic: show the raw response and the ids we extract, so a wrong id field
  // (a common cause of the follow-up scorecard 404) is visible.
  // eslint-disable-next-line no-console
  console.info('[courseApi] SEARCH raw response:', json);
  // eslint-disable-next-line no-console
  console.info('[courseApi] SEARCH mapped ids:', rows.map((r) => ({ id: r.id, name: r.name })));
  return rows;
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

  const url = `${OPENGOLF_BASE}/api/v1/courses/${encodeURIComponent(courseId)}`;
  // Diagnostic: the exact id from the search result and the URL built from it.
  // eslint-disable-next-line no-console
  console.info('[courseApi] SCORECARD fetch: courseId=%o url=%s', courseId, url);

  const start = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw apiError(`Could not reach the course service. GET ${url}`, {
      code: 'network',
      cause: e,
    });
  }
  // eslint-disable-next-line no-console
  console.info('[courseApi] SCORECARD response: status=%d url=%s', res.status, url);
  if (!res.ok) {
    // Include the full URL + id in the message so it's readable in the on-screen
    // error (no devtools needed on a phone).
    throw apiError(`Course fetch failed (${res.status}). courseId=${courseId} · GET ${url}`, {
      status: res.status,
    });
  }
  const scorecard = mapScorecard(await res.json(), courseId);
  cacheScorecard(courseId, scorecard);
  return { scorecard, source: 'live', durationMs: Date.now() - start };
}

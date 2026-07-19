// Lightweight, dependency-free event logging for the course-selection flow, plus
// a pure summarizer the /analytics dashboard renders. Everything lives in
// localStorage (this app has no backend), capped so the log can't grow unbounded.

const ANALYTICS_KEY = 'fourright_analytics';
const MAX_EVENTS = 1000;

// Event type vocabulary — imported by the course-selection flow so the strings
// stay consistent between the loggers and the summarizer.
export const EVENTS = {
  SEARCH_OPENED: 'search_opened',
  FIRST_CHARACTER_TYPED: 'first_character_typed',
  RESULTS_DISPLAYED: 'results_displayed', // { count, source }
  COURSE_TAPPED: 'course_tapped', // { courseName }
  FETCH_STARTED: 'fetch_started', // { courseName }
  FETCH_COMPLETED: 'fetch_completed', // { durationMs, source: 'cache' | 'live' }
  TEE_SELECTION_SHOWN: 'tee_selection_shown', // { courseName }
  TEE_SELECTED: 'tee_selected', // { teeName }
  SELECTION_CONFIRMED: 'selection_confirmed', // { courseName, teeName, source }
  SELECTION_ABANDONED: 'selection_abandoned', // { lastStep }
};

function readRaw() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** All logged events, oldest first. */
export function getEvents() {
  return readRaw();
}

/** Wipe the analytics log (used by the dashboard's clear action). */
export function clearEvents() {
  try {
    localStorage.removeItem(ANALYTICS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Append one timestamped event. `data` is merged onto the record. Never throws —
 * analytics must not be able to break the flow it observes.
 * @param {string} type one of EVENTS
 * @param {Object} [data] event-specific fields
 * @returns {Object|null} the stored event, or null if persistence failed
 */
export function logEvent(type, data = {}) {
  try {
    const event = { type, t: Date.now(), iso: new Date().toISOString(), ...data };
    const events = readRaw();
    events.push(event);
    // Keep only the most recent MAX_EVENTS.
    const capped = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(capped));
    return event;
  } catch {
    return null;
  }
}

const mean = (nums) =>
  nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

function countBy(events, keyFn) {
  const out = {};
  for (const e of events) {
    const k = keyFn(e);
    if (k == null || k === '') continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * Reduce a raw event list into the numbers the dashboard shows. Pure — no
 * storage or globals — so it is unit-testable in isolation.
 *
 * @param {Array<Object>} events
 * @returns {{
 *   total:number,
 *   countsByType:Object,
 *   avgFetchMsCached:number|null,
 *   avgFetchMsLive:number|null,
 *   fetchCountCached:number,
 *   fetchCountLive:number,
 *   confirmed:number,
 *   abandoned:number,
 *   completionRate:number|null,
 *   abandonmentByStep:Object,
 *   topCourses:Array<{name:string,count:number}>,
 *   recent:Array<Object>
 * }}
 */
export function summarizeEvents(events) {
  const list = Array.isArray(events) ? events : [];

  const fetchDone = list.filter((e) => e.type === EVENTS.FETCH_COMPLETED);
  const cachedMs = fetchDone
    .filter((e) => e.source === 'cache')
    .map((e) => Number(e.durationMs))
    .filter((n) => Number.isFinite(n));
  const liveMs = fetchDone
    .filter((e) => e.source === 'live')
    .map((e) => Number(e.durationMs))
    .filter((n) => Number.isFinite(n));

  const confirmed = list.filter((e) => e.type === EVENTS.SELECTION_CONFIRMED).length;
  const abandoned = list.filter((e) => e.type === EVENTS.SELECTION_ABANDONED).length;
  const decided = confirmed + abandoned;

  const countsByType = countBy(list, (e) => e.type);

  const topCourses = Object.entries(
    countBy(
      list.filter((e) => e.type === EVENTS.SELECTION_CONFIRMED),
      (e) => e.courseName,
    ),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: list.length,
    countsByType,
    avgFetchMsCached: mean(cachedMs),
    avgFetchMsLive: mean(liveMs),
    fetchCountCached: cachedMs.length,
    fetchCountLive: liveMs.length,
    confirmed,
    abandoned,
    completionRate: decided === 0 ? null : confirmed / decided,
    abandonmentByStep: countBy(
      list.filter((e) => e.type === EVENTS.SELECTION_ABANDONED),
      (e) => e.lastStep,
    ),
    topCourses,
    recent: list.slice(-50).reverse(),
  };
}

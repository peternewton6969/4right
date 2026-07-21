import { useEffect, useRef, useState } from 'react';
import { searchCourses, getScorecard, buildCourseFromTee } from '../services/courseApi.js';
import {
  getFavoriteCourses,
  toggleFavoriteCourse,
  updateFavoriteCourseIfPresent,
} from '../storage/store.js';
import { logEvent, EVENTS } from '../utils/analytics.js';

// Course selection for Round Setup. A "My Courses" favorites section (persisted in
// localStorage, pre-seeded with the Prestonwood courses) sits above a name search that
// queries the course API after 3 characters, a cache-first scorecard fetch, and a tee
// picker. Search results and favorites each carry a star toggle to save/remove a course.
// It is a controlled component: `value` is the resolved round-ready course (or null) and
// `onChange(course|null, meta)` reports selection. Every step emits an analytics event;
// `onStep(step)` reports the furthest step reached so the parent can record an abandonment
// if the user leaves without confirming.

const C = {
  surface: '#1e3a5f',
  surface2: '#162d4a',
  green: '#22c55e',
  border: '#2d4a6b',
  text: '#f8fafc',
  dim: '#94a3b8',
  ink: '#0a1628',
  danger: '#ef4444',
};

const styles = {
  wrap: { display: 'grid', gap: 10 },
  sublabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.dim,
  },
  input: {
    width: '100%',
    minHeight: 52,
    padding: '0 14px',
    fontSize: 16,
    color: C.text,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    outline: 'none',
    fontFamily: 'inherit',
  },
  hint: { fontSize: 12, color: C.dim },
  error: { fontSize: 13, color: C.danger, wordBreak: 'break-all' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 },
  // A course row = a tappable main area (select) + a star button (favorite toggle),
  // wrapped in a bordered card. Buttons can't nest, hence the flex wrapper.
  rowWrap: {
    display: 'flex',
    alignItems: 'stretch',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    textAlign: 'left',
    padding: 12,
    background: 'transparent',
    border: 'none',
    color: C.text,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  starBtn: {
    flex: '0 0 auto',
    width: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderLeft: `1px solid ${C.border}`,
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
  },
  rowName: { fontSize: 15, fontWeight: 700 },
  rowMeta: { fontSize: 12, color: C.dim },
  teeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 12,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    color: C.text,
    cursor: 'pointer',
  },
  teeName: { fontSize: 15, fontWeight: 700 },
  teeMeta: { fontSize: 12, color: C.dim },
  selectedCard: {
    display: 'grid',
    gap: 4,
    padding: 14,
    background: C.surface,
    border: `1px solid ${C.green}`,
    borderRadius: 12,
  },
  selectedName: { fontSize: 16, fontWeight: 800, color: C.text },
  selectedMeta: { fontSize: 13, color: C.dim },
  change: {
    justifySelf: 'start',
    marginTop: 4,
    minHeight: 36,
    padding: '0 12px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: 'transparent',
    color: C.green,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  keyRow: { display: 'grid', gap: 8 },
  primaryBtn: {
    justifySelf: 'start',
    minHeight: 44,
    padding: '0 18px',
    border: 'none',
    borderRadius: 10,
    background: C.green,
    color: C.ink,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
};

const teeSummary = (t) => {
  const bits = [];
  if (t.rating) bits.push(`${t.rating}`);
  if (t.slope) bits.push(`${t.slope} slope`);
  if (t.yardage) bits.push(`${t.yardage} yds`);
  return bits.join(' · ') || `Par ${t.par}`;
};

// One-line summary under a favorite. Round-ready favorites show their tee stats;
// bare pointers (saved from a search result, not yet resolved) prompt for tees.
const favSummary = (f) => {
  if (!(Array.isArray(f.holes) && f.holes.length > 0 && f.par != null)) {
    return 'Tap to choose tees';
  }
  const bits = [];
  if (f.rating) bits.push(`${f.rating}`);
  if (f.slope) bits.push(`${f.slope} slope`);
  bits.push(`Par ${f.par}`);
  return bits.join(' · ');
};

export default function CoursePicker({ value, onChange, onStep }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [favorites, setFavorites] = useState(() => getFavoriteCourses());
  const favIds = new Set(favorites.map((f) => f.courseId));

  const [scorecard, setScorecard] = useState(null); // normalized, all tees
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const openedRef = useRef(false); // search_opened logged once
  const firstCharRef = useRef(false); // first_character_typed logged once
  const searchSeq = useRef(0); // ignore stale search responses
  const sourceRef = useRef(null); // 'hardcoded' | 'cache' | 'live' of the pending pick

  const step = (s) => onStep?.(s);

  // Debounced search once 3+ characters are entered.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const rows = await searchCourses(q);
        if (seq !== searchSeq.current) return; // superseded
        setResults(rows);
        logEvent(EVENTS.RESULTS_DISPLAYED, { count: rows.length, source: 'search' });
        step('results');
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setResults([]);
        setSearchError(err?.message || 'Search failed.');
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  function handleFocus() {
    if (openedRef.current) return;
    openedRef.current = true;
    logEvent(EVENTS.SEARCH_OPENED);
    step('search_opened');
  }

  function handleQueryChange(v) {
    setQuery(v);
    if (!firstCharRef.current && v.length >= 1) {
      firstCharRef.current = true;
      logEvent(EVENTS.FIRST_CHARACTER_TYPED);
      step('typing');
    }
  }

  function resetInner() {
    setScorecard(null);
    setFetchError('');
  }

  async function doFetch(row) {
    logEvent(EVENTS.FETCH_STARTED, { courseName: row.name });
    step('fetching');
    setFetching(true);
    setFetchError('');
    try {
      const { scorecard: sc, source, durationMs } = await getScorecard(row.id);
      logEvent(EVENTS.FETCH_COMPLETED, { durationMs, source });
      sourceRef.current = source;
      setScorecard(sc);
      logEvent(EVENTS.TEE_SELECTION_SHOWN, { courseName: sc.name });
      step('tee_selection');
    } catch (err) {
      // OpenGolfAPI is keyless — a failure here is a network/data issue, surfaced
      // as a plain message (the message includes the URL + course id for support).
      setFetchError(err?.message || 'Could not load this course.');
    } finally {
      setFetching(false);
    }
  }

  function handleTapResult(row) {
    logEvent(EVENTS.COURSE_TAPPED, { courseName: row.name });
    step('course_tapped');
    setScorecard(null);
    setFetchError('');
    doFetch(row); // getScorecard is cache-first; the key is supplied by the env var
  }

  // A favorite is "round-ready" when it carries hole data (e.g. Prestonwood, or a
  // search favorite already resolved through a tee): tap selects it instantly.
  // Otherwise it is a bare pointer — tapping re-fetches and shows the tee picker.
  function handleTapFavorite(fav) {
    logEvent(EVENTS.COURSE_TAPPED, { courseName: fav.courseName });
    step('course_tapped');
    if (Array.isArray(fav.holes) && fav.holes.length > 0 && fav.par != null) {
      const course = {
        id: fav.courseId,
        name: fav.courseName,
        rating: fav.rating,
        slope: fav.slope,
        par: fav.par,
        holes: fav.holes,
      };
      sourceRef.current = 'favorite';
      step('selected');
      onChange(course, { source: 'favorite' });
      return;
    }
    setScorecard(null);
    setFetchError('');
    doFetch({ id: fav.courseId, name: fav.courseName });
  }

  // Add/remove a favorite from either list. `course` needs at least { id, name };
  // search results contribute only id/name, resolved courses contribute full data.
  function handleToggleFavorite(course) {
    toggleFavoriteCourse(course);
    setFavorites(getFavoriteCourses());
  }

  function handleSelectTee(tee) {
    logEvent(EVENTS.TEE_SELECTED, { teeName: tee.name });
    const course = buildCourseFromTee(scorecard, tee);
    // If this course was favorited as a bare pointer, upgrade the stored record so it
    // becomes round-ready (rating/slope/par/holes) for instant selection next time.
    updateFavoriteCourseIfPresent(course);
    setFavorites(getFavoriteCourses());
    step('selected');
    onChange(course, { source: sourceRef.current || 'live' });
  }

  function handleChange() {
    onChange(null, {});
    resetInner();
    step('changing');
  }

  // --- Render: selected summary --------------------------------------------------
  if (value) {
    const meta = [
      value.teeName,
      value.rating ? `${value.rating}` : null,
      value.slope ? `${value.slope} slope` : null,
      `Par ${value.par}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <div style={styles.selectedCard}>
        <span style={styles.selectedName}>✓ {value.name}</span>
        <span style={styles.selectedMeta}>{meta}</span>
        <button type="button" style={styles.change} onClick={handleChange}>
          Change course
        </button>
      </div>
    );
  }

  // --- Render: tee selection -----------------------------------------------------
  if (scorecard) {
    return (
      <div style={styles.wrap}>
        <span style={styles.sublabel}>{scorecard.name} — Select Tees</span>
        <ul style={styles.list}>
          {scorecard.tees.map((t) => (
            <li key={t.key ?? t.name}>
              <button type="button" style={styles.teeRow} onClick={() => handleSelectTee(t)}>
                <span style={styles.teeName}>{t.name}</span>
                <span style={styles.teeMeta}>{teeSummary(t)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" style={styles.change} onClick={handleChange}>
          Back to search
        </button>
      </div>
    );
  }

  // --- Render: suggested + search + results --------------------------------------
  return (
    <div style={styles.wrap}>
      <span style={styles.sublabel}>My Courses</span>
      {favorites.length === 0 ? (
        <span style={styles.hint}>Search for a course and tap the star to save it here.</span>
      ) : (
        <ul style={styles.list}>
          {favorites.map((f) => (
            <li key={f.courseId}>
              <div style={styles.rowWrap}>
                <button
                  type="button"
                  style={styles.rowMain}
                  onClick={() => handleTapFavorite(f)}
                >
                  <span style={styles.rowName}>{f.courseName}</span>
                  <span style={styles.rowMeta}>{favSummary(f)}</span>
                </button>
                <button
                  type="button"
                  style={{ ...styles.starBtn, color: C.green }}
                  aria-label={`Remove ${f.courseName} from My Courses`}
                  aria-pressed="true"
                  onClick={() => handleToggleFavorite({ id: f.courseId, name: f.courseName })}
                >
                  ★
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <span style={styles.sublabel}>Search Courses</span>
      <input
        type="text"
        style={styles.input}
        value={query}
        placeholder="Type a course name…"
        aria-label="Course search"
        autoComplete="off"
        onFocus={handleFocus}
        onChange={(e) => handleQueryChange(e.target.value)}
      />
      {query.trim().length > 0 && query.trim().length < 3 && (
        <span style={styles.hint}>Keep typing — 3+ characters to search.</span>
      )}
      {fetching && <span style={styles.hint}>Loading course…</span>}
      {searching && <span style={styles.hint}>Searching…</span>}
      {searchError !== '' && <span style={styles.error}>{searchError}</span>}
      {fetchError !== '' && <span style={styles.error}>{fetchError}</span>}

      {results.length > 0 && (
        <ul style={styles.list}>
          {results.map((r) => {
            const fav = favIds.has(r.id);
            return (
              <li key={r.id}>
                <div style={styles.rowWrap}>
                  <button type="button" style={styles.rowMain} onClick={() => handleTapResult(r)}>
                    <span style={styles.rowName}>{r.name}</span>
                    <span style={styles.rowMeta}>
                      {[r.city, r.state].filter(Boolean).join(', ') || '—'}
                    </span>
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.starBtn, color: fav ? C.green : C.dim }}
                    aria-label={fav ? `Remove ${r.name} from My Courses` : `Save ${r.name} to My Courses`}
                    aria-pressed={fav}
                    onClick={() => handleToggleFavorite({ id: r.id, name: r.name })}
                  >
                    {fav ? '★' : '☆'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!searching && query.trim().length >= 3 && results.length === 0 && searchError === '' && (
        <span style={styles.hint}>No courses found.</span>
      )}
    </div>
  );
}

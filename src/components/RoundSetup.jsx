import { useEffect, useRef, useState } from 'react';
import {
  getPlayers,
  getCourses,
  loadDefaultCourses,
  upsertCourse,
  setActiveRound,
} from '../storage/store.js';
import {
  computeCourseHandicap,
  computeDifferential,
  computeStrokeHolesMatchPlay,
  computeStrokeHolesSkins,
} from '../engine/index.js';
import { generateId } from '../utils/generateId.js';
import { getPlayerName } from '../utils/playerUtils.js';
import { logEvent, EVENTS } from '../utils/analytics.js';
import AppHeader from './AppChrome.jsx';
import CoursePicker from './CoursePicker.jsx';
import NumericKeypad from './NumericKeypad.jsx';

// Screen 3: Round Setup. Single scrollable screen — date, course, games
// (team / individual / junk), conditional team assignment, dynamic payouts —
// then Start Round snapshots each player's handicap math and writes the active
// round. Presentation only; all math goes through the engine. Inline styles keep
// this screen self-contained.

const C = {
  bg: '#0a1628',
  surface: '#1e3a5f',
  surface2: '#162d4a',
  green: '#22c55e',
  border: '#2d4a6b',
  text: '#f8fafc',
  dim: '#94a3b8',
  ink: '#0a1628',
};

const TEAM_GAMES = [
  { key: 'bestBall', label: 'Best Ball' },
  { key: 'scramble', label: 'Scramble' },
];
const INDIVIDUAL_GAMES = [
  { key: 'skins', label: 'Skins' },
  { key: 'wolf', label: 'Wolf' },
];
const JUNK_GAMES = [
  { key: 'greenie', label: 'Greenie' },
  { key: 'snake', label: 'Snake' },
  { key: 'sandy', label: 'Sandy' },
  { key: 'netBirdie', label: 'Net Birdie' },
  { key: 'netEagle', label: 'Net Eagle' },
];

// Payout input defaults (strings while editing).
const PAYOUT_DEFAULTS = {
  teamGame: '20',
  skins: '10',
  wolf: '2',
  greenie: '2',
  snake: '10',
  sandy: '2',
  netBirdie: '2',
  netEagle: '4',
};

const styles = {
  main: { background: C.bg, minHeight: '100%', padding: '16px', display: 'grid', gap: 24 },
  section: { display: 'grid', gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.dim,
  },
  sublabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.dim,
    marginTop: 8,
  },
  note: { fontSize: 12, color: C.dim, marginTop: -2 },
  dateCard: {
    position: 'relative',
    background: C.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: C.text,
    minHeight: 56,
    display: 'flex',
    alignItems: 'center',
  },
  dateInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
  segmented: { display: 'flex', gap: 8 },
  segment: (active) => ({
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    border: active ? 'none' : `1px solid ${C.border}`,
    background: active ? C.green : C.surface2,
    color: active ? C.ink : C.text,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  }),
  pairRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  junkGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  gameBtn: (active) => ({
    minHeight: 56,
    borderRadius: 12,
    border: active ? 'none' : `1px solid ${C.border}`,
    background: active ? C.green : C.surface2,
    color: active ? C.ink : C.text,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }),
  teamRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    padding: '0 4px',
  },
  teamName: { fontSize: 16, color: C.text, fontWeight: 600 },
  abSwitch: { display: 'flex', gap: 8 },
  abBtn: (active) => ({
    width: 52,
    height: 48,
    borderRadius: 10,
    border: active ? 'none' : `1px solid ${C.border}`,
    background: active ? C.green : C.surface2,
    color: active ? C.ink : C.text,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  }),
  warn: { fontSize: 12, color: '#f59e0b', marginTop: 4 },
  payoutRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  payoutLabel: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.text,
  },
  money: (focused) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    width: 120,
    height: 48,
    padding: '0 12px',
    background: C.surface,
    border: `1px solid ${focused ? C.green : C.border}`,
    borderRadius: 12,
  }),
  dollar: { color: C.dim, fontSize: 16 },
  moneyInput: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: C.text,
    fontSize: 16,
    textAlign: 'right',
  },
  bottomBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    background: C.bg,
    borderTop: `1px solid ${C.border}`,
    padding: '8px 16px calc(8px + env(safe-area-inset-bottom))',
    zIndex: 20,
  },
  start: (enabled) => ({
    width: '100%',
    minHeight: 56,
    border: 'none',
    borderRadius: 12,
    background: C.green,
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    opacity: enabled ? 1 : 0.4,
    cursor: enabled ? 'pointer' : 'default',
  }),
};

/** Today as YYYY-MM-DD. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Format a YYYY-MM-DD string as "Jul 8, 2026". */
function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Parse a payout string to a non-negative number, falling back when invalid. */
function num(raw, fallback) {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Accept a payout amount: up to 4 whole digits and up to 2 decimal places. */
function acceptMoneyInput(raw) {
  return /^\d{0,4}(\.\d{0,2})?$/.test(raw);
}

/**
 * One payout row, driven by the shared custom NumericKeypad rather than a native
 * keyboard. `active` lights the border while this field is being edited;
 * `elevated` raises the field above the keypad's dismiss backdrop so tapping
 * another row switches to it (rather than closing the keypad first).
 */
function PayoutRow({ label, value, active, onTap, elevated }) {
  return (
    <div style={styles.payoutRow}>
      <span style={styles.payoutLabel}>{label}</span>
      <div
        style={{
          ...styles.money(active),
          ...(elevated ? { position: 'relative', zIndex: 35 } : null),
        }}
      >
        <span style={styles.dollar}>$</span>
        <input
          style={{ ...styles.moneyInput, caretColor: C.green }}
          type="text"
          inputMode="none"
          readOnly
          value={value}
          aria-label={`${label} payout`}
          onFocus={onTap}
          onClick={onTap}
        />
      </div>
    </div>
  );
}

export default function RoundSetup({ navigate, playerIds }) {
  // Players for this round: exactly those selected (order preserved), else the
  // full roster as a fallback (e.g. arriving via the legacy round-setup route).
  const [players] = useState(() => {
    const all = getPlayers();
    if (Array.isArray(playerIds) && playerIds.length > 0) {
      const byId = Object.fromEntries(all.map((p) => [p.id, p]));
      return playerIds.map((id) => byId[id]).filter(Boolean);
    }
    return all;
  });
  // Ensure the round-resolution course store is populated (downstream screens resolve
  // round.courseId through getCourses()). Course selection itself now runs through the
  // "My Courses" favorites list inside CoursePicker.
  useState(() => {
    if (getCourses().length === 0) loadDefaultCourses();
  });

  const [date, setDate] = useState(today);
  // The resolved round-ready course ({id,name,rating,slope,par,holes,...}) or null.
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectionSource, setSelectionSource] = useState(null); // 'hardcoded'|'cache'|'live'

  // Abandonment tracking: the furthest step the user reached in course selection,
  // and whether they confirmed. On unmount without a confirm we log an abandon.
  const lastStepRef = useRef(null);
  const confirmedRef = useRef(false);
  useEffect(() => {
    return () => {
      if (lastStepRef.current && !confirmedRef.current) {
        logEvent(EVENTS.SELECTION_ABANDONED, { lastStep: lastStepRef.current });
      }
    };
  }, []);

  function handleCourseChange(course, meta) {
    setSelectedCourse(course);
    setSelectionSource(course ? meta?.source ?? null : null);
  }
  const [teamGame, setTeamGame] = useState(null); // null | 'bestBall' | 'scramble'
  const [individualGames, setIndividualGames] = useState([]);
  const [junkGames, setJunkGames] = useState(() => JUNK_GAMES.map((g) => g.key)); // all on
  const [payouts, setPayouts] = useState(() => ({ ...PAYOUT_DEFAULTS }));
  const [activePayout, setActivePayout] = useState(null); // key of field the keypad edits
  const [teams, setTeams] = useState(() => {
    // Default: first half of players to A, the rest to B.
    const half = Math.ceil(players.length / 2);
    const t = {};
    players.forEach((p, i) => {
      t[p.id] = i < half ? 'A' : 'B';
    });
    return t;
  });

  // --- Derived state ---
  // Team games need even sides. With 4 players that means a 2v2 the user assigns;
  // with 2 players the only split is 1v1 (auto-assigned, no UI); with 3 players an
  // even split is impossible, so team games are not offered at all (Bug 4).
  const playerCount = players.length;
  const teamGameAllowed = playerCount === 2 || playerCount === 4;
  const showTeamAssignment = teamGame !== null && playerCount === 4;
  const teamGameSelected = teamGame !== null;
  const countA = players.filter((p) => teams[p.id] === 'A').length;
  const countB = players.length - countA;
  const teamsBalanced = countA === countB; // even split: 1v1, 2v2, ...
  const teamComplete = !teamGameSelected || teamsBalanced;
  const canStart = selectedCourse !== null && teamComplete;

  const teamGameLabel = teamGame === 'scramble' ? 'Scramble' : 'Best Ball';

  const payoutFields = [
    { key: 'teamGame', label: 'TEAM GAME', show: teamGameSelected },
    { key: 'skins', label: 'SKINS POT', show: individualGames.includes('skins') },
    { key: 'wolf', label: 'WOLF (per point)', show: individualGames.includes('wolf') },
    { key: 'greenie', label: 'GREENIE', show: junkGames.includes('greenie') },
    { key: 'snake', label: 'SNAKE', show: junkGames.includes('snake') },
    { key: 'sandy', label: 'SANDY', show: junkGames.includes('sandy') },
    { key: 'netBirdie', label: 'NET BIRDIE', show: junkGames.includes('netBirdie') },
    { key: 'netEagle', label: 'NET EAGLE', show: junkGames.includes('netEagle') },
  ].filter((f) => f.show);

  // --- Handlers ---
  const toggleTeamGame = (key) => setTeamGame((prev) => (prev === key ? null : key));
  const setTeam = (playerId, team) => setTeams((prev) => ({ ...prev, [playerId]: team }));
  const toggleIndividual = (key) =>
    setIndividualGames((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  const toggleJunk = (key) =>
    setJunkGames((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const updatePayout = (key, value) => setPayouts((prev) => ({ ...prev, [key]: value }));

  // Custom-keypad key handler: append a digit/'.' to the active payout field if
  // the result is still a valid amount; 'back' deletes the last character.
  function handleKeypadKey(key) {
    if (activePayout == null) return;
    setPayouts((prev) => {
      const cur = prev[activePayout] ?? '';
      if (key === 'back') return { ...prev, [activePayout]: cur.slice(0, -1) };
      return acceptMoneyInput(cur + key) ? { ...prev, [activePayout]: cur + key } : prev;
    });
  }

  function handleStart() {
    if (!canStart) return;

    const course = selectedCourse;
    // Persist the resolved course so every screen that resolves round.courseId
    // through getCourses() (ScoreEntry, Scoreboard, Settlement, history) works.
    upsertCourse(course);
    logEvent(EVENTS.SELECTION_CONFIRMED, {
      courseName: course.name,
      teeName: course.teeName ?? null,
      source: selectionSource ?? 'hardcoded',
    });
    confirmedRef.current = true;

    const holes = course.holes;
    const rankByHole = Object.fromEntries(holes.map((h) => [h.number, h.hcpRank]));

    // Snapshot course handicaps, then derive differentials off the low man.
    const chById = {};
    players.forEach((p) => {
      chById[p.id] = computeCourseHandicap(p.handicapIndex, course.slope, course.rating, course.par);
    });
    const lowManCH = Math.min(...Object.values(chById));

    const playerRounds = players.map((p) => {
      const courseHandicap = chById[p.id];
      const differential = computeDifferential(courseHandicap, lowManCH);
      const strokeHolesMatchPlay = computeStrokeHolesMatchPlay(differential, holes);
      // Skins strokes come back as a hole->count map (captures double strokes);
      // store the hole numbers, hardest first, per the Round data model.
      const skinsMap = computeStrokeHolesSkins(courseHandicap, holes);
      const strokeHolesSkins = Object.keys(skinsMap)
        .map(Number)
        .sort((a, b) => rankByHole[a] - rankByHole[b]);
      return {
        playerId: p.id,
        handicapIndex: p.handicapIndex,
        courseHandicap,
        differential,
        strokeHolesMatchPlay,
        strokeHolesSkins,
      };
    });

    const now = new Date().toISOString();
    const round = {
      id: generateId(),
      date,
      courseId: course.id,
      status: 'active',
      playerIds: players.map((p) => p.id),
      teamAssignments: teamGameSelected
        ? Object.fromEntries(players.map((p) => [p.id, teams[p.id]]))
        : {},
      teamGame,
      teamGamePayout: num(payouts.teamGame, Number(PAYOUT_DEFAULTS.teamGame)),
      individualGames: [...individualGames],
      individualGamePayouts: {
        skins: num(payouts.skins, Number(PAYOUT_DEFAULTS.skins)),
        wolfPointValue: num(payouts.wolf, Number(PAYOUT_DEFAULTS.wolf)),
      },
      junkGames: [...junkGames],
      junkGamePayouts: {
        greenie: num(payouts.greenie, Number(PAYOUT_DEFAULTS.greenie)),
        snake: num(payouts.snake, Number(PAYOUT_DEFAULTS.snake)),
        sandy: num(payouts.sandy, Number(PAYOUT_DEFAULTS.sandy)),
        netBirdie: num(payouts.netBirdie, Number(PAYOUT_DEFAULTS.netBirdie)),
        netEagle: num(payouts.netEagle, Number(PAYOUT_DEFAULTS.netEagle)),
      },
      playerRounds,
      holes: [],
      wolfHoles: [],
      createdAt: now,
      updatedAt: now,
    };

    setActiveRound(round);
    navigate('stroke-confirmation');
  }

  return (
    <>
      <AppHeader
        navigate={navigate}
        title="Round Setup"
        left="back"
        onBack={() => navigate('round/players')}
      />
      <main style={{ ...styles.main, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {/* Section 1: Date */}
        <section style={styles.section}>
          <span style={styles.label}>Date</span>
          <div style={styles.dateCard}>
            {formatDate(date)}
            <input
              style={styles.dateInput}
              type="date"
              aria-label="Round date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
        </section>

        {/* Section 2: Course */}
        <section style={styles.section}>
          <span style={styles.label}>Course</span>
          <CoursePicker
            value={selectedCourse}
            onChange={handleCourseChange}
            onStep={(s) => {
              lastStepRef.current = s;
            }}
          />
        </section>

        {/* Section 3: Games */}
        <section style={styles.section}>
          <span style={styles.label}>Games</span>

          {/* Team game — only offered when even teams are possible (2 or 4 players) */}
          {teamGameAllowed && (
            <>
              <span style={styles.sublabel}>Team Game</span>
              <span style={styles.note}>Pick one or none</span>
              <div style={styles.pairRow}>
                {TEAM_GAMES.map((g) => {
                  const active = teamGame === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      style={styles.gameBtn(active)}
                      aria-pressed={active}
                      onClick={() => toggleTeamGame(g.key)}
                    >
                      {active && <span>✓</span>}
                      {g.label}
                    </button>
                  );
                })}
              </div>
              {teamGameSelected && playerCount === 2 && (
                <span style={styles.note}>1v1 — teams assigned automatically</span>
              )}
            </>
          )}

          {/* Team assignment — only when the user must choose sides (4 players) */}
          {showTeamAssignment && (
            <>
              <span style={styles.sublabel}>Team Assignment</span>
              <div>
                {players.map((p) => (
                  <div key={p.id} style={styles.teamRow}>
                    <span style={styles.teamName}>{getPlayerName(p)}</span>
                    <div style={styles.abSwitch} role="group" aria-label={`${getPlayerName(p)} team`}>
                      <button
                        type="button"
                        style={styles.abBtn(teams[p.id] === 'A')}
                        onClick={() => setTeam(p.id, 'A')}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        style={styles.abBtn(teams[p.id] === 'B')}
                        onClick={() => setTeam(p.id, 'B')}
                      >
                        B
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!teamsBalanced && (
                <span style={styles.warn}>{teamGameLabel} requires even teams</span>
              )}
            </>
          )}

          {/* Individual games */}
          <span style={styles.sublabel}>Individual Games</span>
          <span style={styles.note}>Pick any</span>
          <div style={styles.pairRow}>
            {INDIVIDUAL_GAMES.map((g) => {
              const active = individualGames.includes(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  style={styles.gameBtn(active)}
                  aria-pressed={active}
                  onClick={() => toggleIndividual(g.key)}
                >
                  {active && <span>✓</span>}
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* Junk */}
          <span style={styles.sublabel}>Junk</span>
          <span style={styles.note}>All on by default</span>
          <div style={styles.junkGrid}>
            {JUNK_GAMES.map((g) => {
              const active = junkGames.includes(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  style={styles.gameBtn(active)}
                  aria-pressed={active}
                  onClick={() => toggleJunk(g.key)}
                >
                  {active && <span>✓</span>}
                  {g.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 4: Payouts */}
        {payoutFields.length > 0 && (
          <section style={styles.section}>
            <span style={styles.label}>Payouts</span>
            <div style={{ display: 'grid', gap: 8 }}>
              {payoutFields.map((f) => (
                <PayoutRow
                  key={f.key}
                  label={f.label}
                  value={payouts[f.key]}
                  active={activePayout === f.key}
                  elevated={activePayout !== null}
                  onTap={() => setActivePayout(f.key)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <div style={styles.bottomBar}>
        <button
          type="button"
          style={styles.start(canStart)}
          disabled={!canStart}
          onClick={() => {
            setActivePayout(null);
            handleStart();
          }}
        >
          Start Round
        </button>
      </div>

      <NumericKeypad
        open={activePayout !== null}
        onKey={handleKeypadKey}
        onDone={() => setActivePayout(null)}
      />
    </>
  );
}

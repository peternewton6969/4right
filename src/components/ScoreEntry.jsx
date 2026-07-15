import { useEffect, useMemo, useState } from 'react';
import {
  getActiveRound,
  setActiveRound,
  getPlayers,
  getCourses,
  loadDefaultCourses,
} from '../storage/store.js';
import {
  computeMatchPlayStatus,
  computeSkinsStandings,
  computeSnakeFinal,
  resolveSnake,
} from '../engine/index.js';
import { getPlayerName } from '../utils/playerUtils.js';
import { withLegacyRoundFields } from '../utils/roundModel.js';
import AppHeader from './AppChrome.jsx';

// Screen 5: Score Entry, per hole.
// One-screen, no-scroll layout: green header, a status strip, four always-visible
// compact player rows (name / +-score / icon toggles) sized to fill the viewport,
// and a fixed Prev / Next Hole bottom bar. Each player's gross defaults to par on
// load. Two or more three-putts trigger the snake-holder prompt before commit.
// Presentation is inline-styled here so no other file (incl. styles.css) changes.

const TOTAL_HOLES = 18;

// Palette (mirrors the design system; amber #f59e0b is the secondary accent).
const C = {
  bg: '#0a1628',
  surface: '#1e3a5f',
  surface2: '#162d4a',
  green: '#22c55e',
  amber: '#f59e0b',
  text: '#f8fafc',
  dim: '#94a3b8',
  border: '#2d4a6b',
  ink: '#0a1628',
};

function courseForRound(round) {
  const found = getCourses().find((c) => c.id === round.courseId);
  if (found) return found;
  return loadDefaultCourses().find((c) => c.id === round.courseId) ?? null;
}

/** Full-CH (skins) strokes received on one hole — mirrors the engine allocation. */
function skinsStrokes(courseHandicap, hcpRank) {
  const base = Math.floor(courseHandicap / TOTAL_HOLES);
  const remainder = courseHandicap % TOTAL_HOLES;
  return base + (hcpRank <= remainder ? 1 : 0);
}

function blankScore() {
  return {
    gross: null,
    threePutt: false,
    inBunker: false,
    closestOnParThree: false,
  };
}

export default function ScoreEntry({ navigate }) {
  // Normalize on read so a freshly-created round (grouped shape) exposes the
  // legacy games/teams/payouts fields this screen reads.
  const [round, setRound] = useState(() => withLegacyRoundFields(getActiveRound()));
  const course = useMemo(() => (round ? courseForRound(round) : null), [round]);

  const players = useMemo(() => {
    if (!round) return [];
    const nameById = {};
    for (const p of getPlayers()) nameById[p.id] = getPlayerName(p);
    return round.playerRounds.map((pr) => ({ ...pr, name: nameById[pr.playerId] ?? 'Player' }));
  }, [round]);

  // Start on the first hole without a saved score (resume where we left off).
  const initialHole = useMemo(() => {
    if (!round) return 1;
    for (let h = 1; h <= TOTAL_HOLES; h += 1) {
      if (!round.holes.some((x) => x.holeNumber === h)) return h;
    }
    return TOTAL_HOLES;
  }, [round]);

  // Build the working scores for a hole: saved values if present, otherwise the
  // hole's par (spec default). Par comes from the course hole definition.
  function scoresForHole(holeNumber) {
    const s = {};
    if (!round) return s;
    const existing = round.holes.find((x) => x.holeNumber === holeNumber);
    const hd = course?.holes.find((h) => h.number === holeNumber);
    const par = hd?.par ?? null;
    for (const p of round.playerRounds) {
      const saved = existing?.scores?.[p.playerId];
      s[p.playerId] = saved ? { ...blankScore(), ...saved } : { ...blankScore(), gross: par };
    }
    return s;
  }

  const [currentHole, setCurrentHole] = useState(initialHole);
  const [scores, setScores] = useState(() => scoresForHole(initialHole));
  const [snakePrompt, setSnakePrompt] = useState(false);
  const [endPrompt, setEndPrompt] = useState(false);

  // Reload working scores whenever the selected hole changes (defaults to par).
  useEffect(() => {
    if (!round) return;
    setScores(scoresForHole(currentHole));
    setSnakePrompt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHole, round, course]);

  // --- Header state going INTO this hole (replay of all earlier holes). --------
  const holeData = course?.holes.find((h) => h.number === currentHole) ?? null;
  const priorHoles = useMemo(
    () => (round ? round.holes.filter((h) => h.holeNumber < currentHole) : []),
    [round, currentHole],
  );

  const header = useMemo(() => {
    if (!round || !course) return null;
    const engineRound = {
      teams: round.teams,
      playerRounds: round.playerRounds,
      holes: priorHoles,
      courseHoles: course.holes,
      payouts: round.payouts,
    };
    const matchStatus = round.games.matchPlay
      ? computeMatchPlayStatus(engineRound).status
      : null;
    const carry = round.games.skins ? computeSkinsStandings(engineRound).currentCarry : 0;
    const snakeHolder = round.games.snake ? computeSnakeFinal(engineRound).holder : null;
    return { matchStatus, skinsAtStake: carry + 1, snakeHolder };
  }, [round, course, priorHoles]);

  if (!round || round.status === 'complete' || !course || !holeData) {
    return (
      <>
        <AppHeader navigate={navigate} title="Score Entry" active="new-round" />
        <main className="screen placeholder">
          <h1>Score Entry</h1>
          <p>No active round in progress.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('home')}>
            Back to Home
          </button>
        </main>
      </>
    );
  }

  const nameById = Object.fromEntries(players.map((p) => [p.playerId, p.name]));
  const isLastHole = currentHole === TOTAL_HOLES;

  // --- Score mutations ---------------------------------------------------------
  function bump(id, dir) {
    setScores((prev) => {
      const cur = prev[id].gross;
      const seed = cur == null ? holeData.par : cur;
      const next = Math.min(20, Math.max(1, seed + (cur == null ? 0 : dir)));
      return { ...prev, [id]: { ...prev[id], gross: next } };
    });
  }
  function toggleFlag(id, key) {
    setScores((prev) => ({ ...prev, [id]: { ...prev[id], [key]: !prev[id][key] } }));
  }
  // Greenie is single-select per hole (radio-button behavior): marking one player
  // closest-to-pin clears every other player; tapping the marked player clears it.
  // Matches the engine rule of at most one greenie winner per hole.
  function toggleGreenie(id) {
    setScores((prev) => {
      const turningOn = !prev[id].closestOnParThree;
      const next = {};
      for (const pid of Object.keys(prev)) {
        next[pid] = { ...prev[pid], closestOnParThree: turningOn && pid === id };
      }
      return next;
    });
  }
  function goPrevHole() {
    setCurrentHole((h) => Math.max(1, h - 1));
  }

  // --- Commit ------------------------------------------------------------------
  function handleNext() {
    const threePutters = players
      .filter((p) => scores[p.playerId].threePutt)
      .map((p) => p.playerId);
    if (threePutters.length >= 2) {
      setSnakePrompt(true); // resolved via the modal, which calls commitHole
      return;
    }
    commitHole(null);
  }

  function commitHole(selectedHolder) {
    const threePutters = players
      .filter((p) => scores[p.playerId].threePutt)
      .map((p) => p.playerId);

    const priorEngine = {
      playerRounds: round.playerRounds,
      holes: priorHoles,
      courseHoles: course.holes,
      payouts: round.payouts,
    };
    const priorHolder = computeSnakeFinal(priorEngine).holder;
    const snake = resolveSnake({ scores }, priorHolder, selectedHolder);
    const skinsCarryIn = computeSkinsStandings(priorEngine).currentCarry;

    const normalized = {};
    for (const p of players) {
      const s = scores[p.playerId];
      normalized[p.playerId] = {
        gross: s.gross,
        threePutt: s.threePutt,
        inBunker: s.inBunker,
        closestOnParThree: holeData.isParThree ? s.closestOnParThree : false,
      };
    }

    const holeScore = {
      holeNumber: currentHole,
      scores: normalized,
      snakeHolder: snake.holder,
      snakeSimultaneous: threePutters.length >= 2,
      skinsCarryIn,
      enteredAt: new Date().toISOString(),
    };

    const newHoles = [
      ...round.holes.filter((h) => h.holeNumber !== currentHole),
      holeScore,
    ].sort((a, b) => a.holeNumber - b.holeNumber);
    const newRound = { ...round, holes: newHoles, status: 'active', updatedAt: new Date().toISOString() };

    setActiveRound(newRound);
    setRound(newRound);
    setSnakePrompt(false);

    if (isLastHole) {
      navigate('settlement');
    } else {
      setCurrentHole(currentHole + 1);
    }
  }

  // --- Inline style helpers ----------------------------------------------------
  const iconToggle = (active) => ({
    width: 32,
    height: 32,
    flex: '0 0 auto',
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 8,
    cursor: 'pointer',
    color: active ? C.ink : C.dim,
    background: active ? C.amber : C.surface2,
    border: `1px solid ${active ? C.amber : C.border}`,
  });

  const stepBtn = {
    width: 36,
    height: 36,
    flex: '0 0 auto',
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1,
    color: C.text,
    background: 'transparent',
    border: `2px solid ${C.border}`,
    borderRadius: 8,
    cursor: 'pointer',
  };

  const headerActions = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" className="hdr-action" onClick={() => navigate('scoreboard')}>
        Board
      </button>
      <button type="button" className="hdr-action" onClick={() => setEndPrompt(true)}>
        End
      </button>
    </div>
  );

  return (
    <>
      {/* Full-viewport, non-scrolling column: header + status + rows + bottom bar. */}
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AppHeader
          navigate={navigate}
          tone="green"
          title={`Hole ${currentHole} — Par ${holeData.par}`}
          subtitle={`HCP ${holeData.hcpRank}`}
          right={headerActions}
          active="new-round"
        />

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Status strip */}
          <div
            style={{
              flex: '0 0 auto',
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '0 16px',
              background: C.surface2,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 14,
              color: C.dim,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {header?.matchStatus || '—'}
            </span>
            <span style={{ flex: 1, textAlign: 'center', color: C.green, fontWeight: 700 }}>
              {round.games.skins ? `${header.skinsAtStake} skin${header.skinsAtStake === 1 ? '' : 's'} up` : ''}
            </span>
            <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {round.games.snake ? (
                <>
                  Snake:{' '}
                  <strong style={{ color: C.amber }}>
                    {header.snakeHolder ? nameById[header.snakeHolder] : '—'}
                  </strong>
                </>
              ) : null}
            </span>
          </div>

          {/* Player rows — four equal slices of the remaining height. */}
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {players.map((p, i) => {
              const s = scores[p.playerId];
              const hasGross = s.gross != null;
              const skStroke = skinsStrokes(p.courseHandicap, holeData.hcpRank);
              const net = hasGross ? s.gross - skStroke : null;
              return (
                <div
                  key={p.playerId}
                  style={{
                    flex: '1 1 0',
                    minHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 12px',
                    borderBottom: i < players.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  {/* Left: name */}
                  <span
                    style={{
                      flex: '0 0 21%',
                      minWidth: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.green,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </span>

                  {/* Center: stepper + score + net */}
                  <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <button
                      type="button"
                      style={stepBtn}
                      aria-label={`Lower ${p.name}'s score`}
                      onClick={() => bump(p.playerId, -1)}
                    >
                      −
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
                        {hasGross ? s.gross : '–'}
                      </span>
                      <span style={{ fontSize: 11, color: C.dim }}>
                        {net != null ? `Net: ${net}` : 'Net: —'}
                      </span>
                    </div>
                    <button
                      type="button"
                      style={stepBtn}
                      aria-label={`Raise ${p.name}'s score`}
                      onClick={() => bump(p.playerId, 1)}
                    >
                      +
                    </button>
                  </div>

                  {/* Right: icon toggles */}
                  <div style={{ flex: '0 0 auto', display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      style={iconToggle(s.threePutt)}
                      aria-pressed={s.threePutt}
                      aria-label={`${p.name} three-putt`}
                      onClick={() => toggleFlag(p.playerId, 'threePutt')}
                    >
                      3P
                    </button>
                    <button
                      type="button"
                      style={iconToggle(s.inBunker)}
                      aria-pressed={s.inBunker}
                      aria-label={`${p.name} sandy`}
                      onClick={() => toggleFlag(p.playerId, 'inBunker')}
                    >
                      S
                    </button>
                    {holeData.isParThree && (
                      <button
                        type="button"
                        style={iconToggle(s.closestOnParThree)}
                        aria-pressed={s.closestOnParThree}
                        aria-label={`${p.name} closest to pin`}
                        onClick={() => toggleGreenie(p.playerId)}
                      >
                        ⛳
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom bar — Prev / Next Hole, always visible. */}
          <div
            style={{
              flex: '0 0 auto',
              minHeight: 56,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '6px 16px',
              paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
              background: C.bg,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <button
              type="button"
              disabled={currentHole === 1}
              onClick={goPrevHole}
              style={{
                flex: '0 0 auto',
                height: 44,
                padding: '0 18px',
                fontSize: 16,
                fontWeight: 700,
                color: C.text,
                background: 'transparent',
                border: `2px solid ${C.border}`,
                borderRadius: 10,
                cursor: currentHole === 1 ? 'default' : 'pointer',
                opacity: currentHole === 1 ? 0.4 : 1,
              }}
            >
              ‹ Prev
            </button>
            <button
              type="button"
              onClick={handleNext}
              style={{
                flex: '1 1 auto',
                height: 44,
                fontSize: 17,
                fontWeight: 800,
                color: C.ink,
                background: C.green,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              {isLastHole ? 'Finish Round ›' : 'Next Hole ›'}
            </button>
          </div>
        </div>
      </div>

      {/* Simultaneous three-putt resolution */}
      {snakePrompt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Two players three-putted</h2>
            <p>Who holds the snake? Tap the player who finished putting last.</p>
            <div className="modal-choices">
              {players
                .filter((p) => scores[p.playerId].threePutt)
                .map((p) => (
                  <button
                    key={p.playerId}
                    type="button"
                    className="btn btn-outline"
                    onClick={() => commitHole(p.playerId)}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
            <button
              type="button"
              className="modal-cancel"
              onClick={() => setSnakePrompt(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* End round early: settle on completed holes only */}
      {endPrompt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>End round after hole {round.holes.length}?</h2>
            <p>Settlement will be calculated on completed holes only.</p>
            <div className="modal-choices">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setEndPrompt(false);
                  navigate('settlement');
                }}
              >
                End Round
              </button>
            </div>
            <button type="button" className="modal-cancel" onClick={() => setEndPrompt(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

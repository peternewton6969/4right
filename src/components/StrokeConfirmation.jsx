import { useMemo } from 'react';
import {
  getActiveRound,
  setActiveRound,
  getPlayers,
  getCourses,
  loadDefaultCourses,
} from '../storage/store.js';
import { computeStrokeHolesSkins } from '../engine/index.js';
import { getPlayerName } from '../utils/playerUtils.js';
import AppHeader from './AppChrome.jsx';

// Screen 4: Stroke Allocation Confirmation (spec section 4.2).
// Displayed once after round setup, before hole 1. The pre-flight check that was
// missing on July 3. For each player: name, handicap index, course handicap,
// differential, match-play stroke holes, and skins stroke holes (with double
// strokes marked). "Looks Good" activates the round and proceeds to hole 1;
// "Back" returns to Round Setup.

/** Resolve the course for a round, loading defaults if storage is empty. */
function courseForRound(round) {
  const list = getCourses();
  const found = list.find((c) => c.id === round.courseId);
  if (found) return found;
  return loadDefaultCourses().find((c) => c.id === round.courseId) ?? null;
}

export default function StrokeConfirmation({ navigate }) {
  const round = useMemo(getActiveRound, []);
  const course = useMemo(() => (round ? courseForRound(round) : null), [round]);
  const nameById = useMemo(() => {
    const map = {};
    for (const p of getPlayers()) map[p.id] = getPlayerName(p);
    return map;
  }, []);

  if (!round || !course) {
    return (
      <>
        <AppHeader
          navigate={navigate}
          title="Stroke Allocation"
          left="back"
          onBack={() => navigate('round-setup')}
        />
        <main className="screen placeholder">
          <h1>Stroke Allocation</h1>
          <p>No active round to confirm. Start one from Round Setup.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('round-setup')}>
            Go to Round Setup
          </button>
        </main>
      </>
    );
  }

  // Recompute the skins stroke map per player so doubles (CH > 18) can be marked.
  // Stroke-hole lists display in sequential hole order (ascending hole number),
  // not handicap-rank order.
  const rows = round.playerRounds.map((pr) => {
    const skinsMap = computeStrokeHolesSkins(pr.courseHandicap, course.holes);
    const skinsHoles = Object.keys(skinsMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map((hole) => ({ hole, count: skinsMap[hole] }));
    return {
      playerId: pr.playerId,
      name: nameById[pr.playerId] ?? 'Player',
      handicapIndex: pr.handicapIndex,
      courseHandicap: pr.courseHandicap,
      differential: pr.differential,
      matchPlayHoles: [...pr.strokeHolesMatchPlay].sort((a, b) => a - b),
      skinsHoles,
    };
  });

  function handleLooksGood() {
    const activated = { ...round, status: 'active', updatedAt: new Date().toISOString() };
    setActiveRound(activated);
    navigate('score-entry');
  }

  return (
    <>
      <AppHeader
        navigate={navigate}
        title="Stroke Allocation"
        left="back"
        onBack={() => navigate('round-setup')}
      />
      <main className="screen">
        <p className="screen-intro">
          {course.name} · Confirm every allocation before hole 1.
        </p>

        <div className="stroke-list">
          {rows.map((r) => (
            <section key={r.playerId} className="card">
              <div className="stroke-head">
                <span className="stroke-name">{r.name}</span>
                <span className="stroke-hi">HI {r.handicapIndex.toFixed(1)}</span>
              </div>

              <div className="stroke-stats">
                <div className="stroke-stat">
                  <span className="stroke-stat-num">{r.courseHandicap}</span>
                  <span className="label">Course HCP</span>
                </div>
                <div className="stroke-stat">
                  <span className="stroke-stat-num">{r.differential}</span>
                  <span className="label">Differential</span>
                </div>
              </div>

              <div className="stroke-rows">
                <div className="stroke-row">
                  <span className="label">Stroke Holes (Match Play)</span>
                  <div className="pill-row">
                    {r.matchPlayHoles.length === 0 ? (
                      <span className="stroke-pill is-none">None</span>
                    ) : (
                      r.matchPlayHoles.map((h) => (
                        <span key={h} className="stroke-pill">
                          {h}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="stroke-row">
                  <span className="label">Stroke Holes (Skins)</span>
                  <div className="pill-row">
                    {r.skinsHoles.map(({ hole, count }) => (
                      <span key={hole} className="stroke-pill">
                        {hole}
                        {count > 1 ? <span className="dbl">×{count}</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="footer">
          <button type="button" className="btn btn-primary" onClick={handleLooksGood}>
            Looks Good
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate('round-setup')}
          >
            Back
          </button>
        </div>
      </main>
    </>
  );
}

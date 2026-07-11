import { useMemo, useState } from 'react';
import {
  getActiveRound,
  clearActiveRound,
  getRounds,
  setRounds,
  getPlayers,
  getCourses,
  loadDefaultCourses,
} from '../storage/store.js';
import {
  computeMatchPlayStatus,
  computeScrambleStatus,
  computeSkinsStandings,
  computeSnakeFinal,
  computeSideBetTotals,
  computeSettlement,
} from '../engine/index.js';
import { getPlayerName } from '../utils/playerUtils.js';
import AppHeader from './AppChrome.jsx';

// Screen 7: End of Round — Settlement (spec section 4.2).
// Final team-game result, skins standings, snake holder, side-bet totals, a
// per-player settlement breakdown, and plain-English payment instructions.
// "Save Round" writes the completed round to history; "New Round" returns home.

/** Resolve the course for a round from storage, loading defaults if empty. */
function courseForRound(round) {
  const found = getCourses().find((c) => c.id === round.courseId);
  if (found) return found;
  return loadDefaultCourses().find((c) => c.id === round.courseId) ?? null;
}

function money(n) {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

// --- New/legacy shape helpers (read the new fields, fall back to legacy) --------

const playerIdsOf = (round) =>
  Array.isArray(round.playerIds) && round.playerIds.length
    ? round.playerIds
    : round.playerRounds.map((pr) => pr.playerId);

function teamGameOf(round) {
  if (round.teamGame !== undefined) return round.teamGame; // 'bestBall' | 'scramble' | null
  return !round.games || round.games.matchPlay !== false ? 'bestBall' : null;
}
const individualOn = (round, g) =>
  round.individualGames ? round.individualGames.includes(g) : g === 'skins' && !!round.games?.skins;
const snakeOn = (round) =>
  round.junkGames ? round.junkGames.includes('snake') : !!round.games?.snake;
const junkOn = (round, g) =>
  round.junkGames ? round.junkGames.includes(g) : !!round.games?.[g];

/** `{ A, B }` teams from a legacy round.teams, else from teamAssignments. */
function deriveTeams(round) {
  if (round.teams && Array.isArray(round.teams.A) && Array.isArray(round.teams.B)) {
    return round.teams;
  }
  const ta = round.teamAssignments || {};
  const A = [];
  const B = [];
  for (const id of playerIdsOf(round)) {
    if (ta[id] === 'A') A.push(id);
    else if (ta[id] === 'B') B.push(id);
  }
  return { A, B };
}

/** Flat payouts the display engines read, from the new grouped fields or legacy. */
function deriveFlatPayouts(round) {
  if (round.payouts) return round.payouts;
  const ig = round.individualGamePayouts || {};
  const jg = round.junkGamePayouts || {};
  return {
    matchPlay: round.teamGamePayout,
    teamGame: round.teamGamePayout,
    skinsPool: ig.skins,
    wolfPointValue: ig.wolfPointValue,
    snake: jg.snake,
    greenie: jg.greenie,
    netBirdie: jg.netBirdie,
    netEagle: jg.netEagle,
    sandie: jg.sandy,
  };
}

export default function Settlement({ navigate }) {
  // Capture the round once so the screen still renders after Save clears it.
  const [round] = useState(getActiveRound);
  const [players] = useState(getPlayers);
  const [saved, setSaved] = useState(false);

  const course = useMemo(() => (round ? courseForRound(round) : null), [round]);
  const nameById = useMemo(() => {
    const map = {};
    for (const p of players) map[p.id] = getPlayerName(p) || p.name;
    if (round) {
      for (const pr of round.playerRounds) map[pr.playerId] ??= pr.name ?? 'Player';
    }
    return map;
  }, [players, round]);

  const view = useMemo(() => {
    if (!round || !course) return null;

    // Fully hydrate the round for the engine: the active-round scores
    // (round.holes) plus the static course hole definitions (courseHoles), plus
    // normalized teams/payouts so every engine call works for old or new shapes.
    // All new game/payout fields flow through via the spread for computeSettlement.
    const engineRound = {
      ...round,
      players: players.map((p) => ({ id: p.id, name: nameById[p.id] })),
      holes: round.holes,
      courseHoles: course.holes,
      teams: deriveTeams(round),
      payouts: deriveFlatPayouts(round),
    };

    const teamGame = teamGameOf(round);

    // Final gross per player (for GHIN posting): sum of entered gross scores.
    const grossById = {};
    for (const pr of round.playerRounds) grossById[pr.playerId] = 0;
    for (const hs of round.holes) {
      for (const pr of round.playerRounds) {
        const g = hs.scores?.[pr.playerId]?.gross;
        if (g != null) grossById[pr.playerId] += g;
      }
    }

    return {
      match: teamGame === 'bestBall' ? computeMatchPlayStatus(engineRound) : null,
      scramble: teamGame === 'scramble' ? computeScrambleStatus(engineRound, round.holes) : null,
      skins: computeSkinsStandings(engineRound),
      snake: computeSnakeFinal(engineRound),
      sideBets: computeSideBetTotals(engineRound),
      settlement: computeSettlement(engineRound),
      grossById,
    };
  }, [round, course, players, nameById]);

  if (!round || !course || !view) {
    return (
      <>
        <AppHeader navigate={navigate} title="Settlement" active="new-round" />
        <main className="screen placeholder">
          <h1>Settlement</h1>
          <p>No round to settle.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('home')}>
            Back to Home
          </button>
        </main>
      </>
    );
  }

  const { settlement } = view;
  const teamGame = teamGameOf(round);
  const showSkins = individualOn(round, 'skins');
  const showWolf = individualOn(round, 'wolf');
  const showSnake = snakeOn(round);
  const showSideBets =
    junkOn(round, 'greenie') ||
    junkOn(round, 'netBirdie') ||
    junkOn(round, 'netEagle') ||
    junkOn(round, 'sandy') ||
    junkOn(round, 'sandie');

  function handleSave() {
    if (saved) return;
    const now = new Date().toISOString();
    const completed = {
      ...round,
      status: 'complete',
      players: players.map((p) => ({ id: p.id, name: nameById[p.id] })),
      completedAt: now,
      updatedAt: now,
    };
    setRounds([completed, ...getRounds()]); // most recent first
    clearActiveRound();
    setSaved(true);
  }

  return (
    <>
      <AppHeader navigate={navigate} title="Settlement" active="new-round" />
      <main className="screen board">
        <p className="settle-subhead">Hate paying out? Play better.</p>
        <p className="screen-intro settle-course">
          {course.name} · {round.date}
        </p>

        {teamGame === 'bestBall' && view.match && (
          <section className="card">
            <h2 className="card-title">Match Play</h2>
            <div className="mp-status">{view.match.status}</div>
          </section>
        )}

        {teamGame === 'scramble' && view.scramble && (
          <section className="card">
            <h2 className="card-title">Scramble</h2>
            <div className="mp-status">{view.scramble.status}</div>
          </section>
        )}

        {showSkins && (
          <section className="card">
            <h2 className="card-title">
              Skins
              {view.skins.unresolved && <span className="section-hint is-warn">18th carried — dead</span>}
            </h2>
            <table className="table">
              <tbody>
                {view.skins.standings.map((s) => (
                  <tr key={s.playerId}>
                    <td className="t-name">{nameById[s.playerId]}</td>
                    <td className="t-num">{s.skinsWon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {showSnake && (
          <section className="card">
            <h2 className="card-title">Snake</h2>
            <div className="mp-teams">
              <span>
                Final holder:{' '}
                <strong>{view.snake.holder ? nameById[view.snake.holder] : 'None'}</strong>
              </span>
            </div>
          </section>
        )}

        {showSideBets && (
          <section className="card">
            <h2 className="card-title">Side Bets</h2>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th className="t-name">Player</th>
                    <th>G</th>
                    <th>NB</th>
                    <th>NE</th>
                    <th>S</th>
                    <th className="t-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {round.playerRounds.map((pr) => {
                    const t = view.sideBets[pr.playerId] ?? {
                      greenies: 0, netBirdies: 0, netEagles: 0, sandies: 0, total: 0,
                    };
                    return (
                      <tr key={pr.playerId}>
                        <td className="t-name">{nameById[pr.playerId]}</td>
                        <td>{t.greenies}</td>
                        <td>{t.netBirdies}</td>
                        <td>{t.netEagles}</td>
                        <td>{t.sandies}</td>
                        <td className={`t-num${t.total > 0 ? ' is-pos' : t.total < 0 ? ' is-neg' : ''}`}>
                          {money(t.total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Settlement breakdown per player */}
        <section className="card">
          <h2 className="card-title">
            Settlement
            <span className="section-hint">Gross → GHIN</span>
          </h2>
          <div className="settle-list">
            {round.playerRounds.map((pr) => {
              const s = settlement[pr.playerId];
              return (
                <div key={pr.playerId} className="settle-row">
                  <div className="settle-row-top">
                    <span className="settle-name">{nameById[pr.playerId]}</span>
                    <span className="settle-gross" title="Final gross — post to GHIN">
                      Gross {view.grossById[pr.playerId]}
                    </span>
                    <span className={`settle-net${s.net > 0 ? ' is-pos' : s.net < 0 ? ' is-neg' : ''}`}>
                      {money(s.net)}
                    </span>
                  </div>
                  <div className="settle-breakdown">
                    {teamGame && <span>Team {money(s.teamGame)}</span>}
                    {showSkins && <span>Skins {money(s.skins)}</span>}
                    {showWolf && <span>Wolf {money(s.wolf)}</span>}
                    {showSnake && <span>Snake {money(s.snake)}</span>}
                    {showSideBets && <span>Side {money(s.sideBets)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Payment instructions */}
        <section className="card">
          <h2 className="card-title">Who Pays Who</h2>
          {settlement.instructions.length === 0 ? (
            <p className="muted">All square — no payments.</p>
          ) : (
            <ul className="pay-list">
              {settlement.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>

        <div className="footer-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saved}
            onClick={handleSave}
          >
            {saved ? 'Saved ✓' : 'Save Round'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('home')}>
            New Round
          </button>
        </div>
      </main>
    </>
  );
}

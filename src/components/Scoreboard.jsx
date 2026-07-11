import { useMemo, useState } from 'react';
import {
  getActiveRound,
  getPlayers,
  getCourses,
  loadDefaultCourses,
} from '../storage/store.js';
import {
  computeMatchPlayStatus,
  resolveMatchPlayHole,
  computeSkinsStandings,
  resolveSkinsHole,
  computeSnakeFinal,
  computeSideBetTotals,
  resolveSideBets,
} from '../engine/index.js';
import { getPlayerName } from '../utils/playerUtils.js';
import { withLegacyRoundFields } from '../utils/roundModel.js';
import AppHeader from './AppChrome.jsx';

// Screen 6: Scoreboard (spec section 4.2). Read-only. Reachable from any hole.
// Three tabs: Round (match grid, skins standings, snake history), Players
// (per-player gross/net scorecard with OUT/IN/TOT), and Games (per-game
// hole-by-hole results). Only enabled games appear. Close returns to Score Entry.

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const TOTAL_HOLES = 18;

const GAME_META = [
  { key: 'matchPlay', label: 'Match Play' },
  { key: 'skins', label: 'Skins' },
  { key: 'snake', label: 'Snake' },
  { key: 'greenie', label: 'Greenie' },
  { key: 'netBirdie', label: 'Net Birdie' },
  { key: 'netEagle', label: 'Net Eagle' },
  { key: 'sandie', label: 'Sandie' },
];

function courseForRound(round) {
  const found = getCourses().find((c) => c.id === round.courseId);
  if (found) return found;
  return loadDefaultCourses().find((c) => c.id === round.courseId) ?? null;
}

/** Full-CH strokes received on one hole — mirrors the engine allocation. */
function skinsStrokes(courseHandicap, hcpRank) {
  const base = Math.floor(courseHandicap / TOTAL_HOLES);
  const remainder = courseHandicap % TOTAL_HOLES;
  return base + (hcpRank <= remainder ? 1 : 0);
}

/** Format a signed dollar amount, e.g. +$14.00 / -$2.00 / $0.00. */
function money(n) {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function Scoreboard({ navigate }) {
  const round = useMemo(() => withLegacyRoundFields(getActiveRound()), []);
  const course = useMemo(() => (round ? courseForRound(round) : null), [round]);
  const nameById = useMemo(() => {
    const map = {};
    for (const p of getPlayers()) map[p.id] = getPlayerName(p);
    if (round) for (const pr of round.playerRounds) map[pr.playerId] ??= pr.name ?? 'Player';
    return map;
  }, [round]);

  const [tab, setTab] = useState('round');
  const enabledGames = round ? GAME_META.filter((g) => round.games[g.key]) : [];
  const [gameKey, setGameKey] = useState(enabledGames[0]?.key ?? 'matchPlay');

  const view = useMemo(() => {
    if (!round || !course) return null;
    const engineRound = {
      teams: round.teams,
      playerRounds: round.playerRounds,
      holes: round.holes,
      courseHoles: course.holes,
      payouts: round.payouts,
    };
    const entered = [...round.holes].sort((a, b) => a.holeNumber - b.holeNumber);
    const holeByNumber = Object.fromEntries(course.holes.map((h) => [h.number, h]));

    // Match play: status + per-hole result from Team A's perspective.
    const match = computeMatchPlayStatus(engineRound);
    const holeResults = {};
    for (const hs of entered) {
      const { winner } = resolveMatchPlayHole(hs, round.playerRounds, round.teams, course.holes);
      holeResults[hs.holeNumber] = winner === 'A' ? 'W' : winner === 'B' ? 'L' : 'H';
    }

    const skins = computeSkinsStandings(engineRound);
    const snake = computeSnakeFinal(engineRound);

    // Snake transfer history.
    const transfers = [];
    let prevHolder = null;
    for (const hs of entered) {
      const holder = hs.snakeHolder ?? null;
      if (holder !== prevHolder && holder != null) transfers.push({ hole: hs.holeNumber, holder });
      prevHolder = holder;
    }

    const sideBets = computeSideBetTotals(engineRound);

    // Per-hole game outcomes (for the Games tab).
    let carry = 0;
    const perHole = entered.map((hs) => {
      const hd = holeByNumber[hs.holeNumber];
      const mp = resolveMatchPlayHole(hs, round.playerRounds, round.teams, course.holes).winner;
      const sk = resolveSkinsHole(hs, round.playerRounds, course.holes, carry);
      const skWinner = sk.winner;
      const skAwarded = sk.skinsAwarded;
      carry = sk.winner ? 0 : sk.skinsCarryOut;
      const side = resolveSideBets(hs, round.playerRounds, hd);
      return {
        holeNumber: hs.holeNumber,
        mp,
        skWinner,
        skAwarded,
        carried: !sk.winner,
        snakeHolder: hs.snakeHolder ?? null,
        side,
      };
    });

    // Player scorecard: gross + net per hole, with OUT/IN/TOT.
    const enteredByHole = Object.fromEntries(entered.map((hs) => [hs.holeNumber, hs]));
    const scorecard = round.playerRounds.map((pr) => {
      const cells = {};
      let out = 0;
      let inn = 0;
      for (const h of course.holes) {
        const g = enteredByHole[h.number]?.scores?.[pr.playerId]?.gross;
        if (g == null) {
          cells[h.number] = null;
          continue;
        }
        const net = g - skinsStrokes(pr.courseHandicap, h.hcpRank);
        cells[h.number] = { gross: g, net };
        if (h.number <= 9) out += g;
        else inn += g;
      }
      return { playerId: pr.playerId, name: nameById[pr.playerId], cells, out, inn, tot: out + inn };
    });

    return { entered, match, holeResults, skins, snake, transfers, sideBets, perHole, scorecard };
  }, [round, course, nameById]);

  if (!round || !course || !view) {
    return (
      <>
        <AppHeader navigate={navigate} title="Scoreboard" active="new-round" />
        <main className="screen placeholder">
          <h1>Scoreboard</h1>
          <p>No active round to show.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('home')}>
            Back to Home
          </button>
        </main>
      </>
    );
  }

  const games = round.games;
  const teamNames = (side) => round.teams[side].map((id) => nameById[id]).join(' & ');
  const parByHole = Object.fromEntries(course.holes.map((h) => [h.number, h.par]));
  const orderedHoles = [...course.holes].map((h) => h.number).sort((a, b) => a - b);

  const closeBtn = (
    <button
      type="button"
      className="hdr-action"
      aria-label="Close scoreboard"
      onClick={() => navigate('score-entry')}
    >
      ✕
    </button>
  );

  const HoleRow = ({ holes }) => (
    <div className="mp-grid">
      {holes.map((h) => {
        const r = view.holeResults[h];
        return (
          <div key={h} className="mp-cell">
            <span className="mp-cell-hole">{h}</span>
            <span className={`mp-cell-result${r ? ` is-${r}` : ''}`}>{r ?? '·'}</span>
          </div>
        );
      })}
    </div>
  );

  /** One player's cell in the scorecard (gross with small net). */
  const ScoreCell = ({ cell }) =>
    cell ? (
      <td>
        <span className="sc-gross">{cell.gross}</span>
        <span className="sc-netsm">{cell.net}</span>
      </td>
    ) : (
      <td className="sc-par">–</td>
    );

  return (
    <>
      <AppHeader navigate={navigate} title="Scoreboard" right={closeBtn} active="new-round" />
      <main className="screen board">
        <div className="tabs" role="tablist">
          {[
            { key: 'round', label: 'Round' },
            { key: 'players', label: 'Players' },
            { key: 'games', label: 'Games' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* --- ROUND TAB --- */}
        {tab === 'round' && (
          <>
            {games.matchPlay && (
              <section className="card">
                <h2 className="card-title">Match Play</h2>
                <div className="mp-status">{view.match.status}</div>
                <div className="mp-teams">
                  <span>A: {teamNames('A')}</span>
                  <span>B: {teamNames('B')}</span>
                </div>
                <HoleRow holes={FRONT} />
                <HoleRow holes={BACK} />
                <p className="legend">W = Team A won · L = Team B won · H = halved</p>
              </section>
            )}

            {games.skins && (
              <section className="card">
                <h2 className="card-title">
                  Skins
                  <span className="section-hint">
                    {view.skins.unresolved
                      ? 'Pot dead (18th carried)'
                      : `${view.skins.currentCarry} carrying`}
                  </span>
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

            {games.snake && (
              <section className="card">
                <h2 className="card-title">
                  Snake
                  <span className="section-hint">
                    {view.snake.holder ? nameById[view.snake.holder] : 'No holder'}
                  </span>
                </h2>
                {view.transfers.length === 0 ? (
                  <p className="muted">No three-putts recorded yet.</p>
                ) : (
                  <ul className="snake-history">
                    {view.transfers.map((t) => (
                      <li key={t.hole}>
                        <span className="snake-hole">Hole {t.hole}</span>
                        <span className="snake-arrow">→</span>
                        <span className="snake-holder">{nameById[t.holder]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view.entered.length === 0 && <p className="empty">No holes entered yet.</p>}
          </>
        )}

        {/* --- PLAYERS TAB (scorecard) --- */}
        {tab === 'players' && (
          <section className="card">
            <h2 className="card-title">Scorecard</h2>
            {view.entered.length === 0 ? (
              <p className="muted">No holes entered yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="table scorecard">
                  <thead>
                    <tr>
                      <th className="sc-hole">Hole</th>
                      <th>Par</th>
                      {view.scorecard.map((p) => (
                        <th key={p.playerId}>{p.name.split(' ')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FRONT.map((h) => (
                      <tr key={h}>
                        <td className="sc-hole">{h}</td>
                        <td className="sc-par">{parByHole[h]}</td>
                        {view.scorecard.map((p) => (
                          <ScoreCell key={p.playerId} cell={p.cells[h]} />
                        ))}
                      </tr>
                    ))}
                    <tr className="is-summary">
                      <td className="sc-hole">OUT</td>
                      <td className="sc-par">{FRONT.reduce((a, h) => a + (parByHole[h] || 0), 0)}</td>
                      {view.scorecard.map((p) => (
                        <td key={p.playerId}>{p.out || '–'}</td>
                      ))}
                    </tr>
                    {BACK.map((h) => (
                      <tr key={h}>
                        <td className="sc-hole">{h}</td>
                        <td className="sc-par">{parByHole[h]}</td>
                        {view.scorecard.map((p) => (
                          <ScoreCell key={p.playerId} cell={p.cells[h]} />
                        ))}
                      </tr>
                    ))}
                    <tr className="is-summary">
                      <td className="sc-hole">IN</td>
                      <td className="sc-par">{BACK.reduce((a, h) => a + (parByHole[h] || 0), 0)}</td>
                      {view.scorecard.map((p) => (
                        <td key={p.playerId}>{p.inn || '–'}</td>
                      ))}
                    </tr>
                    <tr className="is-summary">
                      <td className="sc-hole">TOT</td>
                      <td className="sc-par">{orderedHoles.reduce((a, h) => a + (parByHole[h] || 0), 0)}</td>
                      {view.scorecard.map((p) => (
                        <td key={p.playerId}>{p.tot || '–'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="legend">Large = gross · small = net (full course handicap)</p>
          </section>
        )}

        {/* --- GAMES TAB --- */}
        {tab === 'games' && (
          <section className="card">
            <h2 className="card-title">Games</h2>
            {enabledGames.length === 0 ? (
              <p className="muted">No games enabled for this round.</p>
            ) : (
              <>
                <select
                  className="game-select"
                  value={gameKey}
                  onChange={(e) => setGameKey(e.target.value)}
                >
                  {enabledGames.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>

                {view.perHole.length === 0 ? (
                  <p className="muted">No holes entered yet.</p>
                ) : (
                  <div className="game-holes">
                    {view.perHole.map((h) => {
                      let val = '—';
                      let dim = false;
                      if (gameKey === 'matchPlay') {
                        val = h.mp === 'A' ? `Team A` : h.mp === 'B' ? `Team B` : 'Halved';
                        dim = h.mp === 'halved';
                      } else if (gameKey === 'skins') {
                        if (h.skWinner) val = `${nameById[h.skWinner]}${h.skAwarded > 1 ? ` (${h.skAwarded})` : ''}`;
                        else { val = 'Carry'; dim = true; }
                      } else if (gameKey === 'snake') {
                        val = h.snakeHolder ? nameById[h.snakeHolder] : '—';
                        dim = !h.snakeHolder;
                      } else if (gameKey === 'greenie') {
                        val = h.side.greenie ? nameById[h.side.greenie] : '—';
                        dim = !h.side.greenie;
                      } else if (gameKey === 'netBirdie') {
                        val = h.side.netBirdies.length ? h.side.netBirdies.map((id) => nameById[id]).join(', ') : '—';
                        dim = !h.side.netBirdies.length;
                      } else if (gameKey === 'netEagle') {
                        val = h.side.netEagles.length ? h.side.netEagles.map((id) => nameById[id]).join(', ') : '—';
                        dim = !h.side.netEagles.length;
                      } else if (gameKey === 'sandie') {
                        val = h.side.sandies.length ? h.side.sandies.map((id) => nameById[id]).join(', ') : '—';
                        dim = !h.side.sandies.length;
                      }
                      return (
                        <div key={h.holeNumber} className="game-hole">
                          <span className="gh-num">Hole {h.holeNumber}</span>
                          <span className={`gh-val${dim ? ' is-dim' : ''}`}>{val}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Side-bet dollar tallies for the selected side-bet game. */}
                {['greenie', 'netBirdie', 'netEagle', 'sandie'].includes(gameKey) && (
                  <table className="table" style={{ marginTop: '14px' }}>
                    <tbody>
                      {round.playerRounds.map((pr) => {
                        const t = view.sideBets[pr.playerId] ?? { total: 0 };
                        return (
                          <tr key={pr.playerId}>
                            <td className="t-name">{nameById[pr.playerId]}</td>
                            <td className={`t-num${t.total > 0 ? ' is-pos' : t.total < 0 ? ' is-neg' : ''}`}>
                              {money(t.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}

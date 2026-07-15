import { useMemo, useState } from 'react';
import {
  getRounds,
  deleteRound,
  getPlayers,
  getCourses,
  loadDefaultCourses,
} from '../storage/store.js';
import {
  computeMatchPlayStatus,
  computeSettlement,
  computeSkinsStandings,
  resolveSkinsHole,
  resolveSideBets,
} from '../engine/index.js';
import { getPlayerName } from '../utils/playerUtils.js';
import { withLegacyRoundFields } from '../utils/roundModel.js';
import AppHeader from './AppChrome.jsx';

// Screen 8: Round History (spec section 4.2).
// Completed rounds, most recent first. Each row shows course + date; tap to
// expand the full settlement detail and hole-by-hole ledger. No editing in v1.

function courseForRound(round) {
  const found = getCourses().find((c) => c.id === round.courseId);
  if (found) return found;
  return loadDefaultCourses().find((c) => c.id === round.courseId) ?? null;
}

function money(n) {
  const v = Number.isFinite(n) ? n : 0; // guard against undefined columns -> $0.00, not $NaN
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

/** Format an ISO date (YYYY-MM-DD) as a short local date. */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const TOTAL_HOLES = 18;

/** Full-CH (skins) strokes a player receives on one hole — mirrors the engine. */
function skinsStrokesForHole(courseHandicap, hcpRank) {
  const base = Math.floor(courseHandicap / TOTAL_HOLES);
  const remainder = courseHandicap % TOTAL_HOLES;
  return base + (hcpRank <= remainder ? 1 : 0);
}

/** Final gross per player across every entered hole. */
function grossTotalsFor(round) {
  const totals = {};
  for (const pr of round.playerRounds) totals[pr.playerId] = 0;
  for (const hs of round.holes) {
    for (const pr of round.playerRounds) {
      const g = hs.scores?.[pr.playerId]?.gross;
      if (g != null) totals[pr.playerId] += g;
    }
  }
  return totals;
}

/**
 * Per-hole detail for the expanded history view: gross scores, the skin result,
 * snake transfers, side-bet winners, and each player's money flow on the hole.
 *
 * Money flow attributes what resolves per hole: side-bet pools (zero-sum) plus
 * the skin value awarded to that hole's winner (perSkin = pool / total skins).
 * Match play (±stake) and the snake pot settle at round's end, so they appear in
 * the settlement summary above, not in these per-hole figures.
 */
function computeHoleDetails(round, course, perSkin) {
  const playerRounds = round.playerRounds;
  const ids = playerRounds.map((pr) => pr.playerId);
  const holeByNumber = Object.fromEntries(course.holes.map((h) => [h.number, h]));
  const entered = [...round.holes].sort((a, b) => a.holeNumber - b.holeNumber);

  let prevHolder = null;
  return entered.map((hs) => {
    const holeData = holeByNumber[hs.holeNumber];
    const skin = resolveSkinsHole(hs, playerRounds, course.holes, hs.skinsCarryIn ?? 0);
    const side = resolveSideBets(hs, playerRounds, holeData);

    const money = Object.fromEntries(ids.map((id) => [id, 0]));
    const applyPool = (winners, amount) => {
      if (!winners.length) return;
      const losers = ids.filter((id) => !winners.includes(id));
      for (const w of winners) money[w] += amount * losers.length;
      for (const l of losers) money[l] -= amount * winners.length;
    };
    applyPool(side.greenie ? [side.greenie] : [], round.payouts.greenie);
    applyPool(side.netEagles, round.payouts.netEagle);
    applyPool(side.netBirdies, round.payouts.netBirdie);
    applyPool(side.sandies, round.payouts.sandie);
    if (skin.winner) money[skin.winner] += skin.skinsAwarded * perSkin;

    const holder = hs.snakeHolder ?? null;
    const snakeTransferTo = holder != null && holder !== prevHolder ? holder : null;
    prevHolder = holder;

    const gross = {};
    const strokes = {};
    for (const pr of playerRounds) {
      const id = pr.playerId;
      const s = hs.scores?.[id];
      gross[id] = s?.gross ?? '—';
      // Handicap strokes received on this hole (full-CH / skins allocation), so the
      // group can see why a net birdie/eagle was awarded. May be 2 when CH laps 18.
      strokes[id] = holeData ? skinsStrokesForHole(pr.courseHandicap, holeData.hcpRank) : 0;
    }

    return {
      holeNumber: hs.holeNumber,
      par: holeData?.par,
      gross,
      strokes,
      skinWinner: skin.winner,
      skinsAwarded: skin.skinsAwarded,
      carried: !skin.winner,
      snakeTransferTo,
      side,
      money,
    };
  });
}

export default function RoundHistory({ navigate }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null); // { id, courseName, date } | null
  const [version, setVersion] = useState(0); // bump to re-read history after a delete

  // Precompute a display view (settlement + winner) for each saved round.
  const rounds = useMemo(() => {
    const globalPlayers = getPlayers();
    return getRounds().map((saved) => {
      // Derive legacy games/teams/payouts view fields for grouped-shape rounds.
      const round = withLegacyRoundFields(saved);
      const course = courseForRound(round);
      // Prefer the names snapshotted at save time; fall back to current profiles.
      const nameById = {};
      for (const p of globalPlayers) nameById[p.id] = getPlayerName(p);
      if (Array.isArray(round.players)) for (const p of round.players) nameById[p.id] = p.name;
      for (const pr of round.playerRounds) nameById[pr.playerId] ??= pr.name ?? 'Player';

      let match = null;
      let settlement = null;
      let winner = null;
      let holeDetails = [];
      let grossById = {};
      if (course) {
        const engineRound = {
          teams: round.teams,
          playerRounds: round.playerRounds,
          players: round.players,
          holes: round.holes,
          courseHoles: course.holes,
          payouts: round.payouts,
          games: round.games,
        };
        match = computeMatchPlayStatus(engineRound);
        settlement = computeSettlement(engineRound);
        grossById = grossTotalsFor(round);
        // Winner summary = biggest money winner (deterministic tie-break by name).
        const ids = round.playerRounds.map((pr) => pr.playerId);
        winner = ids
          .map((id) => ({ id, net: settlement[id].net }))
          .sort((a, b) => b.net - a.net || (nameById[a.id] < nameById[b.id] ? -1 : 1))[0];

        // Per-hole ledger uses the round-wide skin value.
        const { standings } = computeSkinsStandings(engineRound);
        const totalSkins = standings.reduce((sum, s) => sum + s.skinsWon, 0);
        const perSkin = totalSkins > 0 ? round.payouts.skinsPool / totalSkins : 0;
        holeDetails = computeHoleDetails(round, course, perSkin);
      }

      return {
        id: round.id,
        date: round.date,
        courseName: course?.name ?? 'Unknown course',
        nameById,
        playerIds: round.playerRounds.map((pr) => pr.playerId),
        match,
        settlement,
        winner,
        grossById,
        holeDetails,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    deleteRound(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPendingDelete(null);
    setVersion((v) => v + 1); // re-derive the list from storage
  }

  return (
    <>
      <AppHeader navigate={navigate} title="Rounds" active="history" />
      <main className="screen board">
        {rounds.length === 0 ? (
          <p className="empty">No rounds yet. Get out there.</p>
        ) : (
          <div className="history-list">
            {rounds.map((r) => {
              const isOpen = expanded.has(r.id);
              return (
                <section key={r.id} className="history-card">
                  <button
                    type="button"
                    className="history-head"
                    aria-expanded={isOpen}
                    onClick={() => toggle(r.id)}
                  >
                    <span className="history-course">{r.courseName}</span>
                    <span className="history-right">
                      <span className="history-date">{formatDate(r.date)}</span>
                      <span className={`history-caret${isOpen ? ' is-open' : ''}`}>▾</span>
                    </span>
                  </button>

                  {isOpen && r.settlement && (
                    <div className="history-detail">
                      {r.match && <div className="mp-status sm">{r.match.status}</div>}

                      <div className="settle-list">
                        {r.playerIds.map((id) => {
                          const s = r.settlement[id];
                          return (
                            <div key={id} className="settle-row">
                              <div className="settle-row-top">
                                <span className="settle-name">{r.nameById[id]}</span>
                                <span className="settle-gross">Gross {r.grossById[id]}</span>
                                <span className={`settle-net${s.net > 0 ? ' is-pos' : s.net < 0 ? ' is-neg' : ''}`}>
                                  {money(s.net)}
                                </span>
                              </div>
                              <div className="settle-breakdown">
                                <span>MP {money(s.teamGame)}</span>
                                <span>Skins {money(s.skins)}</span>
                                <span>Snake {money(s.snake)}</span>
                                <span>Side {money(s.sideBets)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {r.settlement.instructions.length > 0 && (
                        <ul className="pay-list">
                          {r.settlement.instructions.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      )}

                      {/* Hole-by-hole detail */}
                      <div className="hbh">
                        <h3 className="hbh-title">Hole by Hole</h3>
                        {r.holeDetails.map((h) => {
                          const events = [];
                          if (h.skinWinner) {
                            events.push(
                              `Skin: ${r.nameById[h.skinWinner]}${h.skinsAwarded > 1 ? ` (${h.skinsAwarded})` : ''}`,
                            );
                          } else {
                            events.push('Skin: carry');
                          }
                          if (h.snakeTransferTo) events.push(`Snake → ${r.nameById[h.snakeTransferTo]}`);
                          if (h.side.greenie) events.push(`Greenie: ${r.nameById[h.side.greenie]}`);
                          for (const id of h.side.netEagles) events.push(`Net Eagle: ${r.nameById[id]}`);
                          for (const id of h.side.netBirdies) events.push(`Net Birdie: ${r.nameById[id]}`);
                          for (const id of h.side.sandies) events.push(`Sandy: ${r.nameById[id]}`);

                          return (
                            <div key={h.holeNumber} className="hbh-hole">
                              <div className="hbh-head">
                                <span className="hbh-num">Hole {h.holeNumber}</span>
                                <span className="hbh-par">Par {h.par}</span>
                              </div>

                              <div className="hbh-gross">
                                {r.playerIds.map((id) => {
                                  const st = h.strokes?.[id] ?? 0;
                                  return (
                                    <span key={id} className="hbh-cell">
                                      <span className="hbh-name">{r.nameById[id].split(' ')[0]}</span>
                                      <span className="hbh-score">
                                        {h.gross[id]}
                                        {st > 0 && (
                                          <sup
                                            className="hbh-stroke"
                                            title={`${st} handicap stroke${st > 1 ? 's' : ''} on this hole`}
                                            aria-label={`${st} stroke${st > 1 ? 's' : ''}`}
                                            style={{ color: '#22c55e', fontWeight: 700, marginLeft: 2 }}
                                          >
                                            {st > 1 ? '••' : '•'}
                                          </sup>
                                        )}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>

                              <div className="hbh-events">
                                {events.map((e) => (
                                  <span key={e} className="hbh-event">
                                    {e}
                                  </span>
                                ))}
                              </div>

                              <div className="hbh-money">
                                {r.playerIds.map((id) => {
                                  const m = h.money[id];
                                  return (
                                    <span
                                      key={id}
                                      className={`hbh-mcell${m > 0 ? ' is-pos' : m < 0 ? ' is-neg' : ''}`}
                                    >
                                      {r.nameById[id].split(' ')[0]} {money(m)}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <p className="hbh-note">
                          Hole money = side bets + skins won. Match play and snake settle at round end.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({ id: r.id, courseName: r.courseName, date: r.date })
                        }
                        style={{
                          marginTop: 16,
                          width: '100%',
                          minHeight: 44,
                          borderRadius: 10,
                          background: 'transparent',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Delete Round
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete confirmation — permanent removal from history */}
      {pendingDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Delete this round?</h2>
            <p>
              {pendingDelete.courseName} · {formatDate(pendingDelete.date)} will be permanently
              removed from history. This cannot be undone.
            </p>
            <div className="modal-choices">
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#ef4444', color: '#fff' }}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
            <button type="button" className="modal-cancel" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

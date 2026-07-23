import { useMemo, useState } from 'react';
import {
  getActiveRound,
  getPlayers,
  getCourses,
  loadDefaultCourses,
  saveCaptainsPreRound,
  saveCaptainsPostRound,
} from '../storage/store.js';
import {
  computeMatchPlayStatus,
  computeScrambleStatus,
  computeSkinsStandings,
  computeSnakeFinal,
  computeSideBetTotals,
  computeSettlement,
} from '../engine/index.js';
import { getPlayerName, getPlayerFullName } from '../utils/playerUtils.js';
import { withLegacyRoundFields } from '../utils/roundModel.js';
import {
  isCaptainSubscriber,
  buildPreRoundPrompt,
  buildPostRoundPrompt,
  generateCommentary,
} from '../services/captainsCommentary.js';
import AppHeader from './AppChrome.jsx';
import CaptainsLogText from './CaptainsLogText.jsx';

// Captain's Commentary screens (spec: Captain's Commentary v1.0). One component drives
// both moments via `phase`: 'pre' (after setup, before hole 1) and 'post' (after hole
// 18, before settlement). The Captain adds optional context, generates an AI roast
// summary through the captains-commentary Edge Function, can regenerate, and then saves
// it onto the round as they proceed. "Skip" bypasses generation entirely.

const C = {
  bg: '#0a1628',
  surface: '#1e3a5f',
  surface2: '#162d4a',
  green: '#22c55e',
  border: '#2d4a6b',
  text: '#f8fafc',
  dim: '#94a3b8',
  ink: '#0a1628',
  danger: '#ef4444',
};

const S = {
  main: { background: C.bg, minHeight: '100%', padding: 16, display: 'grid', gap: 16 },
  intro: { fontSize: 14, color: C.dim, margin: 0 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.dim,
  },
  textarea: {
    width: '100%',
    minHeight: 72,
    padding: 12,
    fontSize: 16,
    color: C.text,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  primary: {
    width: '100%',
    minHeight: 52,
    border: 'none',
    borderRadius: 12,
    background: C.green,
    color: C.ink,
    fontSize: 17,
    fontWeight: 800,
    cursor: 'pointer',
  },
  outline: {
    width: '100%',
    minHeight: 48,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    background: 'transparent',
    color: C.text,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  skip: {
    minHeight: 48,
    border: 'none',
    background: 'transparent',
    color: C.dim,
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  loading: { display: 'grid', gap: 12, justifyItems: 'center', padding: '28px 12px', textAlign: 'center' },
  spinner: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: `3px solid ${C.border}`,
    borderTopColor: C.green,
    animation: 'cc-spin 0.9s linear infinite',
  },
  loadingText: { color: C.dim, fontSize: 15, fontStyle: 'italic' },
  errorText: { color: C.danger, fontSize: 15, fontWeight: 700, textAlign: 'center' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  paywall: {
    display: 'grid',
    gap: 10,
    justifyItems: 'center',
    textAlign: 'center',
    padding: '32px 20px',
    background: C.surface2,
    border: `1px solid ${C.border}`,
    borderLeft: `4px solid ${C.green}`,
    borderRadius: 14,
  },
  paywallKicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.green },
  paywallTitle: { fontSize: 22, fontWeight: 900, color: C.text, margin: 0 },
  paywallSub: { fontSize: 14, color: C.dim, margin: 0 },
};

/** Character-notes text for a player: prefer the AI summary, else the raw notes. */
function characterNoteFor(profile) {
  if (!profile) return '';
  const summary = typeof profile.characterSummary === 'string' ? profile.characterSummary.trim() : '';
  if (summary) return summary;
  const notes = Array.isArray(profile.characterNotes) ? profile.characterNotes : [];
  return notes.map((n) => n.text).filter(Boolean).join('; ');
}

/** Enabled games + bet amounts, as [{ label, detail }], from the grouped round. */
function gamesForPrompt(round) {
  const games = [];
  if (round.teamGame === 'bestBall') games.push({ label: 'Best Ball', detail: `$${round.teamGamePayout}` });
  if (round.teamGame === 'scramble') games.push({ label: 'Scramble', detail: `$${round.teamGamePayout}` });
  const ig = round.individualGamePayouts || {};
  if (round.individualGames?.includes('skins')) games.push({ label: 'Skins', detail: `$${ig.skins} pool` });
  if (round.individualGames?.includes('wolf')) games.push({ label: 'Wolf', detail: `$${ig.wolfPointValue}/pt` });
  const jg = round.junkGamePayouts || {};
  const junk = { greenie: 'Greenie', snake: 'Snake', sandy: 'Sandy', netBirdie: 'Net Birdie', netEagle: 'Net Eagle' };
  for (const key of ['greenie', 'snake', 'sandy', 'netBirdie', 'netEagle']) {
    if (round.junkGames?.includes(key)) games.push({ label: junk[key], detail: `$${jg[key]}` });
  }
  return games;
}

function courseForRound(round) {
  const found = getCourses().find((c) => c.id === round.courseId);
  if (found) return found;
  return loadDefaultCourses().find((c) => c.id === round.courseId) ?? null;
}

export default function CaptainsCommentary({ navigate, phase }) {
  const isPre = phase === 'pre';
  const round = useMemo(getActiveRound, []);
  const course = useMemo(() => (round ? courseForRound(round) : null), [round]);

  const rosterById = useMemo(() => {
    const map = {};
    for (const p of getPlayers()) map[p.id] = p;
    return map;
  }, []);
  const nameById = useMemo(() => {
    const map = {};
    if (round) {
      for (const pr of round.playerRounds) {
        const prof = rosterById[pr.playerId];
        map[pr.playerId] =
          (prof && (getPlayerFullName(prof).trim() || getPlayerName(prof))) || pr.name || 'Player';
      }
    }
    return map;
  }, [round, rosterById]);

  const subscriber = isCaptainSubscriber();
  const proceedRoute = isPre ? 'score-entry' : 'settlement';
  const proceedLabel = isPre ? 'Start Round' : 'View Settlement';
  const skipLabel = isPre ? 'Skip — Start Round' : 'Skip — View Settlement';
  const headerTitle = isPre ? "Captain's Log — Pre-Round" : "Captain's Log — Final Verdict";
  const generateLabel = isPre ? 'Generate Pre-Round Report' : 'Generate Final Verdict';
  const placeholder = isPre
    ? 'Anything the Captain should know before we tee off?'
    : 'Anything the Captain wants the record to reflect?';

  const saved = isPre ? round?.captainsPreRound : round?.captainsPostRound;
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState(saved ?? '');
  const [status, setStatus] = useState('idle'); // idle | loading | error

  // --- Prompt assembly from round data -----------------------------------------
  function preRoundData() {
    const norm = withLegacyRoundFields(round);
    const players = round.playerRounds.map((pr) => ({
      name: nameById[pr.playerId],
      handicapIndex: pr.handicapIndex,
      characterNote: characterNoteFor(rosterById[pr.playerId]),
    }));
    const teams = round.teamGame
      ? { A: (norm.teams.A || []).map((id) => nameById[id]), B: (norm.teams.B || []).map((id) => nameById[id]) }
      : null;
    return {
      courseName: course.name,
      players,
      games: gamesForPrompt(round),
      teams,
      captainNote: note,
    };
  }

  function postRoundData() {
    const base = preRoundData();
    const norm = withLegacyRoundFields(round);
    const engineRound = {
      ...norm,
      players: round.playerRounds.map((pr) => ({ id: pr.playerId, name: nameById[pr.playerId] })),
      holes: round.holes,
      courseHoles: course.holes,
      teams: norm.teams,
      payouts: norm.payouts,
    };
    const orderedHoles = course.holes.map((h) => h.number).sort((a, b) => a - b);
    const holeScores = round.playerRounds.map((pr) => {
      let total = 0;
      const gross = orderedHoles.map((hn) => {
        const g = round.holes.find((h) => h.holeNumber === hn)?.scores?.[pr.playerId]?.gross;
        if (g != null) total += g;
        return g ?? '—';
      });
      return { name: nameById[pr.playerId], gross, grossTotal: total, net: total - pr.courseHandicap };
    });

    const teamGame = round.teamGame;
    let matchResult = null;
    if (teamGame === 'bestBall') matchResult = computeMatchPlayStatus(engineRound).status;
    else if (teamGame === 'scramble') matchResult = computeScrambleStatus(engineRound, round.holes).status;

    const skins = computeSkinsStandings(engineRound).standings.map((s) => ({
      name: nameById[s.playerId],
      skins: s.skinsWon,
    }));
    const holder = computeSnakeFinal(engineRound).holder;
    const sideTotals = computeSideBetTotals(engineRound);
    const sideBets = round.playerRounds.map((pr) => {
      const t = sideTotals[pr.playerId] || {};
      return {
        name: nameById[pr.playerId],
        greenies: t.greenies ?? 0,
        sandies: t.sandies ?? 0,
        netBirdies: t.netBirdies ?? 0,
        netEagles: t.netEagles ?? 0,
        total: t.total ?? 0,
      };
    });
    const settle = computeSettlement(engineRound);
    const settlement = {
      nets: round.playerRounds.map((pr) => ({ name: nameById[pr.playerId], net: settle[pr.playerId].net })),
      instructions: settle.instructions,
    };

    return {
      ...base,
      holeScores,
      matchResult,
      skins,
      snakeHolder: holder ? nameById[holder] : 'None',
      sideBets,
      settlement,
      preRoundSummary: round.captainsPreRound ?? null,
    };
  }

  async function generate() {
    setStatus('loading');
    try {
      const prompt = isPre ? buildPreRoundPrompt(preRoundData()) : buildPostRoundPrompt(postRoundData());
      const text = await generateCommentary(prompt);
      setSummary(text);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  function proceed() {
    if (summary && summary.trim() !== '') {
      if (isPre) saveCaptainsPreRound(summary);
      else saveCaptainsPostRound(summary);
    }
    navigate(proceedRoute);
  }

  // --- Guards ------------------------------------------------------------------
  if (!round || !course) {
    return (
      <>
        <AppHeader navigate={navigate} title={headerTitle} active="new-round" />
        <main className="screen placeholder">
          <h1>{headerTitle}</h1>
          <p>No active round.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('home')}>
            Back to Home
          </button>
        </main>
      </>
    );
  }

  // Non-subscribers: paywall placeholder, but still able to continue into the round.
  if (!subscriber) {
    return (
      <>
        <AppHeader navigate={navigate} tone="green" title={headerTitle} active="new-round" />
        <main style={S.main}>
          <div style={S.paywall}>
            <span style={S.paywallKicker}>Captain’s Commentary</span>
            <h2 style={S.paywallTitle}>Premium Feature</h2>
            <p style={S.paywallSub}>Coming Soon</p>
          </div>
          <button type="button" style={S.primary} onClick={() => navigate(proceedRoute)}>
            {proceedLabel}
          </button>
        </main>
      </>
    );
  }

  const hasSummary = summary && summary.trim() !== '';

  return (
    <>
      <style>{'@keyframes cc-spin { to { transform: rotate(360deg); } }'}</style>
      <AppHeader navigate={navigate} tone="green" title={headerTitle} active="new-round" />
      <main style={S.main}>
        <p style={S.intro}>
          {isPre
            ? 'The Captain sizes up the field before a shot is struck.'
            : 'The Captain delivers the final verdict on the round.'}
        </p>

        <div style={{ display: 'grid', gap: 6 }}>
          <label htmlFor="captain-note" style={S.label}>
            Add something the Captain should know
          </label>
          <textarea
            id="captain-note"
            style={S.textarea}
            value={note}
            placeholder={placeholder}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Captain's note"
          />
        </div>

        {status === 'loading' && (
          <div style={S.loading} role="status" aria-live="polite">
            <div style={S.spinner} />
            <span style={S.loadingText}>The Captain is reviewing the evidence…</span>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={S.errorText}>The Captain is unavailable. Try again.</p>
            <button type="button" style={S.primary} onClick={generate}>
              Retry
            </button>
          </div>
        )}

        {status !== 'loading' && hasSummary && (
          <>
            <CaptainsLogText text={summary} />
            <div style={S.row}>
              <button type="button" style={S.outline} onClick={generate}>
                Regenerate
              </button>
              <button
                type="button"
                style={S.outline}
                aria-label="Share (coming soon)"
                onClick={() => {}}
              >
                Share
              </button>
            </div>
            <button type="button" style={S.primary} onClick={proceed}>
              {proceedLabel}
            </button>
          </>
        )}

        {status === 'idle' && !hasSummary && (
          <>
            <button type="button" style={S.primary} onClick={generate}>
              {generateLabel}
            </button>
            <button type="button" style={S.skip} onClick={() => navigate(proceedRoute)}>
              {skipLabel}
            </button>
          </>
        )}
      </main>
    </>
  );
}

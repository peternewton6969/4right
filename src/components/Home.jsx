import { useEffect, useState } from 'react';
import { getActiveRound } from '../storage/store.js';
import AppHeader from './AppChrome.jsx';

// Screen 1: Home (spec section 4.2).
// - App name "4 Right!"
// - "New Round" and "View Rounds" buttons
// - Active round indicator ("Resume Round — Hole 7") when a round is in progress.

/** Next hole to play = holes recorded + 1, clamped to the 18-hole round. */
function currentHole(round) {
  const played = Array.isArray(round?.holes) ? round.holes.length : 0;
  return Math.min(played + 1, 18);
}

/** A round counts as "in progress" only while it is set up or active. */
function isInProgress(round) {
  return !!round && round.status !== 'complete';
}

export default function Home({ navigate }) {
  const [activeRound, setActiveRound] = useState(null);

  // Re-read the active round whenever Home mounts or the tab regains focus, so
  // returning here after finishing/abandoning a round shows the right state.
  useEffect(() => {
    const refresh = () => setActiveRound(getActiveRound());
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const resumable = isInProgress(activeRound);

  return (
    <>
      {/* Full-bleed background image with a 60% navy overlay (spec Home). */}
      <div className="home-bg" aria-hidden="true" />
      <AppHeader navigate={navigate} title="" tone="transparent" active="home" />
      <main className="screen home">
        <div className="home-top">
          <h1 className="home-title">
            4 Right<span className="bang">!</span>
          </h1>
          <p className="home-tagline">Play Fair. Pay Up. Repeat.</p>

          {resumable && (
            <button
              type="button"
              className="pill-resume"
              onClick={() => navigate('score-entry')}
            >
              <span>Resume Round</span>
              <span className="sub">Hole {currentHole(activeRound)}</span>
            </button>
          )}
        </div>

        <div className="home-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('round/players')}
          >
            New Round
          </button>
          <button
            type="button"
            className="btn btn-outline btn-outline-white"
            onClick={() => navigate('history')}
          >
            View Rounds
          </button>
        </div>
      </main>
    </>
  );
}

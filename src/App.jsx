import { useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import Players from './components/Players.jsx';
import PlayerForm from './components/PlayerForm.jsx';
import RoundSetup from './components/RoundSetup.jsx';
import StrokeConfirmation from './components/StrokeConfirmation.jsx';
import CaptainsCommentary from './components/CaptainsCommentary.jsx';
import ScoreEntry from './components/ScoreEntry.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import Settlement from './components/Settlement.jsx';
import RoundHistory from './components/RoundHistory.jsx';
import Analytics from './components/Analytics.jsx';

// Client-side routing for all screens (spec section 4.2). We use the URL hash
// rather than pulling in a router dependency: it's tiny, gives the iPhone back
// button real meaning, and survives a reload / home-screen bookmark. Each route
// maps to one screen component; unknown hashes fall back to Home.
//
// The roster adds parameterized sub-routes under `players`:
//   players            -> roster list (management mode)
//   players/new        -> add-player form
//   players/:id/edit   -> edit-player form
// The New Round flow reuses the roster screen in selection mode:
//   round/players           -> roster in player-selection mode
//   round/setup?players=a,b -> Round Setup for the selected player IDs
const ROUTES = {
  home: Home,
  players: Players,
  'round-setup': RoundSetup,
  'stroke-confirmation': StrokeConfirmation,
  'captains-preround': CaptainsCommentary,
  'captains-postround': CaptainsCommentary,
  'score-entry': ScoreEntry,
  scoreboard: Scoreboard,
  settlement: Settlement,
  history: RoundHistory,
  analytics: Analytics,
};

const DEFAULT_ROUTE = 'home';

/**
 * Parse the location hash into a resolved screen + params. Handles the flat
 * ROUTES map and the parameterized players sub-routes.
 * @returns {{name:string, params:Object}}
 */
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'players') {
    if (segments[1] === 'new') return { name: 'player-form', params: { mode: 'new', id: null } };
    if (segments[1] && segments[2] === 'edit') {
      return { name: 'player-form', params: { mode: 'edit', id: decodeURIComponent(segments[1]) } };
    }
    return { name: 'players', params: {} };
  }

  if (segments[0] === 'round') {
    if (segments[1] === 'players') return { name: 'round-players', params: {} };
    if (segments[1] === 'setup') {
      const raw = new URLSearchParams(query).get('players');
      const playerIds = raw ? raw.split(',').filter(Boolean) : [];
      return { name: 'round-setup', params: { playerIds } };
    }
  }

  const name = ROUTES[path] ? path : DEFAULT_ROUTE;
  return { name, params: {} };
}

/** Imperative navigation helper handed to every screen as the `navigate` prop. */
export function navigate(route) {
  window.location.hash = `#/${route}`;
}

export default function App() {
  const [current, setCurrent] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setCurrent(parseHash());
    window.addEventListener('hashchange', onHashChange);
    // Normalize a bare load (no hash) to the canonical home route.
    if (!window.location.hash) window.location.replace('#/home');
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (current.name === 'player-form') {
    return <PlayerForm navigate={navigate} mode={current.params.mode} playerId={current.params.id} />;
  }
  if (current.name === 'round-players') {
    return <Players navigate={navigate} mode="select" />;
  }
  if (current.name === 'round-setup') {
    return <RoundSetup navigate={navigate} playerIds={current.params.playerIds} />;
  }
  if (current.name === 'captains-preround') {
    return <CaptainsCommentary navigate={navigate} phase="pre" />;
  }
  if (current.name === 'captains-postround') {
    return <CaptainsCommentary navigate={navigate} phase="post" />;
  }

  const Screen = ROUTES[current.name] ?? Home;
  return <Screen navigate={navigate} />;
}

// Captain's Commentary — the premium AI roast summary for a round.
//
// Generation goes through the `captains-commentary` Supabase Edge Function so the
// Anthropic key stays server-side (unlike the free Character Notes feature, which
// uses a device-local key). The prompt is built HERE from round data (so it is
// unit-testable) and POSTed to the function, which pins the model/temperature and
// forwards to Claude.

// The fixed system prompt also lives server-side; kept here for reference/tests.
export const SYSTEM_PROMPT =
  "You are the Captain's Log — the AI voice of Roast and Rake, a golf trash talk and " +
  'scoring app. Your voice is Kenny Powers: confident, unhinged, specific, and ' +
  'devastating. You roast real people by name using real data from their round. You ' +
  'never punch down and you never use slurs or hate speech — this is consensual ' +
  'roasting among friends who chose to be here. You write like the funniest guy in the ' +
  "foursome who also has access to everyone's scorecard, bet history, and character " +
  'flaws. Every summary should feel like it could only have been written about this ' +
  'specific group on this specific day. Keep summaries under 200 words. Do not use ' +
  'bullet points or headers — write in flowing paragraphs. End every summary with a ' +
  'single sharp closing line.';

// --- Subscription gate (stub) --------------------------------------------------
// Real billing (RevenueCat / App Store) is out of scope. The Captain is treated as a
// subscriber by default; set localStorage roastandrake_captain_subscribed = 'false'
// to preview the paywall placeholder.
const SUBSCRIBED_KEY = 'roastandrake_captain_subscribed';

export function isCaptainSubscriber() {
  try {
    return localStorage.getItem(SUBSCRIBED_KEY) !== 'false';
  } catch {
    return true;
  }
}

// --- Prompt construction (pure, unit-tested) -----------------------------------

/** Format a handicap index to one decimal, e.g. 9.6. */
function hcp(index) {
  const n = Number(index);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

/**
 * A "Games: ..." clause from the round's enabled games + bet amounts, e.g.
 * "Skins ($80 pool), Wolf ($2/pt), Snake ($10), Greenie ($2), Sandy ($2)".
 * `games` is a list of { label, detail } (detail optional).
 */
export function describeGames(games) {
  if (!Array.isArray(games) || games.length === 0) return 'None';
  return games
    .map((g) => (g.detail ? `${g.label} (${g.detail})` : g.label))
    .join(', ');
}

/** "Team A — Peter & Brooks; Team B — Jim & JP" or '' when no team game. */
function describeTeams(teams) {
  if (!teams || (!teams.A?.length && !teams.B?.length)) return '';
  const side = (label, names) => `Team ${label} — ${names.join(' & ')}`;
  return [side('A', teams.A || []), side('B', teams.B || [])].join('; ');
}

/** Player roster line + a character-notes block. */
function playerSection(players) {
  const roster = players.map((p) => `${p.name} (handicap ${hcp(p.handicapIndex)})`).join(', ');
  const notes = players
    .filter((p) => p.characterNote && p.characterNote.trim() !== '')
    .map((p) => `- ${p.name}: ${p.characterNote.trim()}`)
    .join('\n');
  return { roster, notes: notes || '(none on file)' };
}

/**
 * Build the pre-round user message from round data.
 * @param {{courseName:string, players:Array<{name,handicapIndex,characterNote?}>,
 *   games:Array<{label,detail?}>, teams?:{A:string[],B:string[]}|null,
 *   captainNote?:string}} data
 * @returns {string}
 */
export function buildPreRoundPrompt(data) {
  const { courseName, players = [], games = [], teams = null, captainNote = '' } = data;
  const { roster, notes } = playerSection(players);
  const teamText = describeTeams(teams);

  const lines = [
    'Write a pre-round Captain’s Log entry for the following round.',
    `Course: ${courseName}.`,
    `Players: ${roster}.`,
    `Games: ${describeGames(games)}.`,
  ];
  if (teamText) lines.push(`Teams: ${teamText}.`);
  lines.push('Character notes:', notes);
  if (captainNote && captainNote.trim() !== '') {
    lines.push(`Captain’s note: ${captainNote.trim()}`);
  }
  lines.push('Write the Captain’s Log.');
  return lines.join('\n');
}

/**
 * Build the post-round user message: everything in the pre-round plus results.
 * @param {Object} data - pre-round fields plus:
 *   holeScores: Array<{name, gross:number[], grossTotal:number, net:number}>
 *   matchResult: string|null
 *   skins: Array<{name, skins:number}>
 *   snakeHolder: string
 *   sideBets: Array<{name, greenies, sandies, netBirdies, netEagles, total}>
 *   settlement: { nets: Array<{name, net}>, instructions: string[] }
 *   preRoundSummary: string|null
 * @returns {string}
 */
export function buildPostRoundPrompt(data) {
  const {
    courseName,
    players = [],
    games = [],
    teams = null,
    captainNote = '',
    holeScores = [],
    matchResult = null,
    skins = [],
    snakeHolder = 'None',
    sideBets = [],
    settlement = { nets: [], instructions: [] },
    preRoundSummary = null,
  } = data;

  const { roster, notes } = playerSection(players);
  const teamText = describeTeams(teams);
  const money = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toFixed(2)}`;

  const lines = [
    'Write a post-round final-verdict Captain’s Log entry for the following completed round.',
    `Course: ${courseName}.`,
    `Players: ${roster}.`,
    `Games: ${describeGames(games)}.`,
  ];
  if (teamText) lines.push(`Teams: ${teamText}.`);

  lines.push('Scores (gross by hole; totals):');
  for (const p of holeScores) {
    lines.push(`- ${p.name}: holes ${p.gross.join(', ')} | gross ${p.grossTotal}, net ${p.net}`);
  }

  if (matchResult) lines.push(`Match play: ${matchResult}.`);
  if (skins.length) {
    lines.push(`Skins: ${skins.map((s) => `${s.name} ${s.skins}`).join(', ')}.`);
  }
  lines.push(`Snake (final holder): ${snakeHolder}.`);
  if (sideBets.length) {
    lines.push('Side bets (greenies/sandies/net birdies/net eagles, net $):');
    for (const s of sideBets) {
      lines.push(
        `- ${s.name}: ${s.greenies}G ${s.sandies}S ${s.netBirdies}NB ${s.netEagles}NE, ${money(s.total)}`,
      );
    }
  }
  lines.push('Settlement:');
  for (const n of settlement.nets) lines.push(`- ${n.name}: ${money(n.net)}`);
  if (settlement.instructions.length) {
    lines.push('Payments:');
    for (const i of settlement.instructions) lines.push(`- ${i}`);
  } else {
    lines.push('Payments: all square.');
  }

  lines.push('Character notes:', notes);
  if (captainNote && captainNote.trim() !== '') {
    lines.push(`Captain’s note: ${captainNote.trim()}`);
  }
  if (preRoundSummary && preRoundSummary.trim() !== '') {
    lines.push('Pre-round Captain’s Log (for continuity):', preRoundSummary.trim());
  }
  lines.push('Write the final-verdict Captain’s Log.');
  return lines.join('\n');
}

// --- Generation (calls the Edge Function) --------------------------------------

/** Resolve the Supabase project URL + anon key from the build env. */
function edgeConfig() {
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const anon = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  return { url, anon };
}

/** True when the Edge Function endpoint is configured for this build. */
export function isConfigured() {
  const { url, anon } = edgeConfig();
  return Boolean(url && anon);
}

/**
 * Generate a Captain's Log summary from a fully-built user prompt.
 * @param {string} userMessage - the constructed prompt (buildPre/PostRoundPrompt)
 * @returns {Promise<string>} the generated summary text
 */
export async function generateCommentary(userMessage) {
  const { url, anon } = edgeConfig();
  if (!url || !anon) {
    const err = new Error('Captain’s Commentary is not configured for this build.');
    err.code = 'not_configured';
    throw err;
  }
  const endpoint = `${String(url).replace(/\/$/, '')}/functions/v1/captains-commentary`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: anon,
      authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({ user: userMessage }),
  });
  if (!res.ok) {
    const err = new Error(`Captain’s Commentary request failed (${res.status}).`);
    err.code = 'request_failed';
    err.status = res.status;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  if (!text) throw new Error('The Captain returned nothing. Try again.');
  return text;
}

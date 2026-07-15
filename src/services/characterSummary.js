// Character Summary — calls the Claude API to turn a player's character notes into
// a short, sarcastic-but-affectionate locker-room blurb ("according to the Captain").
//
// This app has no backend, so the request goes straight from the browser. The
// Anthropic API key is NOT baked into the build (that would leak it on the public
// GitHub Pages deploy) — instead it's entered once by the user and kept in this
// device's localStorage. `dangerouslyAllowBrowser` acknowledges the direct-call model.

import Anthropic from '@anthropic-ai/sdk';

const KEY_STORAGE = 'fourright_anthropic_key';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT =
  'You write a two to three sentence character summary of a golfer based on notes ' +
  'provided by their playing partners. The tone should be sarcastic, affectionate, ' +
  'and locker-room appropriate — like something the smartest guy in the cart would ' +
  'say about someone he has played with for years. Respond with only the summary, ' +
  'no preamble.';

// The key is collected with an in-app input (see PlayerForm) and kept here — NOT a
// native window.prompt(). Native dialogs (alert/confirm/prompt) are avoided in this
// flow because on iOS Safari they can leave the page's text inputs unresponsive after
// dismissal, which previously broke "add another note" after generating a summary.

/** Read the stored API key, or '' if none is saved on this device. */
export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/** True when an API key is saved on this device. */
export function hasApiKey() {
  return getApiKey() !== '';
}

/** Save (or clear) the API key on this device. */
export function setApiKey(key) {
  const trimmed = typeof key === 'string' ? key.trim() : '';
  try {
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore write failure — key just won't persist */
  }
}

/** Clear a stored key (e.g. after an auth error) so the UI re-collects it. */
export function clearApiKey() {
  setApiKey('');
}

/**
 * Generate a character summary from an array of notes ([{ text, ... }]).
 * @param {Array<{text:string}>} notes
 * @returns {Promise<string>} the generated 2-3 sentence summary
 */
export async function generateCharacterSummary(notes) {
  const key = getApiKey();
  if (!key) {
    const err = new Error('An Anthropic API key is required to generate a summary.');
    err.code = 'no_key';
    throw err;
  }

  const list = notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
  const userMessage = `${list}\n\nSummarize this player in two to three sentences.`;

  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) throw new Error('The model returned an empty summary. Try again.');
  return text;
}

import { test, expect } from '@playwright/test';

// Regression guard for the iOS "Add Note does nothing after the first note" bug.
//
// Root cause: tapping the Add Note button while the note textarea is focused
// blurred the field, which on iOS Safari dismisses the soft keyboard and swallows
// the follow-up click — so the second note never appended. The fix is an
// onMouseDown preventDefault on the button (the same guard NumericKeypad uses),
// which keeps focus on the textarea so the click fires.
//
// This runs in mobile WebKit (see playwright.config.js), the only place the
// failure is observable — the Vitest suite has no DOM/browser.

const PLAYER = {
  id: 'p-smoke-1',
  firstName: 'Aaron',
  lastName: 'Bailey',
  nickname: 'AB',
  handicapIndex: 12.4,
};

const NOTE_FIELD = 'textarea[aria-label="New character note"]';

test('appends a second Character Note after the first (iOS keyboard tap guard)', async ({
  page,
}) => {
  // Seed one player, then open their edit screen.
  await page.goto('/#/home');
  await page.evaluate((p) => {
    localStorage.setItem('fourright_players', JSON.stringify([p]));
  }, PLAYER);
  await page.goto(`/#/players/${PLAYER.id}/edit`);

  const field = page.locator(NOTE_FIELD);
  const addNote = page.getByRole('button', { name: 'Add Note', exact: true });
  const noteRows = page.getByRole('button', { name: 'Delete note' }); // one per saved note
  const focusOnField = () =>
    page.evaluate((sel) => document.activeElement === document.querySelector(sel), NOTE_FIELD);

  await expect(field).toBeVisible();

  // First note: focus the field (soft keyboard would open on a real device),
  // type, tap Add Note.
  await field.tap();
  await field.fill('Aaron three-putted from four feet.');
  await addNote.tap();

  await expect(noteRows).toHaveCount(1);
  await expect(field).toHaveValue(''); // textarea reset after append
  // The regression sentinel: the tap must NOT blur the textarea. If it does, iOS
  // dismisses the keyboard and swallows the click, breaking the next add.
  expect(await focusOnField()).toBe(true);

  // Second note — the exact interaction the bug broke.
  await field.tap();
  await field.fill('Then blamed the greenskeeper.');
  await addNote.tap();

  await expect(noteRows).toHaveCount(2);
  expect(await focusOnField()).toBe(true);

  // Both notes are actually persisted, not just rendered.
  const stored = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('fourright_players') || '[]')[0];
    return (p.characterNotes || []).length;
  });
  expect(stored).toBe(2);
});

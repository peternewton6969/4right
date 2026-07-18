import { test, expect } from '@playwright/test';

// Regression guard for the iOS "Add Note does nothing after the first note" bug.
//
// Root cause: the button was `disabled` on `noteText.trim() === ''` and the
// handler read that same React state. On iOS Safari, dictation / autocorrect /
// predictive text can change the textarea's value WITHOUT firing a timely
// onChange, so `noteText` state stays '' while text is visibly in the field —
// leaving the button disabled and the tap dead, so no second note appended.
//
// Fix: the button is no longer disabled on stale state, and handleAddNote reads
// the live value from the textarea DOM node (noteInputRef) instead of state.
//
// These run in mobile WebKit (see playwright.config.js) — the engine iOS uses —
// which is where the failure is observable; the Vitest suite has no DOM.

const PLAYER = {
  id: 'p-smoke-1',
  firstName: 'Aaron',
  lastName: 'Bailey',
  nickname: 'AB',
  handicapIndex: 12.4,
};

const NOTE_FIELD = 'textarea[aria-label="New character note"]';

async function openEditScreen(page) {
  await page.goto('/#/home');
  await page.evaluate((p) => {
    localStorage.setItem('fourright_players', JSON.stringify([p]));
  }, PLAYER);
  await page.goto(`/#/players/${PLAYER.id}/edit`);
  await expect(page.locator(NOTE_FIELD)).toBeVisible();
}

const storedNoteCount = (page) =>
  page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('fourright_players') || '[]')[0];
    return (p?.characterNotes || []).length;
  });

test('appends multiple notes via normal typed input', async ({ page }) => {
  await openEditScreen(page);
  const field = page.locator(NOTE_FIELD);
  const addNote = page.getByRole('button', { name: 'Add Note', exact: true });
  const noteRows = page.getByRole('button', { name: 'Delete note' });

  await field.tap();
  await field.fill('Aaron three-putted from four feet.');
  await addNote.tap();
  await expect(noteRows).toHaveCount(1);
  await expect(field).toHaveValue('');

  await field.tap();
  await field.fill('Then blamed the greenskeeper.');
  await addNote.tap();
  await expect(noteRows).toHaveCount(2);

  expect(await storedNoteCount(page)).toBe(2);
});

test('appends a note when iOS updates the field without firing onChange (state desync)', async ({
  page,
}) => {
  await openEditScreen(page);
  const field = page.locator(NOTE_FIELD);
  const addNote = page.getByRole('button', { name: 'Add Note', exact: true });
  const noteRows = page.getByRole('button', { name: 'Delete note' });

  // First note normally, so we're in the post-first-note state the bug needs.
  await field.tap();
  await field.fill('Aaron three-putted from four feet.');
  await addNote.tap();
  await expect(noteRows).toHaveCount(1);

  // Simulate the iOS mechanism: set the field's DOM value directly, WITHOUT
  // dispatching an input/change event, so React's noteText state stays ''. This
  // is what dictation / autocorrect / predictive text can do on real iPhones.
  await page.evaluate((sel) => {
    const ta = document.querySelector(sel);
    ta.focus();
    ta.value = 'Then blamed the greenskeeper.';
  }, NOTE_FIELD);

  // The button must remain tappable (not disabled by stale state)...
  await expect(addNote).toBeEnabled();
  await addNote.tap();

  // ...and the note must actually append and persist, read from the live field.
  await expect(noteRows).toHaveCount(2);
  expect(await storedNoteCount(page)).toBe(2);
});

test('draft text survives a re-render (field is uncontrolled, not reset to stale state)', async ({
  page,
}) => {
  await openEditScreen(page);
  page.on('dialog', (d) => d.accept()); // the delete-note confirm

  const field = page.locator(NOTE_FIELD);
  const addNote = page.getByRole('button', { name: 'Add Note', exact: true });
  const noteRows = page.getByRole('button', { name: 'Delete note' });

  // Seed one note so there is something whose deletion forces a re-render.
  await field.tap();
  await field.fill('Aaron three-putted from four feet.');
  await addNote.tap();
  await expect(noteRows).toHaveCount(1);

  // Put draft text in the field WITHOUT an onChange (the iOS dictation case), so
  // React state has no knowledge of it.
  await page.evaluate((sel) => {
    document.querySelector(sel).value = 'A draft that must not vanish.';
  }, NOTE_FIELD);

  // Force a React re-render by deleting the existing note. A CONTROLLED field
  // would be reset to its (empty) state value here, silently eating the draft —
  // the exact class of failure behind the on-device bug. An uncontrolled field
  // keeps what the user entered.
  await noteRows.first().tap();
  await expect(noteRows).toHaveCount(0);
  await expect(field).toHaveValue('A draft that must not vanish.');

  // And it still appends normally.
  await addNote.tap();
  await expect(noteRows).toHaveCount(1);
});

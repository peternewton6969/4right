import { test, expect } from '@playwright/test';

// Score Entry rules quick-reference: the "?" in the header opens a modal showing the
// rules for exactly the games active in the current round — no more, no less.

const PLAYERS = [
  { id: 'p1', firstName: 'Aaron', lastName: 'Bailey', nickname: 'AB', handicapIndex: 12.4 },
  { id: 'p2', firstName: 'Sean', lastName: 'Cunningham', nickname: 'SC', handicapIndex: 8.1 },
];

// Active round with Skins + Wolf + Snake on (and every other game off), on the
// pre-seeded Prestonwood Meadows course so ScoreEntry resolves holes/par.
const ACTIVE_ROUND = {
  id: 'r1',
  date: '2026-07-23',
  courseId: 'prestonwood-meadows',
  status: 'active',
  playerIds: ['p1', 'p2'],
  teamAssignments: {},
  teamGame: null,
  teamGamePayout: 20,
  individualGames: ['skins', 'wolf'],
  individualGamePayouts: { skins: 10, wolfPointValue: 2 },
  junkGames: ['snake'],
  junkGamePayouts: { greenie: 2, snake: 10, sandy: 2, netBirdie: 2, netEagle: 4 },
  playerRounds: [
    { playerId: 'p1', handicapIndex: 12.4, courseHandicap: 12, differential: 4, strokeHolesMatchPlay: [4, 3], strokeHolesSkins: [4, 3] },
    { playerId: 'p2', handicapIndex: 8.1, courseHandicap: 8, differential: 0, strokeHolesMatchPlay: [], strokeHolesSkins: [] },
  ],
  holes: [],
  wolfHoles: [],
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
};

async function seed(page) {
  await page.goto('/#/home');
  await page.evaluate(
    ({ players, round }) => {
      localStorage.setItem('roastandrake_players', JSON.stringify(players));
      localStorage.setItem('roastandrake_active_round', JSON.stringify(round));
    },
    { players: PLAYERS, round: ACTIVE_ROUND },
  );
}

// The rules modal behaves identically on Score Entry and Settlement: same "?" trigger,
// same modal, showing only the round's active games.
async function verifyRulesModal(page) {
  await page.getByRole('button', { name: 'Round rules' }).tap();

  const dialog = page.getByRole('dialog', { name: 'Rules for this round' });
  await expect(dialog).toBeVisible();

  // Active games present, with their exact rule copy.
  await expect(dialog.getByRole('heading', { name: 'Skins', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Wolf', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Snake', exact: true })).toBeVisible();
  await expect(dialog).toContainText('Every hole is worth one skin');
  await expect(dialog).toContainText('Nobody wants the snake');

  // Inactive games absent.
  for (const label of ['Best Ball', 'Scramble', 'Greenie', 'Sandy', 'Net Birdie', 'Net Eagle']) {
    await expect(dialog.getByRole('heading', { name: label, exact: true })).toHaveCount(0);
  }

  // Closes from the top-right ✕.
  await dialog.getByRole('button', { name: 'Close' }).tap();
  await expect(dialog).toHaveCount(0);
}

test('Score Entry: the ? opens a rules modal showing only the active games', async ({ page }) => {
  await seed(page);
  await page.goto('/#/score-entry');
  await expect(page.getByRole('heading', { name: /Hole 1/ })).toBeVisible();
  await verifyRulesModal(page);
});

test('Settlement: the ? opens a rules modal showing only the active games', async ({ page }) => {
  await seed(page);
  await page.goto('/#/settlement');
  await expect(page.getByRole('heading', { name: 'Who Pays Who' })).toBeVisible();
  await verifyRulesModal(page);
});

test('Scoreboard: the ? opens a rules modal showing only the active games', async ({ page }) => {
  await seed(page);
  await page.goto('/#/scoreboard');
  await expect(page.getByRole('tab', { name: 'Round' })).toBeVisible();
  await verifyRulesModal(page);
});

test('Round History: the rules button on an expanded round shows only its games', async ({ page }) => {
  const completed = {
    ...ACTIVE_ROUND,
    status: 'complete',
    players: PLAYERS.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })),
    completedAt: '2026-07-23T02:00:00.000Z',
  };
  await page.goto('/#/home');
  await page.evaluate(
    ({ players, rounds }) => {
      localStorage.setItem('roastandrake_players', JSON.stringify(players));
      localStorage.setItem('roastandrake_rounds', JSON.stringify(rounds));
    },
    { players: PLAYERS, rounds: [completed] },
  );
  await page.goto('/#/history');

  // Expand the saved round, then open its rules quick-reference.
  await page.getByRole('button', { name: /Prestonwood Meadows/ }).tap();
  await verifyRulesModal(page);
});

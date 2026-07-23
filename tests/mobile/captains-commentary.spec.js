import { test, expect } from '@playwright/test';

// Captain's Commentary flow + surfaces. Live AI generation requires the deployed
// captains-commentary Edge Function (+ Supabase env), so these cover everything that
// does NOT hit the network: the pre/post screens, the Skip paths, the paywall stub,
// and the saved-summary display in Round History.

const PLAYERS = [
  { id: 'p1', firstName: 'Aaron', lastName: 'Bailey', nickname: 'AB', handicapIndex: 12.4 },
  { id: 'p2', firstName: 'Sean', lastName: 'Cunningham', nickname: 'SC', handicapIndex: 8.1 },
];

const ROUND = {
  id: 'r1', date: '2026-07-23', courseId: 'prestonwood-meadows', status: 'active',
  playerIds: ['p1', 'p2'], teamAssignments: {}, teamGame: null, teamGamePayout: 20,
  individualGames: ['skins', 'wolf'], individualGamePayouts: { skins: 80, wolfPointValue: 2 },
  junkGames: ['snake'], junkGamePayouts: { greenie: 2, snake: 10, sandy: 2, netBirdie: 2, netEagle: 4 },
  playerRounds: [
    { playerId: 'p1', handicapIndex: 12.4, courseHandicap: 12, differential: 4, strokeHolesMatchPlay: [4, 3], strokeHolesSkins: [4, 3] },
    { playerId: 'p2', handicapIndex: 8.1, courseHandicap: 8, differential: 0, strokeHolesMatchPlay: [], strokeHolesSkins: [] },
  ],
  holes: [], wolfHoles: [], createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z',
};

async function seedActive(page, extra = {}) {
  await page.goto('/#/home');
  await page.evaluate(
    ({ players, round }) => {
      localStorage.setItem('roastandrake_players', JSON.stringify(players));
      localStorage.setItem('roastandrake_active_round', JSON.stringify(round));
    },
    { players: PLAYERS, round: { ...ROUND, ...extra } },
  );
}

test('Pre-round screen renders and Skip goes straight to hole 1', async ({ page }) => {
  await seedActive(page);
  await page.goto('/#/captains-preround');

  await expect(page.getByRole('heading', { name: "Captain's Log — Pre-Round" })).toBeVisible();
  await expect(page.getByLabel("Captain's note")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Pre-Round Report' })).toBeVisible();

  await page.getByRole('button', { name: 'Skip — Start Round' }).tap();
  await expect(page.getByRole('heading', { name: /Hole 1/ })).toBeVisible();
});

test('Post-round screen renders and Skip goes straight to settlement', async ({ page }) => {
  await seedActive(page);
  await page.goto('/#/captains-postround');

  await expect(page.getByRole('heading', { name: "Captain's Log — Final Verdict" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Final Verdict' })).toBeVisible();

  await page.getByRole('button', { name: 'Skip — View Settlement' }).tap();
  await expect(page.getByRole('heading', { name: 'Who Pays Who' })).toBeVisible();
});

test('Non-subscriber sees the premium paywall stub but can still start the round', async ({ page }) => {
  await seedActive(page);
  await page.evaluate(() => localStorage.setItem('roastandrake_captain_subscribed', 'false'));
  await page.goto('/#/captains-preround');

  await expect(page.getByText('Premium Feature')).toBeVisible();
  await expect(page.getByText('Coming Soon')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Pre-Round Report' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Start Round' }).tap();
  await expect(page.getByRole('heading', { name: /Hole 1/ })).toBeVisible();
});

test('Saved Captain\'s Log entries appear in Round History', async ({ page }) => {
  const completed = {
    ...ROUND,
    status: 'complete',
    players: PLAYERS.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })),
    captainsPreRound: 'Four men who should know better. Snake is live.',
    captainsPostRound: 'Team B wins. Brooks broke even, which is its own kind of insult. See you Tuesday.',
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

  await page.getByRole('button', { name: /Prestonwood Meadows/ }).tap();
  await expect(page.getByText("Captain's Log — Final Verdict")).toBeVisible();
  await expect(page.getByText('its own kind of insult', { exact: false })).toBeVisible();
  await expect(page.getByText("Captain's Log — Pre-Round")).toBeVisible();
  await expect(page.getByText('Four men who should know better', { exact: false })).toBeVisible();
});

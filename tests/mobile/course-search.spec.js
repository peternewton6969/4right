import { test, expect } from '@playwright/test';

// End-to-end course-selection flow in mobile WebKit with the two external APIs
// (OpenGolfAPI search, golfApi.io scorecard) MOCKED at the network layer. The live
// API contracts are not verified here — this exercises the app's flow, caching,
// tee selection, and analytics logging against the documented/assumed shapes.

const PLAYERS = [
  { id: 'p1', firstName: 'Aaron', lastName: 'Bailey', nickname: 'AB', handicapIndex: 12.4 },
  { id: 'p2', firstName: 'Sean', lastName: 'Cunningham', nickname: 'SC', handicapIndex: 8.1 },
];

const holes18 = () =>
  Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: [3, 4, 5][i % 3],
    strokeIndex: i + 1,
  }));

const SEARCH_BODY = {
  courses: [
    { id: 'pebble-1', name: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA' },
    { id: 'spyglass-1', name: 'Spyglass Hill', city: 'Pebble Beach', state: 'CA' },
  ],
};

const SCORECARD_BODY = {
  id: 'pebble-1',
  name: 'Pebble Beach Golf Links',
  city: 'Pebble Beach',
  state: 'CA',
  par: 72,
  tees: [
    { name: 'Blue', rating: 74.1, slope: 143, yardage: 6800, holes: holes18() },
    { name: 'White', rating: 71.2, slope: 135, yardage: 6100, holes: holes18() },
  ],
};

async function mockApis(page, { scorecardCount } = {}) {
  const counts = { search: 0, scorecard: 0 };
  await page.route('**://api.opengolfapi.org/**', async (route) => {
    counts.search += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(SEARCH_BODY),
    });
  });
  await page.route('**://www.golfapi.io/**', async (route) => {
    counts.scorecard += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(SCORECARD_BODY),
    });
  });
  return counts;
}

async function openRoundSetup(page, { withKey = true } = {}) {
  await page.goto('/#/home');
  await page.evaluate(
    ({ players, withKey }) => {
      localStorage.setItem('roastandrake_players', JSON.stringify(players));
      if (withKey) localStorage.setItem('roastandrake_golfapi_key', 'gk_test_key');
    },
    { players: PLAYERS, withKey },
  );
  await page.goto('/#/round/setup?players=p1,p2');
  await expect(page.getByLabel('Course search')).toBeVisible();
}

const analytics = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('roastandrake_analytics') || '[]'));
const types = (events) => events.map((e) => e.type);

test('search → live fetch → tee select → confirm logs the full funnel', async ({ page }) => {
  const counts = await mockApis(page);
  await openRoundSetup(page);

  const search = page.getByLabel('Course search');
  await search.click();
  await search.fill('peb');

  const result = page.getByRole('button', { name: /Pebble Beach Golf Links/ });
  await expect(result).toBeVisible();
  await result.tap();

  // Tee list appears from the mocked scorecard.
  const blueTee = page.getByRole('button', { name: /Blue/ });
  await expect(blueTee).toBeVisible();
  await blueTee.tap();

  // Selected summary shows the course + chosen tee.
  await expect(page.getByText('✓ Pebble Beach Golf Links')).toBeVisible();

  await page.getByRole('button', { name: 'Start Round' }).tap();

  // The fetched course is persisted for downstream screens, and cached.
  const persisted = await page.evaluate(() => ({
    courses: JSON.parse(localStorage.getItem('roastandrake_courses') || '[]').map((c) => c.id),
    cache: Object.keys(JSON.parse(localStorage.getItem('roastandrake_course_cache') || '{}')),
  }));
  expect(persisted.courses).toContain('pebble-1');
  expect(persisted.cache).toContain('pebble-1');

  const events = await analytics(page);
  const t = types(events);
  expect(t).toContain('search_opened');
  expect(t).toContain('first_character_typed');
  expect(t).toContain('results_displayed');
  expect(t).toContain('course_tapped');
  expect(t).toContain('fetch_started');
  expect(t).toContain('tee_selection_shown');
  expect(t).toContain('tee_selected');
  expect(t).toContain('selection_confirmed');

  const results = events.find((e) => e.type === 'results_displayed');
  expect(results.count).toBe(2);

  const fetchDone = events.find((e) => e.type === 'fetch_completed');
  expect(fetchDone.source).toBe('live');
  expect(fetchDone.durationMs).toBeGreaterThanOrEqual(0);

  const confirmed = events.find((e) => e.type === 'selection_confirmed');
  expect(confirmed).toMatchObject({ courseName: 'Pebble Beach Golf Links', teeName: 'Blue', source: 'live' });

  expect(counts.scorecard).toBe(1); // exactly one live fetch
});

test('second selection of the same course is served from cache', async ({ page }) => {
  const counts = await mockApis(page);
  await openRoundSetup(page);

  const search = page.getByLabel('Course search');
  await search.click();
  await search.fill('peb');
  await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).tap();
  await page.getByRole('button', { name: /Blue/ }).tap();
  await expect(page.getByText('✓ Pebble Beach Golf Links')).toBeVisible();

  // Change and re-select the same course — should hit the cache, no 2nd fetch.
  await page.getByRole('button', { name: 'Change course' }).tap();
  await search.click();
  await search.fill('peb');
  await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).tap();
  await page.getByRole('button', { name: /White/ }).tap();
  await expect(page.getByText('✓ Pebble Beach Golf Links')).toBeVisible();

  expect(counts.scorecard).toBe(1); // only the first selection fetched live

  const events = await analytics(page);
  const fetchDone = events.filter((e) => e.type === 'fetch_completed');
  expect(fetchDone.map((e) => e.source)).toEqual(['live', 'cache']);
});

test('suggested (Prestonwood) course loads instantly without any fetch', async ({ page }) => {
  const counts = await mockApis(page);
  await openRoundSetup(page, { withKey: false });

  await page.getByRole('button', { name: 'Meadows', exact: true }).tap();
  await expect(page.getByText('✓ Prestonwood Meadows')).toBeVisible();
  await page.getByRole('button', { name: 'Start Round' }).tap();

  expect(counts.scorecard).toBe(0); // hardcoded bypasses the API
  const events = await analytics(page);
  const confirmed = events.find((e) => e.type === 'selection_confirmed');
  expect(confirmed).toMatchObject({ courseName: 'Prestonwood Meadows', source: 'hardcoded' });
});

test('leaving setup without confirming logs an abandonment with the last step', async ({ page }) => {
  await mockApis(page);
  await openRoundSetup(page);

  const search = page.getByLabel('Course search');
  await search.click();
  await search.fill('peb');
  await expect(page.getByRole('button', { name: /Pebble Beach Golf Links/ })).toBeVisible();

  // Navigate away without confirming.
  await page.goto('/#/home');

  const events = await analytics(page);
  const abandoned = events.find((e) => e.type === 'selection_abandoned');
  expect(abandoned).toBeTruthy();
  expect(abandoned.lastStep).toBe('results');
});

test('analytics dashboard renders a summary from logged events', async ({ page }) => {
  await mockApis(page);
  await openRoundSetup(page);
  const search = page.getByLabel('Course search');
  await search.click();
  await search.fill('peb');
  await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).tap();
  await page.getByRole('button', { name: /Blue/ }).tap();
  await page.getByRole('button', { name: 'Start Round' }).tap();

  await page.goto('/#/analytics');
  await expect(page.getByText('Avg fetch (live)')).toBeVisible();
  await expect(page.getByText('Completion rate')).toBeVisible();
  await expect(page.getByText('Top courses selected')).toBeVisible();
  await expect(page.getByText('Pebble Beach Golf Links').first()).toBeVisible();
});

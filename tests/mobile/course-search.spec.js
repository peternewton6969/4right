import { test, expect } from '@playwright/test';

// End-to-end course-selection flow in mobile WebKit with the two external APIs
// (OpenGolfAPI search, golfApi.io scorecard) MOCKED at the network layer. The live
// API contracts are not verified here — this exercises the app's flow, caching,
// tee selection, and analytics logging against the documented/assumed shapes.

const PLAYERS = [
  { id: 'p1', firstName: 'Aaron', lastName: 'Bailey', nickname: 'AB', handicapIndex: 12.4 },
  { id: 'p2', firstName: 'Sean', lastName: 'Cunningham', nickname: 'SC', handicapIndex: 8.1 },
];

// OpenGolfAPI detail shape: per-course holes_data (with handicap_index) + tees
// (course_rating/slope/yardage, no per-tee holes).
const holesData = () =>
  Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: [3, 4, 5][i % 3],
    handicap_index: i + 1,
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
  holes: 18,
  holes_data: holesData(),
  tees: [
    { tee_key: 'blue-male', tee_name: 'Blue', gender: 'Male', course_rating: 74.1, slope: 143, par: 72, yardage: 6800 },
    { tee_key: 'white-male', tee_name: 'White', gender: 'Male', course_rating: 71.2, slope: 135, par: 72, yardage: 6100 },
  ],
};

// Both search and course detail are served by OpenGolfAPI (one provider), on the
// same host with different paths — branch on the URL.
async function mockApis(page) {
  const counts = { search: 0, scorecard: 0 };
  await page.route('**://api.opengolfapi.org/**', async (route) => {
    const url = route.request().url();
    const isSearch = url.includes('/courses/search');
    if (isSearch) counts.search += 1;
    else counts.scorecard += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(isSearch ? SEARCH_BODY : SCORECARD_BODY),
    });
  });
  return counts;
}

async function openRoundSetup(page) {
  await page.goto('/#/home');
  await page.evaluate((players) => {
    localStorage.setItem('roastandrake_players', JSON.stringify(players));
  }, PLAYERS);
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

  // Each result row is now [main select button, star toggle] — both carry the course
  // name in their accessible name, so target the row's main button with .first().
  const result = page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first();
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
  await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first().tap();
  await page.getByRole('button', { name: /Blue/ }).tap();
  await expect(page.getByText('✓ Pebble Beach Golf Links')).toBeVisible();

  // Change and re-select the same course — should hit the cache, no 2nd fetch.
  await page.getByRole('button', { name: 'Change course' }).tap();
  await search.click();
  await search.fill('peb');
  await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first().tap();
  await page.getByRole('button', { name: /White/ }).tap();
  await expect(page.getByText('✓ Pebble Beach Golf Links')).toBeVisible();

  expect(counts.scorecard).toBe(1); // only the first selection fetched live

  const events = await analytics(page);
  const fetchDone = events.filter((e) => e.type === 'fetch_completed');
  expect(fetchDone.map((e) => e.source)).toEqual(['live', 'cache']);
});

test('My Courses is pre-seeded with the Prestonwood courses (no static suggested list)', async ({ page }) => {
  await mockApis(page);
  await openRoundSetup(page);

  // The old "Suggested (verified)" hardcoded chip list is gone; favorites replace it.
  await expect(page.getByText('Suggested (verified)')).toHaveCount(0);
  await expect(page.getByText('My Courses')).toBeVisible();

  const favs = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rr_favorite_courses') || '[]'),
  );
  expect(favs.map((f) => f.courseId)).toEqual([
    'prestonwood-meadows',
    'prestonwood-highlands',
    'prestonwood-fairways',
  ]);
});

test('a seeded Prestonwood favorite selects instantly without any fetch', async ({ page }) => {
  const counts = await mockApis(page);
  await openRoundSetup(page);

  // Tap the favorite's main (select) button — .first() skips its star toggle.
  await page.getByRole('button', { name: /Prestonwood Meadows/ }).first().tap();
  await expect(page.getByText('✓ Prestonwood Meadows')).toBeVisible();
  await page.getByRole('button', { name: 'Start Round' }).tap();

  expect(counts.scorecard).toBe(0); // round-ready favorite bypasses the API
  const events = await analytics(page);
  const confirmed = events.find((e) => e.type === 'selection_confirmed');
  expect(confirmed).toMatchObject({ courseName: 'Prestonwood Meadows', source: 'favorite' });
});

test('favoriting a search result persists across a page refresh', async ({ page }) => {
  await mockApis(page);
  await openRoundSetup(page);

  const search = page.getByLabel('Course search');
  await search.click();
  await search.fill('peb');
  await expect(page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first()).toBeVisible();

  // Tap the star on the first result to save it.
  await page.getByRole('button', { name: 'Save Pebble Beach Golf Links to My Courses' }).tap();

  // It is written to localStorage as a bare pointer (no tee data yet).
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rr_favorite_courses') || '[]'),
  );
  expect(saved.map((f) => f.courseId)).toContain('pebble-1');

  // Reload the setup screen — the favorite survives and shows under My Courses.
  await page.reload();
  await expect(page.getByLabel('Course search')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first(),
  ).toBeVisible();
  const afterReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rr_favorite_courses') || '[]'),
  );
  expect(afterReload.map((f) => f.courseId)).toContain('pebble-1');
});

test('leaving setup without confirming logs an abandonment with the last step', async ({ page }) => {
  await mockApis(page);
  await openRoundSetup(page);

  const search = page.getByLabel('Course search');
  await search.click();
  await search.fill('peb');
  await expect(page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first()).toBeVisible();

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
  await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).first().tap();
  await page.getByRole('button', { name: /Blue/ }).tap();
  await page.getByRole('button', { name: 'Start Round' }).tap();

  await page.goto('/#/analytics');
  await expect(page.getByText('Avg fetch (live)')).toBeVisible();
  await expect(page.getByText('Completion rate')).toBeVisible();
  await expect(page.getByText('Top courses selected')).toBeVisible();
  await expect(page.getByText('Pebble Beach Golf Links').first()).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import {
  createTournament,
  enterScores,
  matchBetween,
  playAllReadyMatches,
  resetApp,
  showListView,
  statusBadge,
} from '../fixtures/test-utils';
import { PLAYERS_4 } from '../fixtures/players';

const FOUR = PLAYERS_4.players.map((p) => p.name);

/** Single elimination, favourites win: Alice 2-0, Bob 1-1, Charlie 0-1, Diana 0-1. */
async function finishedTournament(page: Page, name: string) {
  await createTournament(page, { name, format: 'Single Elimination', players: FOUR });
  await showListView(page);
  await playAllReadyMatches(page, FOUR);
  await expect(statusBadge(page)).toHaveText('Status: completed');
}

const statsRow = (page: Page, player: string) => page.getByRole('row').filter({ hasText: player });

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Dashboard', () => {
  test('shows an empty state with a way to start', async ({ page }) => {
    await expect(page.getByText('No tournaments yet')).toBeVisible();
    await page.getByRole('link', { name: 'Create Your First Tournament' }).click();
    await expect(page).toHaveURL(/\/tournament\/new$/);
  });

  test('lists active and finished tournaments separately', async ({ page }) => {
    test.slow();
    await createTournament(page, { name: 'In Progress', format: 'Single Elimination', players: FOUR });
    await finishedTournament(page, 'All Done');
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Active Tournaments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Tournaments' })).toBeVisible();
    // Active cards are listed before the recent ones
    const links = await page.getByRole('link', { name: /In Progress|All Done/ }).allTextContents();
    expect(links.findIndex((t) => t.includes('In Progress'))).toBeLessThan(links.findIndex((t) => t.includes('All Done')));
  });

  test('deletes a tournament after confirmation', async ({ page }) => {
    await createTournament(page, { name: 'Throwaway', format: 'Single Elimination', players: FOUR });
    await page.goto('/');
    await page.getByRole('button', { name: 'Delete tournament Throwaway' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No tournaments yet')).toBeVisible();
  });
});

test.describe('Tournament page', () => {
  test('deleting from the tournament page returns to the dashboard', async ({ page }) => {
    await createTournament(page, { name: 'Gone Soon', format: 'Single Elimination', players: FOUR });
    await page.getByRole('button', { name: 'Delete Tournament' }).click();
    // The confirmation dialog's button has the same label as the one that opened it
    await page.getByRole('button', { name: 'Delete Tournament' }).last().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('No tournaments yet')).toBeVisible();
  });

  test('shows a not-found message for unknown ids', async ({ page }) => {
    await page.goto('/tournament/does-not-exist');
    await expect(page.getByText('Tournament not found')).toBeVisible();
  });
});

test.describe('History', () => {
  test('only lists completed tournaments', async ({ page }) => {
    test.slow();
    await page.goto('/history');
    await expect(page.getByText('No completed tournaments yet')).toBeVisible();

    await createTournament(page, { name: 'Unfinished', format: 'Single Elimination', players: FOUR });
    await finishedTournament(page, 'Finished Cup');
    await page.goto('/history');
    await expect(page.getByRole('link', { name: /Finished Cup/ })).toBeVisible();
    await expect(page.getByText('Unfinished')).toHaveCount(0);
    await expect(page.getByText(/Completed \w{3} \d{1,2}, \d{4}/)).toBeVisible();
  });
});

test.describe('Statistics', () => {
  test('starts empty', async ({ page }) => {
    await page.goto('/stats');
    await expect(page.getByText(/No player statistics yet/)).toBeVisible();
  });

  test('totals wins and losses across tournaments', async ({ page }) => {
    test.slow();
    await finishedTournament(page, 'Week 1');
    await finishedTournament(page, 'Week 2');
    await page.goto('/stats');

    await expect(statsRow(page, 'Alice')).toContainText('4');
    await expect(statsRow(page, 'Alice')).toContainText('100.0%');
    await expect(statsRow(page, 'Bob')).toContainText('50.0%');
    await expect(statsRow(page, 'Diana')).toContainText('0.0%');
  });

  test('stay correct after a result is edited', async ({ page }) => {
    await createTournament(page, { name: 'Edited', format: 'Single Elimination', players: FOUR });
    await showListView(page);
    await playAllReadyMatches(page, FOUR); // Alice beats Diana, then Bob

    // Diana actually won round 1; Alice's final is cleared
    await matchBetween(page, 'Alice', 'Diana').click();
    await page.getByRole('button', { name: 'Continue Editing' }).click();
    await enterScores(page, { Alice: 1, Diana: 3 });

    await page.goto('/stats');
    // Alice: 0 wins, 1 loss. Diana: 1 win, 0 losses. Bob: 1 win (round 1), 0 losses.
    await expect(statsRow(page, 'Alice')).toContainText('0.0%');
    await expect(statsRow(page, 'Diana')).toContainText('100.0%');
    await expect(statsRow(page, 'Bob')).toContainText('100.0%');
  });
});

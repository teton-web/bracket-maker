import { expect, test } from '@playwright/test';
import { createTournament, playMatch, resetApp, showListView, statusBadge } from '../fixtures/test-utils';
import { PLAYERS_4 } from '../fixtures/players';

const FOUR = PLAYERS_4.players.map((p) => p.name);

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Phone layout', () => {
  test('navigation lives behind the menu button', async ({ page }) => {
    const menu = page.getByRole('button', { name: 'Toggle menu' });
    await expect(menu).toBeVisible();
    await menu.click();
    await page.getByRole('navigation').getByRole('link', { name: /Stats/ }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.getByRole('heading', { name: 'Player Statistics' }).first()).toBeVisible();
  });

  test('a tournament can be created and scored on a phone', async ({ page }) => {
    await createTournament(page, { name: 'Pocket Cup', format: 'Single Elimination', players: FOUR });
    await showListView(page);
    await playMatch(page, 'Alice', 'Diana');
    await expect(statusBadge(page)).toHaveText('Status: active');
  });

  test('pages fit the screen without sideways scrolling', async ({ page }) => {
    for (const path of ['/', '/tournament/new', '/history', '/players', '/stats']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
});

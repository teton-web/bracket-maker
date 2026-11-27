import { expect, test } from '@playwright/test';
import {
  createTournament,
  enterScores,
  matchBetween,
  playAllReadyMatches,
  playMatch,
  playersOnCard,
  readyMatches,
  resetApp,
  showListView,
  statusBadge,
} from '../fixtures/test-utils';
import { PLAYERS_4 } from '../fixtures/players';

const FOUR = PLAYERS_4.players.map((p) => p.name);
const scoreDialog = (page: import('@playwright/test').Page) => page.getByRole('heading', { name: 'Enter Match Score' });

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createTournament(page, { name: 'Edits', format: 'Single Elimination', players: FOUR });
  await showListView(page);
});

test.describe('Scoring', () => {
  test('rejects tied scores', async ({ page }) => {
    await matchBetween(page, 'Alice', 'Diana').click();
    await page.getByLabel('Alice', { exact: true }).fill('2');
    await page.getByLabel('Diana', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Save Score' }).click();
    await expect(page.getByText('Scores must be different')).toBeVisible();
    await expect(scoreDialog(page)).toBeVisible();
  });

  test('supports arrow keys, Enter to save and Escape to cancel', async ({ page }) => {
    await matchBetween(page, 'Alice', 'Diana').click();
    await page.keyboard.press('Escape');
    await expect(scoreDialog(page)).toBeHidden();
    await expect(matchBetween(page, 'Alice', 'Diana')).toHaveAttribute('data-status', 'ready');

    await matchBetween(page, 'Alice', 'Diana').click();
    const alice = page.getByLabel('Alice', { exact: true });
    await expect(alice).toBeFocused();
    await alice.press('ArrowUp');
    await alice.press('ArrowUp');
    await expect(alice).toHaveValue('2');
    await page.getByLabel('Diana', { exact: true }).fill('1');
    await page.keyboard.press('Enter');
    await expect(scoreDialog(page)).toBeHidden();
    await expect(matchBetween(page, 'Alice', 'Diana')).toHaveAttribute('data-status', 'completed');
  });

  test('scores survive a page reload', async ({ page }) => {
    await playMatch(page, 'Alice', 'Diana', 5, 2);
    await page.reload();
    await showListView(page);
    await expect(matchBetween(page, 'Alice', 'Diana')).toHaveAttribute('data-status', 'completed');
    await expect(matchBetween(page, 'Alice', 'Diana')).toContainText('5');
  });
});

test.describe('Editing results', () => {
  test('changing a result clears the matches it fed into', async ({ page }) => {
    await playMatch(page, 'Alice', 'Diana');
    await playMatch(page, 'Bob', 'Charlie');
    await expect(matchBetween(page, 'Alice', 'Bob')).toHaveAttribute('data-status', 'ready');

    await matchBetween(page, 'Alice', 'Diana').click();
    await expect(page.getByRole('heading', { name: 'Edit Completed Match' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue Editing' }).click();
    await expect(page.getByLabel('Alice', { exact: true })).toHaveValue('3');
    await enterScores(page, { Alice: 1, Diana: 3 });

    await expect(matchBetween(page, 'Alice', 'Bob')).toHaveCount(0);
    await expect(matchBetween(page, 'Diana', 'Bob')).toHaveAttribute('data-status', 'ready');
  });

  test('editing a finished tournament reopens it', async ({ page }) => {
    await playAllReadyMatches(page, FOUR);
    await expect(statusBadge(page)).toHaveText('Status: completed');

    // Completed tournaments show the bracket view; edit the first-round result there
    await matchBetween(page, 'Bob', 'Charlie').click();
    await page.getByRole('button', { name: 'Continue Editing' }).click();
    await enterScores(page, { Bob: 0, Charlie: 3 });

    await expect(statusBadge(page)).toHaveText('Status: active');
    await expect(page.getByTestId('winner-celebration')).toHaveCount(0);
    await showListView(page);
    await expect(matchBetween(page, 'Alice', 'Charlie')).toHaveAttribute('data-status', 'ready');
  });
});

test.describe('Match overrides', () => {
  test('a forfeit advances the chosen winner and marks the match', async ({ page }) => {
    const match = matchBetween(page, 'Bob', 'Charlie');
    await match.getByTestId('match-override-button').click();
    await page.getByRole('button', { name: 'Force Winner' }).click();
    await page.getByLabel('Charlie').check();
    await page.getByLabel('Mark as forfeit/DQ').check();
    await page.getByRole('button', { name: 'Confirm Winner' }).click();
    await expect(page.getByText('Match forfeited')).toBeVisible();

    await expect(match).toHaveAttribute('data-status', 'completed');
    await expect(match).toContainText('FF');
    await playMatch(page, 'Alice', 'Diana');
    await expect(matchBetween(page, 'Alice', 'Charlie').and(readyMatches(page))).toHaveCount(1);
  });

  test('players can be swapped between slots before a match is played', async ({ page }) => {
    const match = matchBetween(page, 'Alice', 'Diana');
    expect(await playersOnCard(match, FOUR)).toEqual(['Alice', 'Diana']);

    await match.getByTestId('match-override-button').click();
    await page.getByLabel('Player 2 (Bottom Slot)').selectOption({ label: '-- Empty (TBD) --' });
    await page.getByLabel('Player 1 (Top Slot)').selectOption({ label: 'Diana (Seed 4)' });
    await page.getByLabel('Player 2 (Bottom Slot)').selectOption({ label: 'Alice (Seed 1)' });
    await page.getByRole('button', { name: 'Apply Changes' }).click();
    await expect(page.getByText('Match players updated')).toBeVisible();

    expect(await playersOnCard(matchBetween(page, 'Alice', 'Diana'), FOUR)).toEqual(['Diana', 'Alice']);
  });
});

import { expect, test } from '@playwright/test';
import { addPlayers, createTournament, matchCards, resetApp, statusBadge } from '../fixtures/test-utils';
import { PLAYERS_4 } from '../fixtures/players';

const FOUR = PLAYERS_4.players.map((p) => p.name);

test.describe('Creating a tournament', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await page.goto('/tournament/new');
  });

  test('double elimination is the default format', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Double Elimination' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('requires a name and enough players', async ({ page }) => {
    await page.getByRole('button', { name: 'Create & Start Tournament' }).click();
    await expect(page.getByText('Please enter a tournament name')).toBeVisible();

    await page.getByLabel('Tournament Name').fill('Too Small');
    await addPlayers(page, ['Solo']);
    await page.getByRole('button', { name: 'Create & Start Tournament' }).click();
    await expect(page.getByText('Please add at least 2 players for this format')).toBeVisible();
    await expect(page).toHaveURL(/\/tournament\/new$/);
  });

  test('group stage needs at least 4 players', async ({ page }) => {
    await page.getByLabel('Tournament Name').fill('Groups');
    await page.getByRole('button', { name: 'Group Stage + Knockout' }).click();
    await addPlayers(page, ['A', 'B', 'C']);
    await page.getByRole('button', { name: 'Create & Start Tournament' }).click();
    await expect(page.getByText('Please add at least 4 players for this format')).toBeVisible();
  });

  test('adds players in seed order and renumbers seeds after a removal', async ({ page }) => {
    await addPlayers(page, FOUR);
    await expect(page.getByTestId('player-name')).toHaveText(FOUR);

    await page.getByTestId('player').filter({ hasText: 'Bob' }).getByTestId('remove-player').click();
    await expect(page.getByTestId('player-name')).toHaveText(['Alice', 'Charlie', 'Diana']);
    await expect(page.getByTestId('player').filter({ hasText: 'Charlie' })).toContainText('2');
  });

  test('shuffle keeps the same players', async ({ page }) => {
    await addPlayers(page, FOUR);
    await page.getByRole('button', { name: 'Shuffle' }).click();
    await expect(page.getByText('Players shuffled!')).toBeVisible();
    const names = await page.getByTestId('player-name').allTextContents();
    expect([...names].sort()).toEqual([...FOUR].sort());
  });

  test('shows Swiss and group stage settings with sensible defaults', async ({ page }) => {
    await page.getByRole('button', { name: 'Swiss System' }).click();
    await expect(page.getByLabel('Number of Rounds')).toHaveValue('3');
    await page.getByRole('button', { name: 'Qualification Mode' }).click();
    await expect(page.getByLabel('Wins to Qualify')).toHaveValue('3');
    await expect(page.getByLabel('Number of Qualifiers')).toHaveValue('8');

    await page.getByRole('button', { name: 'Group Stage + Knockout' }).click();
    await expect(page.getByLabel('Number of Groups')).toHaveValue('2');
    await expect(page.getByLabel('Players Advancing Per Group')).toHaveValue('2');
    await expect(page.getByLabel('Knockout Format')).toHaveValue('single-elimination');
  });

  test('Create & Start opens an active tournament', async ({ page }) => {
    await createTournament(page, { name: 'Friday Night', format: 'Single Elimination', players: FOUR });
    await expect(statusBadge(page)).toHaveText('Status: active');
    await expect(matchCards(page)).toHaveCount(3);
  });

  test('Save Draft can be started later', async ({ page }) => {
    await createTournament(page, { name: 'Later', format: 'Single Elimination', players: FOUR, mode: 'draft' });
    await expect(statusBadge(page)).toHaveText('Status: draft');
    await expect(page.getByText('Tournament is in draft mode')).toBeVisible();

    await page.getByRole('button', { name: 'Start Tournament' }).click();
    await expect(statusBadge(page)).toHaveText('Status: active');
  });

  test('saves the current players as a reusable list', async ({ page }) => {
    await addPlayers(page, FOUR);
    await page.getByRole('button', { name: 'Save as List' }).click();
    await page.getByLabel('List Name').fill('Regulars');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Player list saved successfully!')).toBeVisible();

    await page.reload();
    await page.getByRole('combobox').filter({ hasText: 'Load saved list...' }).selectOption({ label: 'Regulars (4 players)' });
    await expect(page.getByTestId('player-name')).toHaveText(FOUR);
  });
});

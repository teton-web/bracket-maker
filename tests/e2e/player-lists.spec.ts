import { expect, test } from '@playwright/test';
import { addPlayers, captureDownload, resetApp } from '../fixtures/test-utils';

const savedList = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('button', { name: new RegExp(name) });

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await page.goto('/players');
});

test.describe('Player lists', () => {
  test('creates, edits and deletes a saved list', async ({ page }) => {
    await expect(page.getByText('No saved lists yet')).toBeVisible();

    await page.getByLabel('List Name').fill('Office League');
    await addPlayers(page, ['Ana', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Save List' }).click();
    await expect(savedList(page, 'Office League')).toContainText('3 players');

    await savedList(page, 'Office League').click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await addPlayers(page, ['Dee']);
    await page.getByRole('button', { name: 'Update List' }).click();
    await expect(savedList(page, 'Office League')).toContainText('4 players');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No saved lists yet')).toBeVisible();
  });

  test('requires a name and at least one player', async ({ page }) => {
    await page.getByRole('button', { name: 'Save List' }).click();
    await expect(page.getByText('Please enter a list name')).toBeVisible();

    await page.getByLabel('List Name').fill('Empty');
    await page.getByRole('button', { name: 'Save List' }).click();
    await expect(page.getByText('Please add at least one player')).toBeVisible();
  });

  test('imports a CSV file and exports it again', async ({ page }) => {
    await page.locator('#import-file-input').setInputFiles({
      name: 'darts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('name\nAna\nBen\nCal\n'),
    });
    await expect(page.getByLabel('List Name')).toHaveValue('darts');
    await expect(page.getByTestId('player-name')).toHaveText(['Ana', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Save List' }).click();

    await savedList(page, 'darts').click();
    const csv = await captureDownload(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
    expect(csv.content.trim().split('\n')).toEqual(['name', 'Ana', 'Ben', 'Cal']);

    const json = await captureDownload(page, () => page.getByRole('button', { name: 'Export JSON' }).click());
    expect(JSON.parse(json.content)).toMatchObject({ name: 'darts', players: ['Ana', 'Ben', 'Cal'] });
  });

  test('rejects unsupported files', async ({ page }) => {
    await page.locator('#import-file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Ana'),
    });
    await expect(page.getByText('Unsupported file format. Please use CSV or JSON.')).toBeVisible();
  });

  test('a saved list can seed a new tournament', async ({ page }) => {
    await page.getByLabel('List Name').fill('Regulars');
    await addPlayers(page, ['Ana', 'Ben']);
    await page.getByRole('button', { name: 'Save List' }).click();

    await page.goto('/tournament/new');
    await page.getByRole('combobox').filter({ hasText: 'Load saved list...' }).selectOption({ label: 'Regulars (2 players)' });
    await expect(page.getByTestId('player-name')).toHaveText(['Ana', 'Ben']);
  });
});

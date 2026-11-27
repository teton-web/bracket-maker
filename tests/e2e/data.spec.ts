import { expect, test } from '@playwright/test';
import {
  STORAGE_KEYS,
  captureDownload,
  createTournament,
  playAllReadyMatches,
  resetApp,
  showListView,
  statusBadge,
  storedTournaments,
} from '../fixtures/test-utils';
import { PLAYERS_4 } from '../fixtures/players';

const FOUR = PLAYERS_4.players.map((p) => p.name);

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Tournament export', () => {
  test('a finished tournament exports as JSON and CSV', async ({ page }) => {
    const id = await createTournament(page, { name: 'Export Me', format: 'Single Elimination', players: FOUR });
    await showListView(page);
    await playAllReadyMatches(page, FOUR);
    await expect(statusBadge(page)).toHaveText('Status: completed');

    const json = await captureDownload(page, () => page.getByRole('button', { name: 'Export JSON' }).click());
    expect(json.filename).toBe(`Export_Me_${id}.json`);
    const data = JSON.parse(json.content);
    expect(data).toMatchObject({ name: 'Export Me', status: 'completed' });
    expect(data.matches).toHaveLength(3);

    const csv = await captureDownload(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
    expect(csv.filename).toBe(`Export_Me_${id}.csv`);
    const lines = csv.content.trim().split('\n');
    expect(lines).toHaveLength(4); // header + 3 matches
    expect(csv.content).toContain('Alice');
  });

  test('the bracket exports as an image', async ({ page }) => {
    await createTournament(page, { name: 'Picture', format: 'Single Elimination', players: FOUR });
    const image = await captureDownload(page, () => page.getByRole('button', { name: 'Export Image' }).click());
    expect(image.filename).toBe('Picture_bracket.png');
  });
});

test.describe('Backup and restore', () => {
  test('a backup can replace or be merged into existing data', async ({ page }) => {
    test.slow();
    await createTournament(page, { name: 'Backed Up', format: 'Single Elimination', players: FOUR });
    await page.goto('/');
    const backup = await captureDownload(page, () => page.getByRole('button', { name: 'Export backup' }).click());
    expect(backup.filename).toMatch(/^bracket-maker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(backup.content).data.tournaments).toHaveLength(1);

    // Replace: a newer tournament disappears, the backed-up one is back
    await createTournament(page, { name: 'After Backup', format: 'Single Elimination', players: FOUR });
    await page.goto('/');
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup.content),
    });
    await expect(page.getByRole('heading', { name: 'Restore Backup' })).toBeVisible();
    await expect(page.getByText('Tournaments:')).toBeVisible();
    await expect(page.getByLabel('Merge with existing data')).toBeChecked();
    await page.getByLabel(/Replace all data/).check();
    await page.getByRole('button', { name: 'Restore Backup' }).click();
    await expect(page.getByRole('link', { name: /Backed Up/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /After Backup/ })).toHaveCount(0);

    // Merge: restoring again into a changed state keeps both
    await createTournament(page, { name: 'Brand New', format: 'Single Elimination', players: FOUR });
    await page.goto('/');
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup.content),
    });
    await page.getByRole('button', { name: 'Restore Backup' }).click();
    await expect(page.getByRole('link', { name: /Brand New/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Backed Up/ })).toBeVisible();
  });

  test('an invalid backup file is rejected', async ({ page }) => {
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"not": "a backup"}'),
    });
    await expect(page.getByText(/Failed to import backup/)).toBeVisible();
  });
});

test.describe('Stored data', () => {
  test('tournaments that fail validation are kept, not erased', async ({ page }) => {
    const unreadable = { id: 'future-1', name: 'From a newer version', format: 'ladder', status: 'active' };
    await page.evaluate(
      ([key, entry]) => localStorage.setItem(key, JSON.stringify([entry])),
      [STORAGE_KEYS.TOURNAMENTS, unreadable] as const
    );
    await page.reload();
    await expect(page.getByText(/1 saved tournament couldn't be loaded/)).toBeVisible();

    // Saving other data must write the unreadable entry back unchanged
    await createTournament(page, { name: 'Fresh', format: 'Single Elimination', players: FOUR });
    const stored = await storedTournaments(page);
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual(unreadable);
  });
});

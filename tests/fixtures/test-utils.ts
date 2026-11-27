/**
 * Shared helpers for the E2E suite. They drive the real UI: the new-tournament
 * form, the list view for scoring, and the bracket view for stage advancement.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export const STORAGE_KEYS = {
  TOURNAMENTS: 'bracket-maker-tournaments',
  PLAYER_LISTS: 'bracket-maker-player-lists',
} as const;

export type Format =
  | 'Single Elimination'
  | 'Double Elimination'
  | 'Round Robin'
  | 'Swiss System'
  | 'Group Stage + Knockout';

/** Start every test from an empty app. */
export async function resetApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function addPlayers(page: Page, names: string[]) {
  const input = page.getByPlaceholder('Enter player name');
  for (const name of names) {
    await input.fill(name);
    await input.press('Enter');
  }
}

export interface CreateOptions {
  name: string;
  format: Format;
  players: string[];
  /** Fill format settings (rounds, groups...) after the format is picked */
  configure?: (page: Page) => Promise<void>;
  /** "start" uses Create & Start, "draft" uses Save Draft */
  mode?: 'start' | 'draft';
}

/** Create a tournament through the new-tournament form and return its id. */
export async function createTournament(page: Page, options: CreateOptions): Promise<string> {
  await page.goto('/tournament/new');
  await page.getByLabel('Tournament Name').fill(options.name);
  await page.getByRole('button', { name: options.format }).click();
  if (options.configure) await options.configure(page);
  await addPlayers(page, options.players);
  await page
    .getByRole('button', { name: options.mode === 'draft' ? 'Save Draft' : 'Create & Start Tournament' })
    .click();
  await page.waitForURL(/\/tournament\/(?!new$)[^/]+$/, { waitUntil: 'commit' });
  // The first visit to a tournament page can wait on a dev-server compile
  await expect(page.getByRole('heading', { level: 1, name: options.name })).toBeVisible({ timeout: 15_000 });
  return page.url().split('/').pop()!;
}

export function statusBadge(page: Page): Locator {
  return page.getByText(/^Status: /);
}

export function matchCards(page: Page): Locator {
  return page.getByTestId('match-card');
}

/** Match cards waiting for a score (both players known, no result yet). */
export function readyMatches(page: Page): Locator {
  return page.locator('[data-testid="match-card"][data-status="ready"]');
}

/** The match card that contains both players. */
export function matchBetween(page: Page, a: string, b: string): Locator {
  return matchCards(page).filter({ hasText: a }).filter({ hasText: b });
}

export async function showListView(page: Page) {
  await page.getByRole('button', { name: 'List View' }).click();
  await expect(page.getByTestId('match-list')).toBeVisible();
}

export async function showBracketView(page: Page) {
  await page.getByRole('button', { name: 'Bracket View' }).click();
  await expect(page.getByTestId('bracket-container')).toBeVisible();
}

/** Fill the open score dialog by player name and save it. */
export async function enterScores(page: Page, scores: Record<string, number>) {
  const dialog = page.getByRole('heading', { name: 'Enter Match Score' });
  await expect(dialog).toBeVisible();
  for (const [player, score] of Object.entries(scores)) {
    await page.getByLabel(player, { exact: true }).fill(String(score));
  }
  await page.getByRole('button', { name: 'Save Score' }).click();
  await expect(dialog).toBeHidden();
}

/** Score the pending match between `winner` and `loser` (list view). */
export async function playMatch(page: Page, winner: string, loser: string, winnerScore = 3, loserScore = 1) {
  await matchBetween(page, winner, loser).and(readyMatches(page)).click();
  await enterScores(page, { [winner]: winnerScore, [loser]: loserScore });
}

/** Names from `roster` that appear on a match card, in card order. */
export async function playersOnCard(card: Locator, roster: string[]): Promise<string[]> {
  const text = (await card.textContent()) ?? '';
  return roster
    .filter((name) => text.includes(name))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
}

/** Lower index in the roster = higher seed. */
export const favoriteWins = (roster: string[]) => (a: string, b: string) =>
  roster.indexOf(a) < roster.indexOf(b) ? a : b;

/**
 * Play every ready match in the list view until none are left.
 * `pickWinner` receives the two names on the card and returns the winner.
 */
export async function playAllReadyMatches(
  page: Page,
  roster: string[],
  pickWinner: (a: string, b: string) => string = favoriteWins(roster)
) {
  for (let played = 0; played < 100; played++) {
    if ((await readyMatches(page).count()) === 0) return;
    const [a, b] = await playersOnCard(readyMatches(page).first(), roster);
    const winner = pickWinner(a, b);
    await playMatch(page, winner, winner === a ? b : a);
  }
  throw new Error('playAllReadyMatches: too many matches');
}

/** Tournaments as stored by the app (for checks the UI doesn't expose directly). */
export async function storedTournaments(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), STORAGE_KEYS.TOURNAMENTS);
}

/** Capture a file the page offers for download. */
export async function captureDownload(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const path = await download.path();
  return { filename: download.suggestedFilename(), content: path ? await readFile(path, 'utf8') : '' };
}

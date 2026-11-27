import { expect, test, type Page } from '@playwright/test';
import {
  createTournament,
  matchBetween,
  matchCards,
  playAllReadyMatches,
  readyMatches,
  resetApp,
  showBracketView,
  showListView,
  statusBadge,
} from '../fixtures/test-utils';
import { PLAYERS_4, PLAYERS_8 } from '../fixtures/players';

const FOUR = PLAYERS_4.players.map((p) => p.name);
const EIGHT = PLAYERS_8.players.map((p) => p.name);

const inBracket = (page: Page, bracket: string) =>
  page.locator(`[data-testid="match-card"][data-bracket="${bracket}"]`);

async function advance(page: Page, label: string | RegExp) {
  await showBracketView(page);
  await page.getByRole('button', { name: label }).click();
  await showListView(page);
}

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Round robin', () => {
  test('schedules every pairing once and finishes when all are played', async ({ page }) => {
    await createTournament(page, { name: 'League', format: 'Round Robin', players: FOUR });
    await showListView(page);
    await expect(page.getByRole('heading', { name: 'Round Robin' })).toBeVisible();
    await expect(inBracket(page, 'round-robin')).toHaveCount(6);
    for (let i = 0; i < FOUR.length; i++) {
      for (let j = i + 1; j < FOUR.length; j++) {
        await expect(matchBetween(page, FOUR[i], FOUR[j])).toHaveCount(1);
      }
    }

    await playAllReadyMatches(page, FOUR);
    await expect(statusBadge(page)).toHaveText('Status: completed');
    await expect(page.getByTestId('winner-celebration')).toContainText('Alice');
  });
});

test.describe('Swiss', () => {
  test('fixed rounds: generates each round and completes after the last one', async ({ page }) => {
    await createTournament(page, {
      name: 'Swiss Fixed',
      format: 'Swiss System',
      players: FOUR,
      configure: (p) => p.getByLabel('Number of Rounds').fill('2'),
    });
    await showListView(page);
    await expect(inBracket(page, 'swiss')).toHaveCount(2);
    // Round 1 pairs by seed: 1 v 4, 2 v 3
    await expect(matchBetween(page, 'Alice', 'Diana')).toHaveCount(1);
    await expect(matchBetween(page, 'Bob', 'Charlie')).toHaveCount(1);

    await playAllReadyMatches(page, FOUR);
    await expect(statusBadge(page)).toHaveText('Status: active');
    await advance(page, 'Generate Round 2');

    // Round 2 pairs the two winners and the two losers
    await expect(matchBetween(page, 'Alice', 'Bob').and(readyMatches(page))).toHaveCount(1);
    await expect(matchBetween(page, 'Charlie', 'Diana').and(readyMatches(page))).toHaveCount(1);
    await playAllReadyMatches(page, FOUR);
    await expect(statusBadge(page)).toHaveText('Status: completed');
  });

  test('qualification mode: plays until enough players qualify, then a knockout', async ({ page }) => {
    test.slow();
    await createTournament(page, {
      name: 'Swiss Qualifier',
      format: 'Swiss System',
      players: EIGHT,
      configure: async (p) => {
        await p.getByRole('button', { name: 'Qualification Mode' }).click();
        await p.getByLabel('Wins to Qualify').fill('2');
        await p.getByLabel('Number of Qualifiers').selectOption('4');
      },
    });
    await showListView(page);

    await playAllReadyMatches(page, EIGHT); // round 1
    await advance(page, 'Generate Round 2');
    await playAllReadyMatches(page, EIGHT); // two players reach 2 wins
    await advance(page, 'Generate Round 3');
    await playAllReadyMatches(page, EIGHT); // two more qualify

    await advance(page, 'Advance to Knockout');
    await expect(inBracket(page, 'winners')).toHaveCount(3);
    await playAllReadyMatches(page, EIGHT);
    await expect(statusBadge(page)).toHaveText('Status: completed');
  });
});

test.describe('Group stage + knockout', () => {
  test('plays groups, then a knockout that keeps group-mates apart', async ({ page }) => {
    test.slow();
    await createTournament(page, { name: 'Cup', format: 'Group Stage + Knockout', players: EIGHT });
    await showListView(page);
    await expect(page.getByRole('heading', { name: 'Group Stage' })).toBeVisible();
    // Two groups of four, everyone plays everyone in their group
    await expect(inBracket(page, 'group')).toHaveCount(12);

    await playAllReadyMatches(page, EIGHT);
    await expect(statusBadge(page)).toHaveText('Status: active');
    await advance(page, 'Advance to Knockout');

    // Snake draft: group 1 = Alice, Diana, Eve, Henry; group 2 = Bob, Charlie, Frank, Grace.
    // Group winners meet the other group's runner-up.
    await expect(matchBetween(page, 'Alice', 'Charlie').and(inBracket(page, 'winners'))).toHaveCount(1);
    await expect(matchBetween(page, 'Bob', 'Diana').and(inBracket(page, 'winners'))).toHaveCount(1);

    await playAllReadyMatches(page, EIGHT);
    await expect(statusBadge(page)).toHaveText('Status: completed');
    await expect(matchCards(page).first()).toBeVisible();
  });
});

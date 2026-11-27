import { expect, test } from '@playwright/test';
import {
  createTournament,
  enterScores,
  matchBetween,
  matchCards,
  playAllReadyMatches,
  playMatch,
  resetApp,
  showListView,
  statusBadge,
} from '../fixtures/test-utils';
import { PLAYERS_4, PLAYERS_8, PLAYERS_ODD } from '../fixtures/players';

const names = (list: { players: { name: string }[] }) => list.players.map((p) => p.name);
const FOUR = names(PLAYERS_4);
const FIVE = names(PLAYERS_ODD);
const EIGHT = names(PLAYERS_8);

const round = (page: import('@playwright/test').Page, bracket: string, r: number) =>
  page.locator(`[data-testid="match-card"][data-bracket="${bracket}"][data-round="${r}"]`);

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Single elimination', () => {
  test('seeds round 1 so the top seeds meet last (1v8, 4v5, 2v7, 3v6)', async ({ page }) => {
    await createTournament(page, { name: 'Eight', format: 'Single Elimination', players: EIGHT });
    await showListView(page);
    const firstRound = round(page, 'winners', 1);
    await expect(firstRound).toHaveCount(4);
    await expect(firstRound.nth(0)).toContainText('Alice');
    await expect(firstRound.nth(0)).toContainText('Henry');
    await expect(firstRound.nth(1)).toContainText('Diana');
    await expect(firstRound.nth(1)).toContainText('Eve');
    await expect(firstRound.nth(2)).toContainText('Bob');
    await expect(firstRound.nth(2)).toContainText('Grace');
    await expect(firstRound.nth(3)).toContainText('Charlie');
    await expect(firstRound.nth(3)).toContainText('Frank');
  });

  test('gives byes to the top seeds and advances them automatically', async ({ page }) => {
    await createTournament(page, { name: 'Five', format: 'Single Elimination', players: FIVE });
    await showListView(page);
    const byes = page.locator('[data-testid="match-card"][data-status="bye"]');
    await expect(byes).toHaveCount(3);
    for (const seeded of ['Alice', 'Bob', 'Charlie']) {
      await expect(byes.filter({ hasText: seeded })).toHaveCount(1);
    }
    // Only Diana v Eve is playable in round 1; Bob v Charlie is already set in round 2
    await expect(matchBetween(page, 'Diana', 'Eve')).toHaveAttribute('data-status', 'ready');
    await expect(matchBetween(page, 'Bob', 'Charlie')).toHaveAttribute('data-status', 'ready');
  });

  test('plays to a champion with any player count', async ({ page }) => {
    await createTournament(page, { name: 'Five Final', format: 'Single Elimination', players: FIVE });
    await showListView(page);
    await playAllReadyMatches(page, FIVE);
    await expect(statusBadge(page)).toHaveText('Status: completed');
    await expect(page.getByTestId('winner-celebration')).toContainText('Alice');
  });
});

test.describe('Double elimination', () => {
  test('builds winners, losers and grand final brackets for 4 players', async ({ page }) => {
    await createTournament(page, { name: 'DE Four', format: 'Double Elimination', players: FOUR });
    await showListView(page);
    await expect(page.locator('[data-bracket="winners"]')).toHaveCount(3);
    await expect(page.locator('[data-bracket="losers"]')).toHaveCount(2);
    await expect(page.locator('[data-bracket="grand-finals"]')).toHaveCount(2);
  });

  test('stays active after the first match', async ({ page }) => {
    await createTournament(page, { name: 'Still Going', format: 'Double Elimination', players: FOUR });
    await showListView(page);
    await playMatch(page, 'Alice', 'Diana');
    await expect(statusBadge(page)).toHaveText('Status: active');
    await expect(page.getByTestId('winner-celebration')).toHaveCount(0);
  });

  test('drops the loser into the losers bracket', async ({ page }) => {
    await createTournament(page, { name: 'Drop', format: 'Double Elimination', players: FOUR });
    await showListView(page);
    await playMatch(page, 'Alice', 'Diana');
    await expect(round(page, 'losers', 1)).toContainText('Diana');
  });

  test('a player dropping from round 2 faces the other half of the bracket', async ({ page }) => {
    await createTournament(page, { name: 'Crossover', format: 'Double Elimination', players: EIGHT });
    await showListView(page);
    // Round 1 (favourites win): Alice, Diana, Bob, Charlie advance; Henry, Eve, Grace, Frank drop
    await playMatch(page, 'Alice', 'Henry');
    await playMatch(page, 'Diana', 'Eve');
    await playMatch(page, 'Bob', 'Grace');
    await playMatch(page, 'Charlie', 'Frank');
    // Losers round 1: Eve beats Henry (top half), Frank beats Grace (bottom half)
    await playMatch(page, 'Eve', 'Henry');
    await playMatch(page, 'Frank', 'Grace');
    // Diana loses in the top half of round 2 and must meet Frank from the bottom half, not Eve
    await playMatch(page, 'Alice', 'Diana');
    await expect(matchBetween(page, 'Diana', 'Frank')).toHaveAttribute('data-bracket', 'losers');
    // (Diana and Eve already met in winners round 1; they must not meet again straight away)
    await expect(matchBetween(page, 'Diana', 'Eve').and(page.locator('[data-bracket="losers"]'))).toHaveCount(0);
  });

  test('a losers-bracket champion who wins the grand final forces a reset match', async ({ page }) => {
    await createTournament(page, { name: 'Reset', format: 'Double Elimination', players: FOUR });
    await showListView(page);
    await playMatch(page, 'Alice', 'Diana');
    await playMatch(page, 'Bob', 'Charlie');
    await playMatch(page, 'Alice', 'Bob'); // winners final
    await playMatch(page, 'Charlie', 'Diana'); // losers round 1
    await playMatch(page, 'Bob', 'Charlie'); // losers final
    await playMatch(page, 'Bob', 'Alice'); // grand final: losers champion wins

    await expect(statusBadge(page)).toHaveText('Status: active');
    const reset = round(page, 'grand-finals', 2);
    await expect(reset).toContainText('Alice');
    await expect(reset).toContainText('Bob');

    await playMatch(page, 'Bob', 'Alice');
    await expect(statusBadge(page)).toHaveText('Status: completed');
    await expect(page.getByTestId('winner-celebration')).toContainText('Bob');
  });

  test('the winners-bracket champion only needs to win the grand final once', async ({ page }) => {
    await createTournament(page, { name: 'No Reset', format: 'Double Elimination', players: FOUR });
    await showListView(page);
    await playAllReadyMatches(page, FOUR);
    await expect(statusBadge(page)).toHaveText('Status: completed');
    await expect(page.getByTestId('winner-celebration')).toContainText('Alice');
    // Bracket view after completion shows every played match
    await expect(matchCards(page).first()).toBeVisible();
  });

  test('finishes with a non power-of-two field', async ({ page }) => {
    await createTournament(page, { name: 'DE Five', format: 'Double Elimination', players: FIVE });
    await showListView(page);
    await playAllReadyMatches(page, FIVE, (a, b) => (FIVE.indexOf(a) > FIVE.indexOf(b) ? a : b)); // upsets
    await expect(statusBadge(page)).toHaveText('Status: completed');
  });

  test('bracket view renders losers rounds side-by-side without overlapping cards and waits for reset before champion', async ({ page }) => {
    await createTournament(page, { name: 'DE Visual', format: 'Double Elimination', players: FOUR });

    // Stay in Bracket View (React Flow) and verify every match card has non-overlapping bounds
    const cards = page.locator('[data-testid="match-card"]');
    await expect(cards).toHaveCount(7);

    const boxes = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-match-id'),
          bracket: el.getAttribute('data-bracket'),
          round: Number(el.getAttribute('data-round')),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      })
    );

    // Losers R2 must sit strictly to the right of Losers R1 (not stacked on top of it)
    const l1 = boxes.find((b) => b.bracket === 'losers' && b.round === 1)!;
    const l2 = boxes.find((b) => b.bracket === 'losers' && b.round === 2)!;
    expect(l2.x).toBeGreaterThanOrEqual(l1.x + l1.w - 1);

    // No two cards overlap
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapsX = a.x < b.x + b.w - 1 && a.x + a.w - 1 > b.x;
        const overlapsY = a.y < b.y + b.h - 1 && a.y + a.h - 1 > b.y;
        expect(overlapsX && overlapsY, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }

    // Play through GF1 upset via list view then switch back to bracket view to verify no premature champion
    await showListView(page);
    await playMatch(page, 'Alice', 'Diana');
    await playMatch(page, 'Bob', 'Charlie');
    await playMatch(page, 'Alice', 'Bob');
    await playMatch(page, 'Charlie', 'Diana');
    await playMatch(page, 'Bob', 'Charlie');
    await playMatch(page, 'Bob', 'Alice'); // GF1 upset -> reset required

    await page.getByRole('button', { name: 'Bracket View' }).click();
    await expect(page.getByTestId('bracket-container')).toBeVisible();
    await expect(page.locator('[data-id="champion"]')).toHaveCount(0);
    await expect(round(page, 'grand-finals', 2)).toContainText('R2 · Reset');

    // Completing the reset match directly from Bracket View crowns the champion
    await round(page, 'grand-finals', 2).click();
    await enterScores(page, { Alice: 1, Bob: 3 });
    await expect(statusBadge(page)).toHaveText('Status: completed');
    await expect(page.locator('[data-id="champion"]')).toContainText('Bob');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  calculateNextPowerOf2,
  forceMatchWinner,
  generateDoubleEliminationBracket,
  generateGroupKnockoutBracket,
  generateKnockoutFromGroups,
  generateSingleEliminationBracket,
  getBracketSeedOrder,
  isTournamentComplete,
  resetDownstreamMatches,
  updateMatchResult,
} from '@/lib/bracket';
import type { Match, Player, Tournament, TournamentFormat } from '@/types/tournament';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePlayers = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, seed: i + 1 }));

const seedOf = (id: string) => Number(id.slice(1));

const makeTournament = (format: TournamentFormat, players: Player[], matches: Match[]): Tournament => ({
  id: 't1',
  name: 'Test',
  format,
  status: 'active',
  players,
  matches,
  createdAt: new Date(),
  completedAt: null,
});

// Small deterministic PRNG so "random" results are reproducible
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Picker = (m: Match) => string;
const favoritesWin: Picker = (m) => (seedOf(m.player1Id!) < seedOf(m.player2Id!) ? m.player1Id! : m.player2Id!);
const underdogsWin: Picker = (m) => (seedOf(m.player1Id!) > seedOf(m.player2Id!) ? m.player1Id! : m.player2Id!);
const randomWinner = (seed: number): Picker => {
  const rand = mulberry32(seed);
  return (m) => (rand() < 0.5 ? m.player1Id! : m.player2Id!);
};

const isPlayable = (m: Match) => !!m.player1Id && !!m.player2Id && !m.winnerId;
const isDead = (m: Match) => m.isBye && !m.winnerId;

function decide(matches: Match[], match: Match, winnerId: string, viaForfeit: boolean): Match[] {
  if (viaForfeit) return forceMatchWinner(matches, match.id, winnerId, true);
  const p1Wins = winnerId === match.player1Id;
  return updateMatchResult(matches, match.id, p1Wins ? 3 : 1, p1Wins ? 1 : 3);
}

/** Structural checks that must hold at every step of a tournament. */
function assertConsistent(matches: Match[]) {
  const busy = new Map<string, string>();
  for (const m of matches) {
    if (m.player1Id && m.player1Id === m.player2Id) {
      throw new Error(`${m.id} has the same player in both slots`);
    }
    if (m.winnerId && m.winnerId !== m.player1Id && m.winnerId !== m.player2Id) {
      throw new Error(`${m.id} winner is not one of its players`);
    }
    // Nobody can be waiting on two undecided matches at once
    if (!m.winnerId && !isDead(m)) {
      for (const id of [m.player1Id, m.player2Id]) {
        if (!id) continue;
        if (busy.has(id)) throw new Error(`${id} is in both ${busy.get(id)} and ${m.id}`);
        busy.set(id, m.id);
      }
    }
  }
}

/** Play every available match until none remain, checking invariants along the way. */
function playOut(
  format: TournamentFormat,
  players: Player[],
  matches: Match[],
  pick: Picker,
  viaForfeit = false
): Match[] {
  for (let guard = 0; guard < 2000; guard++) {
    assertConsistent(matches);
    const next = matches.find(isPlayable);
    if (!next) return matches;
    expect(isTournamentComplete(makeTournament(format, players, matches), matches)).toBe(false);
    matches = decide(matches, next, pick(next), viaForfeit);
  }
  throw new Error('tournament did not finish');
}

function lossesByPlayer(matches: Match[]): Map<string, number> {
  const losses = new Map<string, number>();
  for (const m of matches) {
    if (!m.winnerId || m.isBye || !m.player1Id || !m.player2Id) continue;
    const loser = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }
  return losses;
}

function assertFinished(format: TournamentFormat, players: Player[], matches: Match[]) {
  expect(isTournamentComplete(makeTournament(format, players, matches), matches)).toBe(true);

  // Every match was either decided or could never be reached
  const unfinished = matches.filter(
    (m) => !m.winnerId && !isDead(m) && !(m.bracket === 'grand-finals' && m.round === 2 && !m.player1Id)
  );
  expect(unfinished.map((m) => m.id)).toEqual([]);

  const losses = lossesByPlayer(matches);
  const played = matches.filter((m) => m.winnerId && !m.isBye).length;
  const n = players.length;

  if (format === 'single-elimination') {
    expect(played).toBe(n - 1);
    const unbeaten = players.filter((p) => !losses.has(p.id));
    expect(unbeaten).toHaveLength(1);
    for (const p of players) expect(losses.get(p.id) ?? 0).toBeLessThanOrEqual(1);
  } else {
    expect([2 * n - 2, 2 * n - 1]).toContain(played);
    const eliminated = players.filter((p) => (losses.get(p.id) ?? 0) === 2);
    expect(eliminated).toHaveLength(n - 1);
    for (const p of players) expect(losses.get(p.id) ?? 0).toBeLessThanOrEqual(2);
  }
}

const COUNTS = Array.from({ length: 32 }, (_, i) => i + 2); // 2..33 players
const PICKERS: [string, Picker][] = [
  ['favorites win', favoritesWin],
  ['underdogs win', underdogsWin],
  ['random results', randomWinner(42)],
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

describe('seeding', () => {
  test('standard seed order keeps the top seeds apart', () => {
    expect(getBracketSeedOrder(2)).toEqual([1, 2]);
    expect(getBracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(getBracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  test('8 players: round 1 is 1v8, 4v5, 2v7, 3v6', () => {
    const round1 = generateSingleEliminationBracket(makePlayers(8)).filter((m) => m.round === 1);
    expect(round1.map((m) => `${m.player1Id}-${m.player2Id}`)).toEqual(['p1-p8', 'p4-p5', 'p2-p7', 'p3-p6']);
  });

  test('byes go to the top seeds and nobody faces an empty match', () => {
    const round1 = generateSingleEliminationBracket(makePlayers(6)).filter((m) => m.round === 1);
    const byes = round1.filter((m) => m.isBye).map((m) => m.winnerId);
    expect(byes.sort()).toEqual(['p1', 'p2']);
    expect(round1.every((m) => m.player1Id || m.player2Id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full play-throughs for every player count
// ---------------------------------------------------------------------------

for (const format of ['single-elimination', 'double-elimination'] as const) {
  const generate = format === 'single-elimination' ? generateSingleEliminationBracket : generateDoubleEliminationBracket;

  describe(`${format} play-through`, () => {
    for (const [label, pick] of PICKERS) {
      test(`2-33 players finish cleanly (${label})`, () => {
        for (const n of COUNTS) {
          const players = makePlayers(n);
          const matches = playOut(format, players, generate(players), pick);
          assertFinished(format, players, matches);
        }
      });
    }

    test('2-33 players finish cleanly when every match is a forfeit', () => {
      for (const n of COUNTS) {
        const players = makePlayers(n);
        const matches = playOut(format, players, generate(players), randomWinner(n), true);
        assertFinished(format, players, matches);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Losers-bracket crossover
// ---------------------------------------------------------------------------

describe('losers bracket drop-downs', () => {
  test('a dropped player never rematches someone in their first losers match', () => {
    for (const n of COUNTS) {
      const players = makePlayers(n);
      const bracketSize = calculateNextPowerOf2(n);
      for (const [, pick] of PICKERS) {
        let matches = generateDoubleEliminationBracket(players);
        const played = new Set<string>();
        const key = (a: string, b: string) => [a, b].sort().join('|');

        for (;;) {
          const next = matches.find(isPlayable);
          if (!next) break;

          // Even losers rounds are where winners-bracket losers drop in (as player 2).
          // The rematch can't be avoided when that winners round has a single match.
          const winnersRound = next.round / 2 + 1;
          const winnersMatchesInRound = bracketSize / 2 ** winnersRound;
          if (next.bracket === 'losers' && next.round % 2 === 0 && winnersMatchesInRound > 1) {
            if (played.has(key(next.player1Id!, next.player2Id!))) {
              throw new Error(`${n} players: rematch ${next.player1Id} v ${next.player2Id} in ${next.id}`);
            }
          }

          played.add(key(next.player1Id!, next.player2Id!));
          matches = decide(matches, next, pick(next), false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

describe('completion', () => {
  test('double elimination is not complete after its first match', () => {
    const players = makePlayers(4);
    const start = generateDoubleEliminationBracket(players);
    const first = start.find(isPlayable)!;
    const after = decide(start, first, first.player1Id!, false);
    expect(isTournamentComplete(makeTournament('double-elimination', players, after), after)).toBe(false);
  });

  test('grand final won by the losers-bracket champion needs the reset match', () => {
    const players = makePlayers(4);
    let matches = generateDoubleEliminationBracket(players);
    // Play until only the grand final is left
    for (;;) {
      const next = matches.find((m) => isPlayable(m) && m.bracket !== 'grand-finals');
      if (!next) break;
      matches = decide(matches, next, favoritesWin(next), false);
    }
    const grandFinal = matches.find((m) => m.id === 'grand-finals-1')!;
    matches = decide(matches, grandFinal, grandFinal.player2Id!, false);
    const t = makeTournament('double-elimination', players, matches);
    expect(isTournamentComplete(t, matches)).toBe(false);

    const reset = matches.find((m) => m.id === 'grand-finals-2')!;
    expect([reset.player1Id, reset.player2Id]).toEqual([grandFinal.player1Id, grandFinal.player2Id]);
    matches = decide(matches, reset, reset.player2Id!, false);
    expect(isTournamentComplete(t, matches)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Forfeits and edits
// ---------------------------------------------------------------------------

describe('forfeits', () => {
  test('a forfeit in losers round 1 goes to the losers-bracket slot, not the drop-down slot', () => {
    let matches = generateDoubleEliminationBracket(makePlayers(8));
    for (const m of matches.filter((x) => x.bracket === 'winners' && x.round === 1)) {
      matches = decide(matches, m, m.player1Id!, false);
    }
    const losersMatch = matches.find((m) => m.bracket === 'losers' && m.round === 1 && m.position === 2)!;
    matches = forceMatchWinner(matches, losersMatch.id, losersMatch.player1Id!, true);
    const next = matches.find((m) => m.id === losersMatch.nextMatchId)!;
    expect(next.player1Id).toBe(losersMatch.player1Id);
    expect(next.player2Id).toBeNull();
  });
});

describe('re-scoring', () => {
  for (const format of ['single-elimination', 'double-elimination'] as const) {
    const generate = format === 'single-elimination' ? generateSingleEliminationBracket : generateDoubleEliminationBracket;

    test(`${format}: flipping an early result mid-tournament still finishes cleanly`, () => {
      for (const n of [5, 6, 8, 11, 16]) {
        const players = makePlayers(n);
        let matches = generate(players);
        const rand = randomWinner(n * 7);

        // Play roughly half the tournament
        const half = Math.floor(matches.filter((m) => !m.isBye).length / 2);
        for (let i = 0; i < half; i++) {
          const next = matches.find(isPlayable);
          if (!next) break;
          matches = decide(matches, next, rand(next), false);
        }

        // Flip the first decided round-1 match that wasn't a bye
        const target = matches.find((m) => m.bracket === 'winners' && m.round === 1 && m.winnerId && !m.isBye)!;
        const flipped = target.winnerId === target.player1Id ? target.player2Id! : target.player1Id!;
        matches = resetDownstreamMatches(matches, target.id);
        assertConsistent(matches);
        const refreshed = matches.find((m) => m.id === target.id)!;
        matches = decide(matches, refreshed, flipped, false);

        matches = playOut(format, players, matches, rand);
        assertFinished(format, players, matches);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Group stage -> knockout
// ---------------------------------------------------------------------------

describe('group knockout', () => {
  test('first knockout round never pairs two players from the same group', () => {
    const players = makePlayers(8);
    let groupMatches = generateGroupKnockoutBracket(players, { groupCount: 2, advancePerGroup: 2 });
    for (const m of [...groupMatches]) {
      const current = groupMatches.find((x) => x.id === m.id)!;
      groupMatches = decide(groupMatches, current, favoritesWin(current), false);
    }
    const groupOf = new Map<string, string>();
    for (const m of groupMatches) {
      groupOf.set(m.player1Id!, m.groupId!);
      groupOf.set(m.player2Id!, m.groupId!);
    }

    const knockout = generateKnockoutFromGroups(players, groupMatches, { advancePerGroup: 2 });
    for (const m of knockout.filter((x) => x.round === 1 && x.player1Id && x.player2Id)) {
      expect(groupOf.get(m.player1Id!)).not.toBe(groupOf.get(m.player2Id!));
    }
  });
});

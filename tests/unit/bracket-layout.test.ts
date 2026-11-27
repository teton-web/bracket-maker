import { describe, expect, test } from 'bun:test';
import {
  generateDoubleEliminationBracket,
  generateGroupKnockoutBracket,
  generateKnockoutFromGroups,
  getDoubleEliminationFinalMatch,
  updateMatchResult,
} from '@/lib/bracket';
import {
  layoutDoubleElimination,
  layoutGroupKnockout,
  MATCH_NODE_HEIGHT,
  MATCH_NODE_WIDTH,
  type BracketNode,
} from '@/lib/bracket-layout';
import type { Match, Player } from '@/types/tournament';

const makePlayers = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, seed: i + 1 }));

const isPlayable = (m: Match) => !!m.player1Id && !!m.player2Id && !m.winnerId;

function assertNoOverlappingNodes(nodes: BracketNode[], label: string) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const aw = a.type === 'championNode' ? 280 : a.type === 'groupNode' ? 320 : MATCH_NODE_WIDTH;
      const ah = a.type === 'championNode' ? 160 : a.type === 'groupNode' ? 280 : MATCH_NODE_HEIGHT;
      const bw = b.type === 'championNode' ? 280 : b.type === 'groupNode' ? 320 : MATCH_NODE_WIDTH;
      const bh = b.type === 'championNode' ? 160 : b.type === 'groupNode' ? 280 : MATCH_NODE_HEIGHT;

      const overlapsX = a.position.x < b.position.x + bw && a.position.x + aw > b.position.x;
      const overlapsY = a.position.y < b.position.y + bh && a.position.y + ah > b.position.y;
      if (overlapsX && overlapsY) {
        throw new Error(
          `${label}: nodes ${a.id} (${a.position.x},${a.position.y}) and ${b.id} (${b.position.x},${b.position.y}) overlap`
        );
      }
    }
  }
}

describe('double elimination layout', () => {
  test('never overlaps match nodes for 2 to 16 players', () => {
    for (let n = 2; n <= 16; n++) {
      const players = makePlayers(n);
      const matches = generateDoubleEliminationBracket(players);
      const { nodes } = layoutDoubleElimination(matches, players, null, {});
      assertNoOverlappingNodes(nodes, `${n} players initial`);
    }
  });

  test('places each losers bracket round in its own strictly increasing x column', () => {
    const players = makePlayers(8);
    const matches = generateDoubleEliminationBracket(players);
    const { nodes } = layoutDoubleElimination(matches, players, null, {});

    const xByLosersRound = new Map<number, number>();
    for (const node of nodes) {
      const m = node.data.match;
      if (!m || m.bracket !== 'losers') continue;
      if (xByLosersRound.has(m.round)) {
        expect(node.position.x).toBe(xByLosersRound.get(m.round));
      } else {
        xByLosersRound.set(m.round, node.position.x);
      }
    }

    const rounds = [...xByLosersRound.keys()].sort((a, b) => a - b);
    expect(rounds).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < rounds.length; i++) {
      expect(xByLosersRound.get(rounds[i])!).toBeGreaterThan(xByLosersRound.get(rounds[i - 1])!);
    }
  });

  test('draws structural bracket edges immediately and never draws loser-drop edges on byes', () => {
    const players = makePlayers(5);
    const matches = generateDoubleEliminationBracket(players);
    const { edges } = layoutDoubleElimination(matches, players, null, {});

    // Structural winner-path edges exist before any match is scored
    expect(edges.length).toBeGreaterThan(0);
    // Byes produce no loser, so there must be zero loser-drop edges at start
    const loserEdges = edges.filter((e) => e.data?.isLoserPath);
    expect(loserEdges).toHaveLength(0);
  });

  test('omits unused grand-finals-2 and attaches Champion to grand-finals-1 when winners champ wins outright', () => {
    const players = makePlayers(4);
    let matches = generateDoubleEliminationBracket(players);
    for (;;) {
      const next = matches.find(isPlayable);
      if (!next) break;
      matches = updateMatchResult(matches, next.id, 3, 1); // player1 always wins
    }

    const finalMatch = getDoubleEliminationFinalMatch(matches);
    expect(finalMatch?.id).toBe('grand-finals-1');
    const champion = players.find((p) => p.id === finalMatch?.winnerId)!;

    const { nodes, edges } = layoutDoubleElimination(matches, players, champion, {});
    assertNoOverlappingNodes(nodes, '4 players outright win');
    expect(nodes.find((n) => n.id === 'grand-finals-2')).toBeUndefined();
    expect(edges.find((e) => e.source === 'grand-finals-1' && e.target === 'champion')).toBeDefined();
  });

  test('does not declare a final match before bracket reset and attaches Champion to grand-finals-2 after reset', () => {
    const players = makePlayers(4);
    let matches = generateDoubleEliminationBracket(players);
    for (;;) {
      const next = matches.find((m) => isPlayable(m) && m.bracket !== 'grand-finals');
      if (!next) break;
      matches = updateMatchResult(matches, next.id, 3, 1);
    }

    // Losers-bracket champion (player2) wins GF1 -> bracket reset required
    matches = updateMatchResult(matches, 'grand-finals-1', 1, 3);
    expect(getDoubleEliminationFinalMatch(matches)).toBeNull();

    const midLayout = layoutDoubleElimination(matches, players, null, {});
    assertNoOverlappingNodes(midLayout.nodes, '4 players pending reset');
    expect(midLayout.nodes.find((n) => n.id === 'grand-finals-2')).toBeDefined();
    expect(midLayout.nodes.find((n) => n.id === 'champion')).toBeUndefined();
    expect(midLayout.edges.find((e) => e.source === 'grand-finals-1' && e.target === 'grand-finals-2')?.data?.isWinnerPath).toBe(true);

    // Complete GF2 reset
    matches = updateMatchResult(matches, 'grand-finals-2', 1, 3);
    const finalMatch = getDoubleEliminationFinalMatch(matches);
    expect(finalMatch?.id).toBe('grand-finals-2');
    const champion = players.find((p) => p.id === finalMatch?.winnerId)!;

    const endLayout = layoutDoubleElimination(matches, players, champion, {});
    assertNoOverlappingNodes(endLayout.nodes, '4 players after reset');
    expect(endLayout.edges.find((e) => e.source === 'grand-finals-2' && e.target === 'champion')).toBeDefined();
  });

  test('layoutGroupKnockout preserves double-elimination knockout without overlaps', () => {
    const players = makePlayers(8);
    let groupMatches = generateGroupKnockoutBracket(players, {
      groupCount: 2,
      advancePerGroup: 2,
      knockoutFormat: 'double-elimination',
    });
    for (const m of [...groupMatches]) {
      groupMatches = updateMatchResult(groupMatches, m.id, 3, 1);
    }
    const knockoutMatches = generateKnockoutFromGroups(players, groupMatches, {
      groupCount: 2,
      advancePerGroup: 2,
      knockoutFormat: 'double-elimination',
    });

    const { nodes } = layoutGroupKnockout(
      [...groupMatches, ...knockoutMatches],
      players,
      { groupCount: 2, advancePerGroup: 2, knockoutFormat: 'double-elimination' },
      true,
      null,
      {}
    );

    expect(nodes.some((n) => n.data.match?.bracket === 'losers')).toBe(true);
    expect(nodes.some((n) => n.data.match?.bracket === 'grand-finals')).toBe(true);
    assertNoOverlappingNodes(nodes, 'group-knockout DE');
  });
});

import type { Player, Match, Tournament, TournamentFormat, TournamentFormatConfig } from '@/types/tournament';
import { isRoundComplete } from '@/lib/standings';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function calculateNextPowerOf2(n: number): number {
  if (n <= 1) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function seedPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.seed - b.seed);
}

export function getMatchById(matches: Match[], matchId: string): Match | null {
  return matches.find((m) => m.id === matchId) || null;
}

/**
 * Standard bracket seed order for a bracket of `size` slots, e.g. size 8 gives
 * [1, 8, 4, 5, 2, 7, 3, 6]: 1 plays 8, 4 plays 5, and seeds 1 and 2 can only meet
 * in the final. Pairs are read two at a time to build round 1.
 */
export function getBracketSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const nextSize = order.length * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return order;
}

function cloneMatches(matches: Match[]): Match[] {
  return matches.map((m) => ({ ...m }));
}

const ELIMINATION_BRACKETS = new Set<Match['bracket']>(['winners', 'losers', 'grand-finals']);

function isEliminationMatch(match: Match): boolean {
  return ELIMINATION_BRACKETS.has(match.bracket);
}

/** A match that will never be played because no player can reach it. */
function isDeadMatch(match: Match): boolean {
  return match.isBye && !match.winnerId;
}

function getLoserId(match: Match): string | null {
  if (!match.winnerId || match.isBye || !match.player1Id || !match.player2Id) return null;
  return match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
}

// ============================================================================
// BRACKET GENERATION - MAIN ENTRY POINT
// ============================================================================

export function generateBracket(
  players: Player[],
  format: TournamentFormat,
  config?: TournamentFormatConfig
): Match[] {
  switch (format) {
    case 'single-elimination':
      return generateSingleEliminationBracket(players);
    case 'double-elimination':
      return generateDoubleEliminationBracket(players);
    case 'round-robin':
      return generateRoundRobinBracket(players);
    case 'swiss':
      return generateSwissFirstRound(players, config?.numberOfRounds);
    case 'group-knockout':
      return generateGroupKnockoutBracket(players, config);
    default:
      return generateDoubleEliminationBracket(players);
  }
}

// ============================================================================
// SINGLE ELIMINATION
// ============================================================================

export function generateSingleEliminationBracket(players: Player[]): Match[] {
  const seededPlayers = seedPlayers(players);
  const bracketSize = calculateNextPowerOf2(seededPlayers.length);

  // Generate winners bracket (which is the only bracket for single elim)
  const matches = generateWinnersBracket(seededPlayers, bracketSize);

  // Remove loser links since there's no losers bracket
  matches.forEach((match) => {
    match.loserNextMatchId = null;
    match.loserNextMatchPosition = null;
  });

  resolveByes(matches);
  return matches;
}

// ============================================================================
// DOUBLE ELIMINATION
// ============================================================================

export function generateDoubleEliminationBracket(players: Player[]): Match[] {
  const seededPlayers = seedPlayers(players);
  const bracketSize = calculateNextPowerOf2(seededPlayers.length);
  const matches: Match[] = [];

  // Generate winners bracket
  const winnersMatches = generateWinnersBracket(seededPlayers, bracketSize);
  matches.push(...winnersMatches);

  // Generate losers bracket
  const losersMatches = generateLosersBracket(bracketSize, winnersMatches);
  matches.push(...losersMatches);

  // Generate grand finals
  const grandFinals = generateGrandFinals(winnersMatches, losersMatches);
  matches.push(...grandFinals);

  resolveByes(matches);
  return matches;
}

function createEmptyMatch(id: string, bracket: Match['bracket'], round: number, position: number): Match {
  return {
    id,
    bracket,
    round,
    position,
    player1Id: null,
    player2Id: null,
    player1Score: null,
    player2Score: null,
    winnerId: null,
    isBye: false,
    nextMatchId: null,
    nextMatchPosition: null,
    loserNextMatchId: null,
    loserNextMatchPosition: null,
  };
}

function generateWinnersBracket(
  players: Player[],
  bracketSize: number
): Match[] {
  const matches: Match[] = [];
  const rounds = Math.log2(bracketSize);
  const seedOrder = getBracketSeedOrder(bracketSize);
  // players are already sorted by seed, so seed N is players[N - 1]; seeds past
  // the player count are empty slots (byes), which always land against top seeds.
  const playerAtSeed = (seed: number) => players[seed - 1]?.id ?? null;
  let matchIdCounter = 0;

  // Round 1
  for (let i = 0; i < bracketSize / 2; i++) {
    const match = createEmptyMatch(`winners-r1-m${matchIdCounter++}`, 'winners', 1, i + 1);
    match.player1Id = playerAtSeed(seedOrder[i * 2]);
    match.player2Id = playerAtSeed(seedOrder[i * 2 + 1]);
    matches.push(match);
  }

  // Subsequent rounds
  for (let round = 2; round <= rounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push(createEmptyMatch(`winners-r${round}-m${matchIdCounter++}`, 'winners', round, i + 1));
    }
  }

  // Link matches - winners advance to next round
  for (let round = 1; round < rounds; round++) {
    const currentRoundMatches = matches.filter((m) => m.round === round);
    const nextRoundMatches = matches.filter((m) => m.round === round + 1);

    currentRoundMatches.forEach((match, index) => {
      const nextMatch = nextRoundMatches[Math.floor(index / 2)];
      if (nextMatch) {
        match.nextMatchId = nextMatch.id;
        match.nextMatchPosition = nextMatch.position;
      }
    });
  }

  return matches;
}

function generateLosersBracket(
  bracketSize: number,
  winnersMatches: Match[]
): Match[] {
  const matches: Match[] = [];
  const winnersRounds = Math.log2(bracketSize);
  const totalLosersRounds = (winnersRounds - 1) * 2;
  let matchIdCounter = 0;

  // Losers rounds come in pairs that share a size: rounds 1-2 have bracketSize/4
  // matches, rounds 3-4 have bracketSize/8, and so on.
  for (let round = 1; round <= totalLosersRounds; round++) {
    const matchesInRound = Math.max(1, bracketSize / Math.pow(2, Math.floor((round + 1) / 2) + 1));
    for (let i = 0; i < matchesInRound; i++) {
      matches.push(createEmptyMatch(`losers-r${round}-m${matchIdCounter++}`, 'losers', round, i + 1));
    }
  }

  // Link losers bracket matches
  for (let round = 1; round < totalLosersRounds; round++) {
    const currentRoundMatches = matches.filter((m) => m.round === round);
    const nextRoundMatches = matches.filter((m) => m.round === round + 1);

    currentRoundMatches.forEach((match, index) => {
      // Odd rounds feed the same number of matches in the next round (1-to-1);
      // even rounds feed half as many (2-to-1).
      const isOneToOne = round % 2 === 1;
      const nextMatch = nextRoundMatches[isOneToOne ? index : Math.floor(index / 2)];
      if (nextMatch) {
        match.nextMatchId = nextMatch.id;
        match.nextMatchPosition = nextMatch.position;
      }
    });
  }

  // Link winners bracket losers to losers bracket
  linkWinnersLosersToLosersBracket(winnersMatches, matches, winnersRounds);

  return matches;
}

function linkWinnersLosersToLosersBracket(
  winnersMatches: Match[],
  losersMatches: Match[],
  rounds: number
): void {
  const winnersRound1 = winnersMatches.filter((m) => m.round === 1);
  const losersRound1 = losersMatches.filter((m) => m.round === 1);

  winnersRound1.forEach((match, index) => {
    const target = losersRound1[Math.floor(index / 2)];
    if (target) {
      match.loserNextMatchId = target.id;
      match.loserNextMatchPosition = target.position;
    }
  });

  // Later drop-downs cross over: winners match i sends its loser to losers match
  // i ^ 1 (1<->2, 3<->4, ...). The losers-bracket survivor waiting there came up
  // from the neighbouring part of the bracket, so the dropping player's first
  // losers-bracket opponent is never someone they could already have played
  // (unavoidable only when a round has a single match, e.g. the winners final).
  for (let round = 2; round <= rounds; round++) {
    const winnersRoundMatches = winnersMatches.filter((m) => m.round === round);
    const targetLosersMatches = losersMatches.filter((m) => m.round === (round - 1) * 2);

    winnersRoundMatches.forEach((match, index) => {
      const target = targetLosersMatches[index ^ 1] ?? targetLosersMatches[index];
      if (target) {
        match.loserNextMatchId = target.id;
        match.loserNextMatchPosition = target.position;
      }
    });
  }
}

function generateGrandFinals(
  winnersMatches: Match[],
  losersMatches: Match[]
): Match[] {
  const finalWinnersMatch = [...winnersMatches].sort((a, b) => b.round - a.round)[0];
  const finalLosersMatch = [...losersMatches].sort((a, b) => b.round - a.round)[0];

  const grandFinal = createEmptyMatch('grand-finals-1', 'grand-finals', 1, 1);
  grandFinal.nextMatchId = 'grand-finals-2';
  grandFinal.nextMatchPosition = 2;
  const bracketReset = createEmptyMatch('grand-finals-2', 'grand-finals', 2, 2);

  if (finalWinnersMatch) {
    finalWinnersMatch.nextMatchId = grandFinal.id;
    finalWinnersMatch.nextMatchPosition = 1;
    // With only two players there is no losers bracket: the loser of the only
    // winners match goes straight to the grand final.
    if (!finalLosersMatch) {
      finalWinnersMatch.loserNextMatchId = grandFinal.id;
      finalWinnersMatch.loserNextMatchPosition = 1;
    }
  }
  if (finalLosersMatch) {
    finalLosersMatch.nextMatchId = grandFinal.id;
    finalLosersMatch.nextMatchPosition = 1;
  }

  return [grandFinal, bracketReset];
}

// ============================================================================
// ELIMINATION ADVANCEMENT
// ============================================================================

type FeedPath = 'winner' | 'loser';
type Slot = 'player1' | 'player2';

/**
 * Which slot of `target` a player coming from `source` (as its winner or loser) fills.
 * Returns null for the bracket-reset match, which is filled explicitly.
 */
function getFeedSlot(source: Match, target: Match, path: FeedPath): Slot | null {
  if (target.bracket === 'grand-finals') {
    if (target.round !== 1) return null;
    // Winners-bracket champion is player 1; the losers-bracket champion is player 2.
    return source.bracket === 'winners' && path === 'winner' ? 'player1' : 'player2';
  }
  if (target.bracket === 'losers' && target.round % 2 === 0) {
    // Even losers rounds: the losers-bracket survivor (player 1) meets a player
    // dropping down from the winners bracket (player 2).
    return path === 'loser' ? 'player2' : 'player1';
  }
  return source.position % 2 === 1 ? 'player1' : 'player2';
}

function getSources(matches: Match[], target: Match): { source: Match; path: FeedPath; slot: Slot | null }[] {
  const sources: { source: Match; path: FeedPath; slot: Slot | null }[] = [];
  for (const source of matches) {
    if (source.nextMatchId === target.id) {
      sources.push({ source, path: 'winner', slot: getFeedSlot(source, target, 'winner') });
    }
    if (source.loserNextMatchId === target.id) {
      sources.push({ source, path: 'loser', slot: getFeedSlot(source, target, 'loser') });
    }
  }
  return sources;
}

function placePlayer(matches: Match[], source: Match, targetId: string | null, path: FeedPath, playerId: string | null): void {
  if (!targetId || !playerId) return;
  const target = getMatchById(matches, targetId);
  if (!target) return;
  const slot = getFeedSlot(source, target, path);
  if (slot === 'player1') target.player1Id = playerId;
  if (slot === 'player2') target.player2Id = playerId;
}

/** Send a decided match's winner (and loser, if it has one) to their next matches. */
function advanceMatch(matches: Match[], match: Match): void {
  if (!match.winnerId) return;

  placePlayer(matches, match, match.nextMatchId, 'winner', match.winnerId);
  placePlayer(matches, match, match.loserNextMatchId, 'loser', getLoserId(match));

  // Grand finals: a bracket reset is only played if the losers-bracket champion wins.
  if (match.bracket === 'grand-finals' && match.round === 1 && match.nextMatchId) {
    const bracketReset = getMatchById(matches, match.nextMatchId);
    if (bracketReset) {
      const needsReset = match.winnerId === match.player2Id;
      bracketReset.player1Id = needsReset ? match.player1Id : null;
      bracketReset.player2Id = needsReset ? match.player2Id : null;
    }
  }
}

type SlotState = 'filled' | 'empty' | 'pending';

function getSlotState(matches: Match[], match: Match, slot: Slot): SlotState {
  if (match[slot === 'player1' ? 'player1Id' : 'player2Id']) return 'filled';

  const feed = getSources(matches, match).find((s) => s.slot === slot);
  if (!feed) return 'empty'; // e.g. an unused seed in round 1

  const { source, path } = feed;
  if (isDeadMatch(source)) return 'empty';
  if (!source.winnerId) return 'pending';
  if (path === 'loser' && !getLoserId(source)) return 'empty'; // a bye has no loser
  return 'pending';
}

/**
 * Settle elimination matches that can never be played as a normal match:
 * one player and an empty opposite slot is a bye (the player advances), and two
 * empty slots make the match dead. Repeats until nothing changes, so byes that
 * cascade through the losers bracket are handled too.
 */
export function resolveByes(matches: Match[]): Match[] {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of matches) {
      if (!isEliminationMatch(match) || match.winnerId || match.isBye) continue;
      if (match.bracket === 'grand-finals' && match.round === 2) continue;

      const slot1 = getSlotState(matches, match, 'player1');
      const slot2 = getSlotState(matches, match, 'player2');
      if (slot1 === 'pending' || slot2 === 'pending') continue;
      if (slot1 === 'filled' && slot2 === 'filled') continue;

      match.isBye = true;
      match.player1Score = null;
      match.player2Score = null;
      if (slot1 === 'filled' || slot2 === 'filled') {
        match.winnerId = match.player1Id ?? match.player2Id;
        advanceMatch(matches, match);
      }
      changed = true;
    }
  }
  return matches;
}

// ============================================================================
// COMPLETION
// ============================================================================

export function getSingleEliminationFinalMatch(matches: Match[]): Match | null {
  const winnersMatches = matches.filter((m) => m.bracket === 'winners');
  if (winnersMatches.length === 0) return null;
  const maxRound = Math.max(...winnersMatches.map((m) => m.round));
  return winnersMatches.find((m) => m.round === maxRound && !!m.winnerId) ?? null;
}

export function getDoubleEliminationFinalMatch(matches: Match[]): Match | null {
  const grandFinal = matches.find((m) => m.bracket === 'grand-finals' && m.round === 1);
  const bracketReset = matches.find((m) => m.bracket === 'grand-finals' && m.round === 2);
  if (!grandFinal?.winnerId) return null;
  // The winners-bracket champion (player 1) only needs to win once.
  if (grandFinal.winnerId === grandFinal.player1Id) return grandFinal;
  return bracketReset?.winnerId ? bracketReset : null;
}

function isSingleEliminationComplete(matches: Match[]): boolean {
  return getSingleEliminationFinalMatch(matches) !== null;
}

function isDoubleEliminationComplete(matches: Match[]): boolean {
  return getDoubleEliminationFinalMatch(matches) !== null;
}

export function isTournamentComplete(tournament: Tournament, matches: Match[]): boolean {
  switch (tournament.format) {
    case 'single-elimination':
      return isSingleEliminationComplete(matches);

    case 'double-elimination':
      return isDoubleEliminationComplete(matches);

    case 'round-robin':
      return matches.length > 0 && matches.every((m) => m.winnerId !== null);

    case 'swiss': {
      if (tournament.formatConfig?.winsToQualify !== undefined) {
        // Qualification mode ends with a single-elimination knockout
        return !!tournament.swissQualificationComplete && isSingleEliminationComplete(matches);
      }
      const totalRounds =
        tournament.formatConfig?.numberOfRounds || Math.ceil(Math.log2(tournament.players.length));
      const currentRound = tournament.currentSwissRound || 1;
      return currentRound >= totalRounds && isRoundComplete(matches, currentRound);
    }

    case 'group-knockout': {
      const knockoutMatches = matches.filter(isEliminationMatch);
      if (knockoutMatches.length === 0) return false; // Still in group stage
      return tournament.formatConfig?.knockoutFormat === 'double-elimination'
        ? isDoubleEliminationComplete(knockoutMatches)
        : isSingleEliminationComplete(knockoutMatches);
    }

    default:
      return false;
  }
}

// ============================================================================
// ROUND ROBIN
// ============================================================================

export function generateRoundRobinBracket(players: Player[]): Match[] {
  const seededPlayers = seedPlayers(players);
  const matches: Match[] = [];
  const n = seededPlayers.length;

  // Use circle method for round robin scheduling
  // If odd number of players, add a "bye" player
  const playerIds = seededPlayers.map((p) => p.id);
  const hasOddPlayers = n % 2 === 1;
  if (hasOddPlayers) {
    playerIds.push('BYE');
  }

  const numPlayers = playerIds.length;
  const numRounds = numPlayers - 1;
  const halfSize = numPlayers / 2;

  let matchIdCounter = 0;

  for (let round = 1; round <= numRounds; round++) {
    const roundMatches: { p1: string; p2: string }[] = [];

    for (let i = 0; i < halfSize; i++) {
      const home = (round + i) % (numPlayers - 1);
      let away = (numPlayers - 1 - i + round) % (numPlayers - 1);

      if (i === 0) {
        away = numPlayers - 1;
      }

      const player1Id = playerIds[home];
      const player2Id = playerIds[away];

      // Skip bye matches
      if (player1Id === 'BYE' || player2Id === 'BYE') {
        continue;
      }

      roundMatches.push({ p1: player1Id, p2: player2Id });
    }

    roundMatches.forEach((matchup, position) => {
      matches.push({
        id: `rr-r${round}-m${matchIdCounter++}`,
        bracket: 'round-robin',
        round,
        position: position + 1,
        player1Id: matchup.p1,
        player2Id: matchup.p2,
        player1Score: null,
        player2Score: null,
        winnerId: null,
        isBye: false,
        nextMatchId: null,
        nextMatchPosition: null,
        loserNextMatchId: null,
        loserNextMatchPosition: null,
      });
    });
  }

  return matches;
}

// ============================================================================
// SWISS SYSTEM
// ============================================================================

export function generateSwissFirstRound(
  players: Player[],
  totalRounds?: number
): Match[] {
  const seededPlayers = seedPlayers(players);
  const n = seededPlayers.length;
  const matches: Match[] = [];

  // First round: pair by seed (1 vs n, 2 vs n-1, etc.)
  const halfSize = Math.floor(n / 2);
  let matchIdCounter = 0;

  for (let i = 0; i < halfSize; i++) {
    const player1 = seededPlayers[i];
    const player2 = seededPlayers[n - 1 - i];

    matches.push({
      id: `swiss-r1-m${matchIdCounter++}`,
      bracket: 'swiss',
      round: 1,
      position: i + 1,
      player1Id: player1.id,
      player2Id: player2.id,
      player1Score: null,
      player2Score: null,
      winnerId: null,
      isBye: false,
      nextMatchId: null,
      nextMatchPosition: null,
      loserNextMatchId: null,
      loserNextMatchPosition: null,
    });
  }

  // If odd number of players, one gets a bye
  if (n % 2 === 1) {
    const byePlayer = seededPlayers[halfSize];
    matches.push({
      id: `swiss-r1-m${matchIdCounter++}`,
      bracket: 'swiss',
      round: 1,
      position: halfSize + 1,
      player1Id: byePlayer.id,
      player2Id: null,
      player1Score: null,
      player2Score: null,
      winnerId: byePlayer.id, // Auto-win for bye
      isBye: true,
      nextMatchId: null,
      nextMatchPosition: null,
      loserNextMatchId: null,
      loserNextMatchPosition: null,
    });
  }

  return matches;
}

export function generateSwissNextRound(
  players: Player[],
  existingMatches: Match[],
  currentRound: number,
  config?: TournamentFormatConfig
): Match[] {
  // Get player records
  const playerRecords = new Map<string, { wins: number; losses: number; opponents: Set<string> }>();

  players.forEach((p) => {
    playerRecords.set(p.id, { wins: 0, losses: 0, opponents: new Set() });
  });

  existingMatches.forEach((match) => {
    if (match.winnerId && match.player1Id && match.player2Id) {
      const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;

      const winnerRecord = playerRecords.get(match.winnerId);
      const loserRecord = playerRecords.get(loserId);

      if (winnerRecord) {
        winnerRecord.wins++;
        winnerRecord.opponents.add(loserId);
      }
      if (loserRecord) {
        loserRecord.losses++;
        loserRecord.opponents.add(match.winnerId);
      }
    }
    // Handle byes
    if (match.isBye && match.winnerId) {
      const record = playerRecords.get(match.winnerId);
      if (record) {
        record.wins++;
      }
    }
  });

  // In qualification mode, exclude players who have already qualified
  const isQualificationMode = config?.winsToQualify !== undefined;
  const winsToQualify = config?.winsToQualify || 3;

  // Sort players by record (wins desc, then by seed)
  let sortedPlayers = [...players].sort((a, b) => {
    const recordA = playerRecords.get(a.id)!;
    const recordB = playerRecords.get(b.id)!;
    if (recordB.wins !== recordA.wins) return recordB.wins - recordA.wins;
    return a.seed - b.seed;
  });

  // Filter out qualified players in qualification mode
  if (isQualificationMode) {
    sortedPlayers = sortedPlayers.filter((player) => {
      const record = playerRecords.get(player.id);
      return !record || record.wins < winsToQualify;
    });
  }

  // Pair players with same record, avoiding rematches
  const newMatches: Match[] = [];
  const paired = new Set<string>();
  let matchIdCounter = 0;
  const nextRound = currentRound + 1;

  for (let i = 0; i < sortedPlayers.length; i++) {
    const player1 = sortedPlayers[i];
    if (paired.has(player1.id)) continue;

    const record1 = playerRecords.get(player1.id)!;

    // Find best opponent (same record, haven't played)
    let opponent: Player | null = null;
    for (let j = i + 1; j < sortedPlayers.length; j++) {
      const candidate = sortedPlayers[j];
      if (paired.has(candidate.id)) continue;
      if (record1.opponents.has(candidate.id)) continue;

      opponent = candidate;
      break;
    }

    if (opponent) {
      paired.add(player1.id);
      paired.add(opponent.id);

      newMatches.push({
        id: `swiss-r${nextRound}-m${matchIdCounter++}`,
        bracket: 'swiss',
        round: nextRound,
        position: newMatches.length + 1,
        player1Id: player1.id,
        player2Id: opponent.id,
        player1Score: null,
        player2Score: null,
        winnerId: null,
        isBye: false,
        nextMatchId: null,
        nextMatchPosition: null,
        loserNextMatchId: null,
        loserNextMatchPosition: null,
      });
    }
  }

  // Handle any remaining unpaired player (bye)
  const unpaired = sortedPlayers.filter((p) => !paired.has(p.id));
  if (unpaired.length === 1) {
    const byePlayer = unpaired[0];
    newMatches.push({
      id: `swiss-r${nextRound}-m${matchIdCounter++}`,
      bracket: 'swiss',
      round: nextRound,
      position: newMatches.length + 1,
      player1Id: byePlayer.id,
      player2Id: null,
      player1Score: null,
      player2Score: null,
      winnerId: byePlayer.id,
      isBye: true,
      nextMatchId: null,
      nextMatchPosition: null,
      loserNextMatchId: null,
      loserNextMatchPosition: null,
    });
  }

  return newMatches;
}

export function generateKnockoutFromSwiss(
  qualifiedPlayers: Player[],
  config?: TournamentFormatConfig
): Match[] {
  // Seed the qualified players by assigning new seeds based on qualification order
  const seededPlayers = qualifiedPlayers.map((player, index) => ({
    ...player,
    seed: index + 1,
  }));

  // Generate single elimination bracket
  return generateSingleEliminationBracket(seededPlayers);
}

// ============================================================================
// GROUP STAGE + KNOCKOUT
// ============================================================================

export function generateGroupKnockoutBracket(
  players: Player[],
  config?: TournamentFormatConfig
): Match[] {
  const seededPlayers = seedPlayers(players);
  const groupCount = config?.groupCount || Math.min(4, Math.floor(seededPlayers.length / 2));
  const advancePerGroup = config?.advancePerGroup || 2;

  // Assign players to groups using snake draft (for balanced seeding)
  const groups: Player[][] = Array.from({ length: groupCount }, () => []);

  seededPlayers.forEach((player, index) => {
    const round = Math.floor(index / groupCount);
    const groupIndex = round % 2 === 0 ? index % groupCount : groupCount - 1 - (index % groupCount);
    groups[groupIndex].push({ ...player, groupId: `group-${groupIndex + 1}` });
  });

  const matches: Match[] = [];
  let matchIdCounter = 0;

  // Generate round robin matches for each group
  groups.forEach((groupPlayers, groupIndex) => {
    const groupId = `group-${groupIndex + 1}`;
    const n = groupPlayers.length;

    if (n < 2) return;

    // Round robin within group
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        matches.push({
          id: `${groupId}-m${matchIdCounter++}`,
          bracket: 'group',
          round: 1, // All group matches are "round 1" conceptually
          position: matches.length + 1,
          player1Id: groupPlayers[i].id,
          player2Id: groupPlayers[j].id,
          player1Score: null,
          player2Score: null,
          winnerId: null,
          isBye: false,
          groupId,
          nextMatchId: null,
          nextMatchPosition: null,
          loserNextMatchId: null,
          loserNextMatchPosition: null,
        });
      }
    }
  });

  // Knockout bracket will be generated when group stage completes
  // For now, we only generate group stage matches

  return matches;
}

export function generateKnockoutFromGroups(
  players: Player[],
  groupMatches: Match[],
  config?: TournamentFormatConfig
): Match[] {
  const advancePerGroup = config?.advancePerGroup || 2;
  const knockoutFormat = config?.knockoutFormat || 'single-elimination';

  // Calculate standings for each group
  const groupIds = [...new Set(groupMatches.map((m) => m.groupId).filter(Boolean))] as string[];
  const advancingPlayers: Player[] = [];

  groupIds.forEach((groupId) => {
    const groupMatchList = groupMatches.filter((m) => m.groupId === groupId);
    const standings = calculateGroupStandings(groupMatchList, players);

    // Take top N from this group
    const topPlayers = standings.slice(0, advancePerGroup);
    topPlayers.forEach((standing) => {
      const player = players.find((p) => p.id === standing.playerId);
      if (player) {
        advancingPlayers.push(player);
      }
    });
  });

  // Seed advancing players (alternate from groups for balanced bracket)
  const seededAdvancing = advancingPlayers.map((p, idx) => ({
    ...p,
    seed: idx + 1,
  }));

  if (knockoutFormat === 'double-elimination') {
    return generateDoubleEliminationBracket(seededAdvancing);
  }

  return generateSingleEliminationBracket(seededAdvancing);
}

function calculateGroupStandings(
  matches: Match[],
  players: Player[]
): { playerId: string; wins: number; pointDiff: number }[] {
  const standings = new Map<string, { wins: number; pointsFor: number; pointsAgainst: number }>();

  matches.forEach((match) => {
    if (match.player1Id && !standings.has(match.player1Id)) {
      standings.set(match.player1Id, { wins: 0, pointsFor: 0, pointsAgainst: 0 });
    }
    if (match.player2Id && !standings.has(match.player2Id)) {
      standings.set(match.player2Id, { wins: 0, pointsFor: 0, pointsAgainst: 0 });
    }

    if (match.winnerId && match.player1Score !== null && match.player2Score !== null) {
      const winner = standings.get(match.winnerId);
      if (winner) winner.wins++;

      const p1 = standings.get(match.player1Id!);
      const p2 = standings.get(match.player2Id!);

      if (p1) {
        p1.pointsFor += match.player1Score;
        p1.pointsAgainst += match.player2Score;
      }
      if (p2) {
        p2.pointsFor += match.player2Score;
        p2.pointsAgainst += match.player1Score;
      }
    }
  });

  return Array.from(standings.entries())
    .map(([playerId, data]) => ({
      playerId,
      wins: data.wins,
      pointDiff: data.pointsFor - data.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDiff - a.pointDiff;
    });
}

// ============================================================================
// MATCH RESULT UPDATES
// ============================================================================

export function updateMatchResult(
  matches: Match[],
  matchId: string,
  player1Score: number,
  player2Score: number
): Match[] {
  const updatedMatches = cloneMatches(matches);
  const match = getMatchById(updatedMatches, matchId);
  if (!match) return updatedMatches;

  match.player1Score = player1Score;
  match.player2Score = player2Score;
  match.winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;
  match.isForfeited = false;

  // Round-robin, Swiss and group matches don't feed other matches
  if (!isEliminationMatch(match)) {
    return updatedMatches;
  }

  advanceMatch(updatedMatches, match);
  resolveByes(updatedMatches);
  return updatedMatches;
}

export function resetDownstreamMatches(matches: Match[], matchId: string): Match[] {
  const updatedMatches = cloneMatches(matches);
  const match = getMatchById(updatedMatches, matchId);
  if (!match) return updatedMatches;

  // Reset the current match
  match.player1Score = null;
  match.player2Score = null;
  match.winnerId = null;
  match.isForfeited = false;

  if (!isEliminationMatch(match)) {
    return updatedMatches;
  }

  // Collect every match that this result fed into, directly or indirectly
  const matchesToReset = new Set<string>();
  const collect = (currentMatchId: string) => {
    const current = getMatchById(updatedMatches, currentMatchId);
    if (!current) return;
    for (const nextId of [current.nextMatchId, current.loserNextMatchId]) {
      if (nextId && !matchesToReset.has(nextId)) {
        matchesToReset.add(nextId);
        collect(nextId);
      }
    }
  };
  collect(matchId);

  matchesToReset.forEach((id) => {
    const m = getMatchById(updatedMatches, id);
    if (!m) return;

    m.player1Score = null;
    m.player2Score = null;
    m.winnerId = null;
    m.isBye = false;
    m.isForfeited = false;

    if (m.bracket === 'grand-finals' && m.round === 2) {
      // The bracket reset is filled from the grand final's result
      m.player1Id = null;
      m.player2Id = null;
      return;
    }

    // Clear only the slots fed by matches that are being reset
    for (const { source, slot } of getSources(updatedMatches, m)) {
      if (source.id !== matchId && !matchesToReset.has(source.id)) continue;
      if (slot === 'player1') m.player1Id = null;
      if (slot === 'player2') m.player2Id = null;
    }
  });

  return updatedMatches;
}

export function forceMatchWinner(
  matches: Match[],
  matchId: string,
  winnerId: string,
  isForfeited: boolean = false
): Match[] {
  const updatedMatches = cloneMatches(matches);
  const match = getMatchById(updatedMatches, matchId);
  if (!match) return updatedMatches;

  if (match.player1Id !== winnerId && match.player2Id !== winnerId) {
    return updatedMatches;
  }

  match.winnerId = winnerId;
  match.isForfeited = isForfeited;

  // Round-robin, Swiss and group matches don't feed other matches
  if (!isEliminationMatch(match)) {
    return updatedMatches;
  }

  // Same advancement rules as a scored match, so forfeits land in the right slots
  advanceMatch(updatedMatches, match);
  resolveByes(updatedMatches);
  return updatedMatches;
}

export function overrideMatchPlayers(
  matches: Match[],
  matchId: string,
  player1Id: string | null,
  player2Id: string | null
): Match[] {
  const updatedMatches = cloneMatches(matches);
  const match = getMatchById(updatedMatches, matchId);
  if (!match) return updatedMatches;

  if (match.winnerId) {
    return updatedMatches;
  }

  match.player1Id = player1Id;
  match.player2Id = player2Id;
  // A manual override is never treated as a bye: an empty slot here means "to be decided".
  match.isBye = false;

  return updatedMatches;
}

import { z } from 'zod';
import type { Tournament, Player, Match, PlayerList, TournamentFormat } from '@/types/tournament';

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  seed: z.number().int().positive(),
  wins: z.number().int().nonnegative().optional(),
  losses: z.number().int().nonnegative().optional(),
  groupId: z.string().optional(),
});

export const MatchSchema = z.object({
  id: z.string(),
  bracket: z.enum(['winners', 'losers', 'grand-finals', 'round-robin', 'swiss', 'group']),
  round: z.number().int().positive(),
  position: z.number().int().positive(),
  player1Id: z.string().nullable(),
  player2Id: z.string().nullable(),
  player1Score: z.number().int().nonnegative().nullable(),
  player2Score: z.number().int().nonnegative().nullable(),
  winnerId: z.string().nullable(),
  isBye: z.boolean(),
  isForfeited: z.boolean().optional(),
  notes: z.string().optional(),
  nextMatchId: z.string().nullable(),
  nextMatchPosition: z.number().int().positive().nullable(),
  loserNextMatchId: z.string().nullable(),
  loserNextMatchPosition: z.number().int().positive().nullable(),
  groupId: z.string().optional(),
});

export const TournamentFormatConfigSchema = z.object({
  numberOfRounds: z.number().int().positive().optional(),
  winsToQualify: z.number().int().positive().optional(),
  qualifyingPlayers: z.number().int().positive().optional(),
  groupCount: z.number().int().positive().optional(),
  playersPerGroup: z.number().int().positive().optional(),
  advancePerGroup: z.number().int().positive().optional(),
  knockoutFormat: z.enum(['single-elimination', 'double-elimination']).optional(),
}).optional();

export const TournamentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  format: z.enum(['single-elimination', 'double-elimination', 'round-robin', 'swiss', 'group-knockout']).optional(),
  formatConfig: TournamentFormatConfigSchema,
  status: z.enum(['draft', 'active', 'completed']),
  players: z.array(PlayerSchema),
  matches: z.array(MatchSchema),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  groupStageComplete: z.boolean().optional(),
  swissQualificationComplete: z.boolean().optional(),
  currentSwissRound: z.number().int().positive().optional(),
});

export const PlayerListSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  players: z.array(z.object({ name: z.string().min(1) })),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Migrate old tournament data to include format field
 * Existing tournaments without format are assumed to be double-elimination
 */
function migrateTournament(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (!data.format) {
    // Infer format from existing matches if possible
    const matches = data.matches || [];
    const hasLosers = matches.some((m: any) => m.bracket === 'losers');
    const hasGrandFinals = matches.some((m: any) => m.bracket === 'grand-finals');
    const hasRoundRobin = matches.some((m: any) => m.bracket === 'round-robin');
    const hasSwiss = matches.some((m: any) => m.bracket === 'swiss');
    const hasGroup = matches.some((m: any) => m.bracket === 'group');

    let format: TournamentFormat = 'double-elimination';

    if (hasRoundRobin) {
      format = 'round-robin';
    } else if (hasSwiss) {
      format = 'swiss';
    } else if (hasGroup) {
      format = 'group-knockout';
    } else if (hasLosers || hasGrandFinals) {
      format = 'double-elimination';
    } else if (matches.length > 0) {
      // Only winners bracket - could be single elim
      format = 'single-elimination';
    }

    return { ...data, format };
  }
  return data;
}

function parseTournament(data: unknown) {
  // Apply migration first
  const result = TournamentSchema.safeParse(migrateTournament(data));
  if (!result.success) return { tournament: null, error: result.error };
  // Ensure format has a default value
  const tournament = {
    ...result.data,
    format: result.data.format || 'double-elimination',
  } as Tournament;
  return { tournament, error: null };
}

export function validateTournament(data: unknown): Tournament | null {
  const { tournament, error } = parseTournament(data);
  if (error) console.warn('Invalid tournament data:', error);
  return tournament;
}

export function validateTournaments(data: unknown): Tournament[] {
  return partitionTournaments(data).valid;
}

/**
 * Split stored tournament data into tournaments that pass validation and the raw
 * entries that don't. Invalid entries are returned untouched so callers can keep
 * them in storage instead of erasing data the app can't read yet.
 */
export function partitionTournaments(data: unknown): { valid: Tournament[]; invalid: unknown[] } {
  if (data === null || data === undefined) return { valid: [], invalid: [] };
  // Anything that isn't a list is unreadable as a whole; keep it as one entry
  if (!Array.isArray(data)) return { valid: [], invalid: [data] };

  const valid: Tournament[] = [];
  const invalid: unknown[] = [];
  for (const item of data) {
    const { tournament } = parseTournament(item);
    if (tournament) valid.push(tournament);
    else invalid.push(item);
  }
  return { valid, invalid };
}

export function validatePlayerList(data: unknown): PlayerList | null {
  const result = PlayerListSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn('Invalid player list data:', result.error);
  return null;
}

export function validatePlayerLists(data: unknown): PlayerList[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const validated: PlayerList[] = [];
  for (const item of data) {
    const list = validatePlayerList(item);
    if (list) {
      validated.push(list);
    }
  }
  return validated;
}

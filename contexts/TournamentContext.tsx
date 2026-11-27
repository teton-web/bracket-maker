'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Tournament, Player, Match, TournamentFormat, TournamentFormatConfig } from '@/types/tournament';
import {
  generateBracket,
  updateMatchResult,
  resetDownstreamMatches,
  forceMatchWinner as forceMatchWinnerLib,
  overrideMatchPlayers as overrideMatchPlayersLib,
  generateSwissNextRound,
  generateKnockoutFromGroups,
  generateKnockoutFromSwiss,
  isTournamentComplete,
} from '@/lib/bracket';
import { isGroupStageComplete, isRoundComplete, countQualifiedPlayers, getPlayerRecord } from '@/lib/standings';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { partitionTournaments } from '@/lib/validators';
import { toast } from 'sonner';

interface TournamentContextType {
  tournaments: Tournament[];
  currentTournament: Tournament | null;
  isLoading: boolean;
  createTournament: (
    name: string,
    players: Player[],
    format: TournamentFormat,
    formatConfig?: TournamentFormatConfig
  ) => Tournament;
  updateTournament: (tournament: Tournament) => void;
  setCurrentTournament: (id: string | null) => void;
  startTournament: (id: string) => void;
  updateMatch: (
    tournamentId: string,
    matchId: string,
    player1Score: number,
    player2Score: number,
    isReScoring?: boolean
  ) => void;
  deleteTournament: (id: string) => void;
  overrideMatchPlayers: (
    tournamentId: string,
    matchId: string,
    player1Id: string | null,
    player2Id: string | null
  ) => void;
  forceMatchWinner: (
    tournamentId: string,
    matchId: string,
    winnerId: string,
    isForfeited?: boolean
  ) => void;
  advanceSwissRound: (tournamentId: string) => void;
  advanceSwissToKnockout: (tournamentId: string) => void;
  advanceToKnockout: (tournamentId: string) => void;
}

const STORAGE_KEY = 'bracket-maker-tournaments';

// Helper to serialize tournaments for storage
function serializeTournaments(tournaments: Tournament[]): unknown[] {
  return tournaments.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() || null,
  }));
}

// Win/loss records derived from played matches (byes don't count). Recomputing
// from scratch keeps stats correct when a match is re-scored and later results reset.
function playersWithRecords(players: Player[], matches: Match[]): Player[] {
  const records = new Map(players.map((p) => [p.id, { wins: 0, losses: 0 }]));
  for (const match of matches) {
    if (!match.winnerId || match.isBye || !match.player1Id || !match.player2Id) continue;
    const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
    const winnerRecord = records.get(match.winnerId);
    const loserRecord = records.get(loserId);
    if (winnerRecord) winnerRecord.wins++;
    if (loserRecord) loserRecord.losses++;
  }
  return players.map((p) => ({ ...p, ...records.get(p.id) }));
}

// Apply new match results: refresh records and set status from whether the
// tournament is actually finished (an edit can reopen a completed tournament).
function withMatches(tournament: Tournament, matches: Match[]): Tournament {
  const isComplete = isTournamentComplete(tournament, matches);
  return {
    ...tournament,
    players: playersWithRecords(tournament.players, matches),
    matches,
    status: isComplete ? 'completed' : 'active',
    completedAt: isComplete ? (tournament.completedAt ?? new Date()) : null,
  };
}

const TournamentContext = createContext<TournamentContextType | undefined>(
  undefined
);

export function TournamentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [rawTournaments, setRawTournaments] = useLocalStorage<unknown[]>(
    STORAGE_KEY,
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [currentTournament, setCurrentTournamentState] =
    useState<Tournament | null>(null);

  // Hydrate tournaments from localStorage - memoize to prevent recreation on every render.
  // Entries that fail validation are set aside, not dropped: they are written back
  // unchanged on every save, so a bad or newer-format record is never erased.
  const { valid: tournaments, invalid: invalidEntries } = useMemo(
    () => partitionTournaments(rawTournaments),
    [rawTournaments]
  );
  const invalidEntriesRef = useRef<unknown[]>(invalidEntries);
  const warnedAboutInvalidRef = useRef(false);
  useEffect(() => {
    invalidEntriesRef.current = invalidEntries;
    if (invalidEntries.length > 0 && !warnedAboutInvalidRef.current) {
      warnedAboutInvalidRef.current = true;
      const count = invalidEntries.length;
      console.warn('Saved tournaments that failed validation (kept in storage):', invalidEntries);
      // Deferred so the Toaster (mounted after this provider) has subscribed first
      setTimeout(() => {
        toast.warning(
          `${count} saved tournament${count > 1 ? 's' : ''} couldn't be loaded. ` +
            `${count > 1 ? "They're" : "It's"} kept in storage unchanged and included in backups.`
        );
      }, 0);
    }
  }, [invalidEntries]);

  useEffect(() => {
    // Mark as loaded after initial hydration
    setIsLoading(false);
  }, []);

  // Latest tournaments, including writes made earlier in the same event handler.
  // Actions read from here instead of the render-time `tournaments`, so calling
  // two of them in a row (e.g. create then start) doesn't lose the first write.
  const tournamentsRef = useRef<Tournament[]>(tournaments);
  useEffect(() => {
    tournamentsRef.current = tournaments;
  }, [tournaments]);

  const findTournament = (id: string) => tournamentsRef.current.find((t) => t.id === id);

  // Update localStorage when tournaments change
  const updateTournamentsStorage = useCallback((updated: Tournament[]) => {
    tournamentsRef.current = updated;
    setRawTournaments([...serializeTournaments(updated), ...invalidEntriesRef.current]);
  }, [setRawTournaments]);

  const createTournament = (
    name: string,
    players: Player[],
    format: TournamentFormat = 'double-elimination',
    formatConfig?: TournamentFormatConfig
  ): Tournament => {
    const tournament: Tournament = {
      id: uuidv4(),
      name,
      format,
      formatConfig,
      status: 'draft',
      players: players.map((p, index) => ({
        ...p,
        seed: p.seed || index + 1,
      })),
      matches: [],
      createdAt: new Date(),
      completedAt: null,
    };

    const updated = [...tournamentsRef.current, tournament];
    updateTournamentsStorage(updated);
    return tournament;
  };

  const updateTournament = (tournament: Tournament) => {
    const updated = tournamentsRef.current.map((t) =>
      t.id === tournament.id ? tournament : t
    );
    updateTournamentsStorage(updated);
    if (currentTournament?.id === tournament.id) {
      setCurrentTournamentState(tournament);
    }
  };

  const setCurrentTournament = useCallback((id: string | null) => {
    if (id === null) {
      setCurrentTournamentState(null);
      return;
    }
    const tournament = tournaments.find((t) => t.id === id);
    setCurrentTournamentState(tournament || null);
  }, [tournaments]);

  const startTournament = (id: string) => {
    const tournament = findTournament(id);
    if (!tournament || tournament.status !== 'draft') return;

    const matches = generateBracket(
      tournament.players,
      tournament.format,
      tournament.formatConfig
    );

    const updated: Tournament = {
      ...tournament,
      status: 'active',
      matches,
      currentSwissRound: tournament.format === 'swiss' ? 1 : undefined,
    };

    updateTournament(updated);
  };

  const updateMatch = (
    tournamentId: string,
    matchId: string,
    player1Score: number,
    player2Score: number,
    isReScoring: boolean = false
  ) => {
    const tournament = findTournament(tournamentId);
    if (!tournament) return;

    // Re-scoring clears everything this match fed into before applying the new result
    const startingMatches = isReScoring
      ? resetDownstreamMatches(tournament.matches, matchId)
      : tournament.matches;

    const updatedMatches = updateMatchResult(
      startingMatches,
      matchId,
      player1Score,
      player2Score
    );

    updateTournament(withMatches(tournament, updatedMatches));
  };

  const deleteTournament = (id: string) => {
    const updated = tournamentsRef.current.filter((t) => t.id !== id);
    updateTournamentsStorage(updated);
    if (currentTournament?.id === id) {
      setCurrentTournamentState(null);
    }
  };

  const overrideMatchPlayers = (
    tournamentId: string,
    matchId: string,
    player1Id: string | null,
    player2Id: string | null
  ) => {
    const tournament = findTournament(tournamentId);
    if (!tournament) return;

    const updatedMatches = overrideMatchPlayersLib(
      tournament.matches,
      matchId,
      player1Id,
      player2Id
    );

    const updated: Tournament = {
      ...tournament,
      matches: updatedMatches,
    };

    updateTournament(updated);
    toast.success('Match players updated');
  };

  const forceMatchWinner = (
    tournamentId: string,
    matchId: string,
    winnerId: string,
    isForfeited: boolean = false
  ) => {
    const tournament = findTournament(tournamentId);
    if (!tournament) return;

    const updatedMatches = forceMatchWinnerLib(
      tournament.matches,
      matchId,
      winnerId,
      isForfeited
    );

    updateTournament(withMatches(tournament, updatedMatches));
    toast.success(isForfeited ? 'Match forfeited' : 'Winner declared');
  };

  const advanceSwissRound = (tournamentId: string) => {
    const tournament = findTournament(tournamentId);
    if (!tournament || tournament.format !== 'swiss') return;

    const currentRound = tournament.currentSwissRound || 1;
    const isQualificationMode = tournament.formatConfig?.winsToQualify !== undefined;

    // Check if current round is complete
    if (!isRoundComplete(tournament.matches, currentRound)) {
      toast.error('Complete all matches in the current round first');
      return;
    }

    if (isQualificationMode) {
      // In qualification mode, check if enough players have qualified
      // Use match data instead of player.wins for accurate counting
      const winsToQualify = tournament.formatConfig?.winsToQualify || 3;
      const qualifiedPlayersCount = countQualifiedPlayers(
        tournament.matches,
        tournament.players,
        winsToQualify
      );

      const targetQualifiers = tournament.formatConfig?.qualifyingPlayers || 8;

      if (qualifiedPlayersCount >= targetQualifiers) {
        toast.info(`Qualification target reached (${qualifiedPlayersCount}/${targetQualifiers}). Use "Advance to Knockout" instead.`);
        return;
      }

      // Generate next round matches
      const newMatches = generateSwissNextRound(
        tournament.players,
        tournament.matches,
        currentRound,
        tournament.formatConfig
      );

      const updated: Tournament = {
        ...tournament,
        matches: [...tournament.matches, ...newMatches],
        currentSwissRound: currentRound + 1,
      };

      updateTournament(updated);
      toast.success(`Qualification Round ${currentRound + 1} generated`);
    } else {
      // Fixed rounds mode
      const totalRounds = tournament.formatConfig?.numberOfRounds ||
        Math.ceil(Math.log2(tournament.players.length));

      if (currentRound >= totalRounds) {
        toast.info('All Swiss rounds are complete');
        return;
      }

      // Generate next round matches
      const newMatches = generateSwissNextRound(
        tournament.players,
        tournament.matches,
        currentRound,
        tournament.formatConfig
      );

      const updated: Tournament = {
        ...tournament,
        matches: [...tournament.matches, ...newMatches],
        currentSwissRound: currentRound + 1,
      };

      updateTournament(updated);
      toast.success(`Round ${currentRound + 1} generated`);
    }
  };

  const advanceSwissToKnockout = (tournamentId: string) => {
    const tournament = findTournament(tournamentId);
    if (!tournament || tournament.format !== 'swiss') return;

    const isQualificationMode = tournament.formatConfig?.winsToQualify !== undefined;
    if (!isQualificationMode) {
      toast.error('This tournament is not in qualification mode');
      return;
    }

    // Check if qualification target is met using match data for accuracy
    const winsToQualify = tournament.formatConfig?.winsToQualify || 3;
    const qualifiedPlayers = tournament.players.filter((player) => {
      const record = getPlayerRecord(tournament.matches, player.id);
      return record.wins >= winsToQualify;
    });

    const targetQualifiers = tournament.formatConfig?.qualifyingPlayers || 8;
    if (qualifiedPlayers.length < targetQualifiers) {
      toast.error(`Need ${targetQualifiers} qualified players, but only ${qualifiedPlayers.length} have ${winsToQualify} wins`);
      return;
    }

    // Sort qualified players by wins (desc), then by seed (asc)
    const sortedQualifiedPlayers = qualifiedPlayers.sort((a, b) => {
      const recordA = getPlayerRecord(tournament.matches, a.id);
      const recordB = getPlayerRecord(tournament.matches, b.id);
      if (recordB.wins !== recordA.wins) return recordB.wins - recordA.wins;
      return a.seed - b.seed;
    });

    // Generate knockout bracket from qualified players
    const knockoutMatches = generateKnockoutFromSwiss(
      sortedQualifiedPlayers,
      tournament.formatConfig
    );

    const updated: Tournament = {
      ...tournament,
      matches: [...tournament.matches, ...knockoutMatches],
      swissQualificationComplete: true,
    };

    updateTournament(updated);
    toast.success(`Knockout bracket generated with ${qualifiedPlayers.length} players`);
  };

  const advanceToKnockout = (tournamentId: string) => {
    const tournament = findTournament(tournamentId);
    if (!tournament || tournament.format !== 'group-knockout') return;

    // Check if group stage is complete
    const groupMatches = tournament.matches.filter((m) => m.bracket === 'group');
    if (!isGroupStageComplete(groupMatches)) {
      toast.error('Complete all group stage matches first');
      return;
    }

    if (tournament.groupStageComplete) {
      toast.info('Already advanced to knockout stage');
      return;
    }

    // Generate knockout bracket from group results
    const knockoutMatches = generateKnockoutFromGroups(
      tournament.players,
      groupMatches,
      tournament.formatConfig
    );

    const updated: Tournament = {
      ...tournament,
      matches: [...tournament.matches, ...knockoutMatches],
      groupStageComplete: true,
    };

    updateTournament(updated);
    toast.success('Knockout bracket generated');
  };

  return (
    <TournamentContext.Provider
      value={{
        tournaments,
        currentTournament,
        isLoading,
        createTournament,
        updateTournament,
        setCurrentTournament,
        startTournament,
        updateMatch,
        deleteTournament,
        overrideMatchPlayers,
        forceMatchWinner,
        advanceSwissRound,
        advanceSwissToKnockout,
        advanceToKnockout,
      }}
    >
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  const context = useContext(TournamentContext);
  if (context === undefined) {
    throw new Error('useTournament must be used within TournamentProvider');
  }
  return context;
}

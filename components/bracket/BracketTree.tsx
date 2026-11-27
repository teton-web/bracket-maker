'use client';

import { useMemo, forwardRef } from 'react';
import type { Match, Player, TournamentFormat, TournamentFormatConfig } from '@/types/tournament';
import { getDoubleEliminationFinalMatch, getSingleEliminationFinalMatch } from '@/lib/bracket';
import { ReactFlowBracket, type ReactFlowBracketRef } from './ReactFlowBracket';

interface BracketTreeProps {
  matches: Match[];
  players: Player[];
  format?: TournamentFormat;
  formatConfig?: TournamentFormatConfig;
  currentSwissRound?: number;
  groupStageComplete?: boolean;
  swissQualificationComplete?: boolean;
  onMatchClick: (match: Match) => void;
  onOverrideClick?: (match: Match) => void;
  onAdvanceSwissRound?: () => void;
  onAdvanceToKnockout?: () => void;
  activeMatchId?: string;
}

export const BracketTree = forwardRef<ReactFlowBracketRef, BracketTreeProps>(
  function BracketTree(
    {
      matches,
      players,
      format = 'double-elimination',
      formatConfig,
      currentSwissRound = 1,
      groupStageComplete = false,
      swissQualificationComplete = false,
      onMatchClick,
      onOverrideClick,
      onAdvanceSwissRound,
      onAdvanceToKnockout,
      activeMatchId,
    },
    ref
  ) {
    // Find the winner if tournament is complete
    const winner = useMemo(() => {
      if (format === 'double-elimination') {
        const finalMatch = getDoubleEliminationFinalMatch(matches);
        return finalMatch ? players.find(p => p.id === finalMatch.winnerId) || null : null;
      }
      
      if (format === 'single-elimination') {
        const finalMatch = getSingleEliminationFinalMatch(matches);
        return finalMatch ? players.find(p => p.id === finalMatch.winnerId) || null : null;
      }
      
      if (format === 'group-knockout' && groupStageComplete) {
        const isDoubleElim =
          formatConfig?.knockoutFormat === 'double-elimination' ||
          matches.some(m => m.bracket === 'grand-finals');
        const finalMatch = isDoubleElim
          ? getDoubleEliminationFinalMatch(matches)
          : getSingleEliminationFinalMatch(matches);
        return finalMatch ? players.find(p => p.id === finalMatch.winnerId) || null : null;
      }
      
      if (format === 'swiss' && swissQualificationComplete) {
        const finalMatch = getSingleEliminationFinalMatch(matches);
        return finalMatch ? players.find(p => p.id === finalMatch.winnerId) || null : null;
      }
      
      return null;
    }, [matches, players, format, formatConfig, groupStageComplete, swissQualificationComplete]);

    // For Swiss with knockout, show knockout bracket if qualification is complete
    const effectiveFormat = useMemo(() => {
      if (format === 'swiss' && swissQualificationComplete) {
        return 'single-elimination' as TournamentFormat;
      }
      return format;
    }, [format, swissQualificationComplete]);

    const effectiveMatches = useMemo(() => {
      if (format === 'swiss' && swissQualificationComplete) {
        return matches.filter(m => m.bracket === 'winners');
      }
      return matches;
    }, [matches, format, swissQualificationComplete]);

    return (
      <div className="pb-8">
        <ReactFlowBracket
          ref={ref}
          matches={effectiveMatches}
          players={players}
          format={effectiveFormat}
          formatConfig={formatConfig}
          currentSwissRound={currentSwissRound}
          groupStageComplete={groupStageComplete}
          swissQualificationComplete={swissQualificationComplete}
          winner={winner}
          onMatchClick={onMatchClick}
          onOverrideClick={onOverrideClick}
          onAdvanceSwissRound={onAdvanceSwissRound}
          onAdvanceToKnockout={onAdvanceToKnockout}
          activeMatchId={activeMatchId}
        />
      </div>
    );
  }
);

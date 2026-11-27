'use client';

import { useCallback, useEffect, useMemo, useState, useImperativeHandle, forwardRef, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'framer-motion';

import type { Match, Player, TournamentFormat, TournamentFormatConfig } from '@/types/tournament';
import { generateBracketLayout } from '@/lib/bracket-layout';
import { MatchNode } from './nodes/MatchNode';
import { ChampionNode } from './nodes/ChampionNode';
import { GroupNode } from './nodes/GroupNode';
import { StandingsNode } from './nodes/StandingsNode';
import { BracketEdge } from './edges/BracketEdge';
import { Button } from '../ui/Button';
import { cn } from '@/lib/utils';
import { countQualifiedPlayers } from '@/lib/standings';

// Define custom node types
const nodeTypes: NodeTypes = {
  matchNode: MatchNode,
  championNode: ChampionNode,
  groupNode: GroupNode,
  standingsNode: StandingsNode,
};

// Define custom edge types
const edgeTypes: EdgeTypes = {
  bracketEdge: BracketEdge,
};

// Export interface for the ReactFlowBracket component
export interface ReactFlowBracketRef {
  exportToBlob: (options?: { backgroundColor?: string; padding?: number; quality?: number }) => Promise<Blob | null>;
}

interface ReactFlowBracketProps {
  matches: Match[];
  players: Player[];
  format: TournamentFormat;
  formatConfig?: TournamentFormatConfig;
  currentSwissRound?: number;
  groupStageComplete?: boolean;
  swissQualificationComplete?: boolean;
  winner?: Player | null;
  onMatchClick: (match: Match) => void;
  onOverrideClick?: (match: Match) => void;
  onAdvanceSwissRound?: () => void;
  onAdvanceToKnockout?: () => void;
  activeMatchId?: string;
}

// Inner component that has access to React Flow context
function ReactFlowContent({
  matches,
  players,
  format,
  formatConfig,
  currentSwissRound = 1,
  groupStageComplete = false,
  swissQualificationComplete = false,
  winner,
  onMatchClick,
  onOverrideClick,
  onAdvanceSwissRound,
  onAdvanceToKnockout,
  activeMatchId,
  onExportReady,
}: ReactFlowBracketProps & { onExportReady: (exportFn: () => Promise<Blob | null>) => void }) {
  const [fitViewOnInit, setFitViewOnInit] = useState(true);
  const { fitView } = useReactFlow();

  // Export method exposed via ref
  const exportToBlob = useCallback(async (options: { backgroundColor?: string; padding?: number; quality?: number } = {}) => {
    const {
      backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-dark') || '#111827',
      padding = 20,
      quality = 1.0,
    } = options;

    // Fit view to ensure all content is visible
    fitView({ padding, includeHiddenNodes: false, minZoom: 0.1, maxZoom: 1 });

    // Small delay to ensure fitView completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Use html-to-image to capture the React Flow container
    const { toBlob } = await import('html-to-image');
    const container = document.querySelector('.react-flow') as HTMLElement;

    if (!container) {
      throw new Error('React Flow container not found');
    }

    const capture = (skipFonts: boolean) =>
      toBlob(container, {
        backgroundColor,
        quality,
        pixelRatio: 2,
        skipFonts,
        // Don't filter out canvas elements
        filter: () => true,
      });

    // Embedding the web fonts never finishes in some browsers (Firefox), so give it a
    // few seconds and fall back to an image rendered with the fallback fonts.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Font embedding timed out')), 5000)
    );
    try {
      return await Promise.race([capture(false), timeout]);
    } catch {
      return capture(true);
    }
  }, [fitView]);

  // Notify parent component that export function is ready
  useEffect(() => {
    onExportReady(exportToBlob);
  }, [exportToBlob, onExportReady]);

  // Generate layout based on format
  const { initialNodes, initialEdges } = useMemo(() => {
    const layout = generateBracketLayout(matches, players, format, {
      formatConfig,
      currentSwissRound,
      groupStageComplete,
      winner,
      onMatchClick,
      onOverrideClick,
      activeMatchId,
    });

    return {
      initialNodes: layout.nodes,
      initialEdges: layout.edges,
    };
  }, [matches, players, format, formatConfig, currentSwissRound, groupStageComplete, winner, onMatchClick, onOverrideClick, activeMatchId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when layout changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Get format label
  const formatLabel = useMemo(() => {
    switch (format) {
      case 'single-elimination': return 'Single Elimination';
      case 'double-elimination': return 'Double Elimination';
      case 'round-robin': return 'Round Robin';
      case 'swiss': return 'Swiss System';
      case 'group-knockout': return 'Group Stage + Knockout';
      default: return format;
    }
  }, [format]);

  // Calculate completion stats
  const completionStats = useMemo(() => {
    // Skip matches nobody can reach (empty bye slots) and an unneeded bracket reset
    const playable = matches.filter(m =>
      !(m.isBye && !m.winnerId) &&
      !(m.bracket === 'grand-finals' && m.round === 2 && !m.player1Id && !m.player2Id)
    );
    const completed = playable.filter(m => m.winnerId).length;
    const total = playable.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }, [matches]);

  // Which "next stage" action the panel offers, if any
  const advanceAction = useMemo((): { label: string; onClick: () => void } | null => {
    if (format === 'swiss' && !swissQualificationComplete) {
      const currentRoundMatches = matches.filter(m => m.round === currentSwissRound && m.bracket === 'swiss');
      if (!currentRoundMatches.every(m => m.winnerId)) return null;

      // Qualification mode moves on to the knockout once enough players have qualified
      const winsToQualify = formatConfig?.winsToQualify;
      if (winsToQualify !== undefined) {
        const target = formatConfig?.qualifyingPlayers || 8;
        if (countQualifiedPlayers(matches, players, winsToQualify) >= target) {
          return onAdvanceToKnockout ? { label: 'Advance to Knockout', onClick: onAdvanceToKnockout } : null;
        }
      }
      return onAdvanceSwissRound
        ? { label: `Generate Round ${currentSwissRound + 1}`, onClick: onAdvanceSwissRound }
        : null;
    }
    if (format === 'group-knockout' && !groupStageComplete) {
      const groupMatches = matches.filter(m => m.bracket === 'group');
      if (groupMatches.every(m => m.winnerId) && onAdvanceToKnockout) {
        return { label: 'Advance to Knockout', onClick: onAdvanceToKnockout };
      }
    }
    return null;
  }, [format, formatConfig, matches, players, currentSwissRound, swissQualificationComplete, groupStageComplete, onAdvanceSwissRound, onAdvanceToKnockout]);

  return (
    <div data-testid="bracket-container" className="w-full h-[600px] rounded-xl overflow-hidden esports-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={fitViewOnInit}
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.5,
          minZoom: 0.3,
        }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'bracketEdge',
          animated: true,
        }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        nodesFocusable={true}
        panOnScroll
        zoomOnScroll
        className="bg-[var(--bg-dark)]"
      >
        {/* Background with grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255, 255, 255, 0.03)"
        />

        {/* Controls */}
        <Controls
          showInteractive={false}
          className="!bg-[var(--bg-card)] !border-[var(--border-dim)] !rounded-lg !shadow-lg"
        />

        {/* Mini map */}
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'championNode') return 'var(--neon-gold)';
            if (node.type === 'groupNode') return 'var(--neon-cyan)';
            if (node.type === 'standingsNode') return 'var(--neon-magenta)';
            return 'var(--neon-green)';
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-[var(--bg-card)] !border-[var(--border-dim)] !rounded-lg"
          pannable
          zoomable
        />

        {/* Info Panel */}
        <Panel position="top-left" className="!m-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-lg px-4 py-3 space-y-2"
          >
            {/* Format badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-1 rounded bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)]">
                {formatLabel}
              </span>
              {format === 'swiss' && (
                <span className="text-xs text-[var(--text-muted)]">
                  Round {currentSwissRound}
                </span>
              )}
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Progress</span>
                <span className="text-[var(--neon-green)] font-mono">
                  {completionStats.completed}/{completionStats.total}
                </span>
              </div>
              <div className="w-32 h-1.5 bg-[var(--bg-darker)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completionStats.percent}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-green)]"
                />
              </div>
            </div>

            {/* Advance button */}
            {advanceAction && (
              <Button
                onClick={advanceAction.onClick}
                variant="primary"
                size="sm"
                className="w-full mt-2"
              >
                {advanceAction.label}
              </Button>
            )}
          </motion.div>
        </Panel>

        {/* Legend Panel */}
        <Panel position="top-right" className="!m-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-lg px-3 py-2 flex items-center gap-4 text-[10px]"
          >
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--neon-green)]" />
              <span className="text-[var(--text-muted)]">Winner</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--neon-magenta)]" />
              <span className="text-[var(--text-muted)]">Loser</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--neon-gold)]" />
              <span className="text-[var(--text-muted)]">Champion</span>
            </div>
          </motion.div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// Internal component that wraps the content with ReactFlowProvider
function ReactFlowBracketInternal(
  props: ReactFlowBracketProps,
  ref: React.ForwardedRef<ReactFlowBracketRef>
) {
  const exportFunctionRef = useRef<(() => Promise<Blob | null>) | null>(null);

  // Export method exposed via ref
  const exportToBlob = useCallback(async (options: { backgroundColor?: string; padding?: number; quality?: number } = {}) => {
    if (exportFunctionRef.current) {
      return exportFunctionRef.current();
    }
    throw new Error('Export function not available');
  }, []);

  // Expose the export method via ref
  useImperativeHandle(ref, () => ({
    exportToBlob,
  }), [exportToBlob]);

  const handleExportReady = useCallback((exportFn: () => Promise<Blob | null>) => {
    exportFunctionRef.current = exportFn;
  }, []);

  return (
    <ReactFlowProvider>
      <ReactFlowContent {...props} onExportReady={handleExportReady} />
    </ReactFlowProvider>
  );
}

// Exported component with ref forwarding
export const ReactFlowBracket = forwardRef<ReactFlowBracketRef, ReactFlowBracketProps>(
  ReactFlowBracketInternal
);

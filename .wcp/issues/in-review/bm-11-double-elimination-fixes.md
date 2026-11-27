---
id: bm-11
title: Fix double elimination bracket layout, Grand Finals reset/champion, and land crossover & E2E fixes
status: in-review
priority: high
assignee: "David Solheim"
lease_expires: ""
scope: Double elimination layout, Grand Finals reset/champion logic, Group Knockout DE support, ReactFlow state sync, and Nov 25 bracket crossover / validation / E2E suite on dev
acceptance: No overlapping nodes in DE bracket view (2-16 players), DE bracket view playable through losers and GF reset, unit/typecheck/build/e2e green, browser verified
files:
  - lib/bracket.ts
  - lib/bracket-layout.ts
  - lib/validators.ts
  - contexts/TournamentContext.tsx
  - components/bracket/BracketTree.tsx
  - components/bracket/ReactFlowBracket.tsx
  - components/bracket/GroupKnockoutView.tsx
  - components/bracket/StandingsTable.tsx
  - components/bracket/nodes/GroupNode.tsx
  - components/bracket/nodes/MatchNode.tsx
  - components/bracket/nodes/StandingsNode.tsx
  - components/layout/ViewToggle.tsx
  - components/match/MatchCard.tsx
  - components/match/MatchList.tsx
  - components/match/MatchOverrideModal.tsx
  - components/match/ScoreModal.tsx
  - components/player/PlayerForm.tsx
  - components/player/PlayerList.tsx
  - components/player/PlayerListManager.tsx
  - components/tournament/WinnerCelebration.tsx
  - app/tournament/new/page.tsx
  - package.json
  - README.md
  - AGENTS.md
  - tests/tsconfig.json
  - tests/fixtures/test-utils.ts
  - tests/unit/bracket.test.ts
  - tests/unit/bracket-layout.test.ts
  - tests/unit/validators.test.ts
  - tests/e2e/
commit: "ec23a1bb4bb9472413634ac4eef11d686bb0e7db"
reason: ""
---

Fixed double elimination bracket layout overlaps (backwards winners exponent, collapsed losers rounds, tight card height), structural edges vs. bye loser-drop edges, premature Champion node before Grand Finals reset, Group Knockout double-elimination routing, ReactFlow render-time `useMemo` state updates, and Legend overlapping the Fit View control, while landing the Nov 25 losers-bracket crossover, non-destructive tournament validation, and rewritten Playwright E2E suite on `dev`.

Verified locally:
- `bun run test:unit`: 42/42 passing (12,194 assertions)
- `bun run typecheck` and `bun run test:typecheck`: passing
- `bun run build`: passing (Next.js 16.4.6 Turbopack)
- Playwright Chromium E2E: 60/60 passing across all 9 specs (including new Bracket View non-overlap & GF reset test)
- Browser verified 8-player Double Elimination end-to-end on `http://localhost:3000` (0 overlaps, clickable Losers R1 advancing to Losers R2).

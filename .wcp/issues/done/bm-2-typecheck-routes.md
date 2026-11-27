---
id: bm-2
title: Repair TypeScript check and stop checking in generated route types
status: done
priority: high
assignee: ""
lease_expires: ""
scope: types/routes.d.ts, types/validator.ts, types/cache-life.d.ts, package.json typecheck script
acceptance: bun run typecheck passes and generated Next route types are not checked in
files:
  - types/routes.d.ts
  - types/validator.ts
  - types/cache-life.d.ts
  - bunfig.toml
  - tests/unit/tooling.test.ts
commit: "29caa939222159253d19f930c2380a7ab740606e"
reason: ""
---

`tsc --noEmit` fails in `.next/types/validator.ts` because checked-in `types/routes.d.ts` declares global `LayoutProps` constrained to `LayoutRoutes = "/"`. The generated validator passes layout routes such as `/tournament/new`, `/players`, and `/stats`.

Remove the checked-in Next snapshots (`types/routes.d.ts`, `types/validator.ts`, `types/cache-life.d.ts`). Keep `types/tournament.ts`. Add `typecheck` as `next typegen && tsc --noEmit` so route types are regenerated before `tsc`. `package.json` is edited under BM-1.

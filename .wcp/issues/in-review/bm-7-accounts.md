---
id: bm-7
title: Phase 1 accounts with Neon Auth
status: in-review
priority: high
assignee: manager
lease_expires: ""
scope: Neon Auth email/password UI, header menu, and /account. Guest pages and localStorage stay public.
acceptance: bun run build, bun run typecheck, and bun test pass. Auth pages render. Existing routes stay public.
files:
  - package.json
  - bun.lock
  - components/layout/Header.tsx
  - .gitignore
  - AGENTS.md
commit: "c2e279b97092d83c9b3f7a11241d5bde29f5e483"
reason: ""
---

Email and password accounts through Neon managed Better Auth. Do not call betterAuth(), add a database adapter, or send mail from the app. Guest tournaments stay in localStorage.

Local `dev` commit c2e279b97092d83c9b3f7a11241d5bde29f5e483. Not pushed. `bun run build` (with env and with `.env.local` moved aside), `bun run typecheck`, and `bun test` passed. Guest routes stay public. `/api/auth/get-session` returns null while signed out.

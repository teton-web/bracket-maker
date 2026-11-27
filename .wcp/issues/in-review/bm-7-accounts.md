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
  - components/auth/SignInForm.tsx
  - components/auth/SignUpForm.tsx
  - components/auth/ResetPasswordForm.tsx
  - components/auth/VerifyEmailForm.tsx
  - components/auth/ForgotPasswordForm.tsx
  - components/auth/AccountMenu.tsx
  - proxy.ts
  - lib/auth/env.ts
  - app/account/page.tsx
  - app/auth/reset-password/page.tsx
  - app/auth/verify-email/page.tsx
  - tests/unit/auth.test.ts
commit: "497999cce32f328094232b68853a76027688bf77"
reason: ""
---

Email and password accounts through Neon managed Better Auth. Do not call betterAuth(), add a database adapter, or send mail from the app. Guest tournaments stay in localStorage.

Codex review fixes are on local `dev` commit 497999cce32f328094232b68853a76027688bf77. Not pushed. `bun run build`, `bun run typecheck`, and `bun test` passed. Auth forms post to their own pages. Missing auth env redirects `/account` to sign-in. Email verification follows the OTP session token.

---
id: bm-1
title: Fix Next 16 production build for next/font/google under Turbopack
status: done
priority: critical
assignee: ""
lease_expires: ""
scope: package.json, bun.lock, app font loading stays on next/font/google
acceptance: bun run build passes on Next that accepts extensionless Google font URLs
files:
  - package.json
  - bun.lock
  - LICENSE
  - AGENTS.md
commit: "29caa939222159253d19f930c2380a7ab740606e"
reason: ""
---

`next/font/google` in `app/layout.tsx` is valid. Next 16.3.4 Turbopack reports `Can't resolve '@vercel/turbopack-next/internal/font/google/font'` when Google Fonts returns extensionless `/l/font?kit=` URLs (the `&` query is split and the extension check fails). That parser is fixed in Next 16.4.3 (#100277) and is in 16.4.6.

A clean `.next` build of 16.3.4 can still pass while Google serves `.woff2` URLs. Pin Next and eslint-config-next to 16.4.6 so the production build does not depend on that URL shape.

Vercel production deployment 8073640905 of `14650a7` succeeded and is the live production deployment (`https://bracket-magic-ht04q1bm1.tetonweb.app`).

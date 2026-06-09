# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**NY Rental Map V2** — a Next.js (App Router) + React + TypeScript app for discovering
NYC student rentals near Columbia, NYU, Baruch, and Pratt. Map-first UI with commute
filters, listing-confidence ("trust") metadata, nearby POIs (Google Places), unit
comparison, and lead capture. Data comes from local CSV in `data/` and/or a private
Google Sheet. There is a password-gated `/admin` operations panel.

The active roadmap lives in [`MAINTENANCE_PLAN.md`](MAINTENANCE_PLAN.md). User-facing
setup/ops docs are in [`README_V2.md`](README_V2.md).

## Commands

```bash
npm run dev        # start dev server on http://localhost:5503 (guards against double-start)
npm run dev:next   # raw `next dev -p 5503`
npm run build      # next build
npm run start      # next start -p 5503
npm run lint       # next lint (eslint)
npm run typecheck  # tsc --noEmit
npm test           # compile tsconfig.test.json -> .test-dist, run node:test on tests/*.test.js
npm run pull:sheets   # pull data from the private Google Sheet
npm run setup:sheets  # scaffold the Google Sheet tabs
```

Before declaring work done, run `npm run typecheck` and `npm test`. There is **no CI yet**
(see plan Phase 0.1), so local verification is the only gate.

Platform note: dev shell is **PowerShell on Windows**. Use PowerShell syntax for shell
commands (`$env:VAR`, `$null`, backtick line-continuation), or use the Bash tool for
POSIX scripts.

## Architecture

### Data flow
- **Source of truth**: `getRentalDataset()` in [`lib/data.ts`](lib/data.ts) (wrapped in
  React `cache`). It prefers a Google Sheet cache (`readGoogleSheetCache()`) and falls
  back to local CSV in `data/` when the sheet isn't configured/available.
- Raw rows → `normalize*()` functions → typed domain objects in
  [`lib/types.ts`](lib/types.ts). Each building/unit carries a `TrustInfo` block
  (price/fee/availability status, last-updated, source) — this "listing confidence" is a
  core product concept, preserve it when touching data shaping.
- **Public vs internal split**: [`lib/public-dataset.ts`](lib/public-dataset.ts) strips
  internal fields (`contactId`, `updatedBy`, `internalNotes`, contacts/agents/changeLog)
  before anything reaches the browser. The home page sends only summaries
  (`getInitialPublicRentalDataset`); full unit/photo/POI detail is fetched on demand via
  `/api/buildings/[id]` (`getPublicBuildingDetail`). **Never send internal fields to the
  client** — route new public data through these helpers.

### Routes
- `app/page.tsx` → server component, hydrates `components/RentalApp.tsx` (the large
  `'use client'` root, ~1455 lines; refactor planned in plan Phase 3.1).
- `app/buildings/[id]` — shareable building/unit page. `app/legal/[slug]` — legal pages.
- API (`app/api/`):
  - `buildings/[id]` — public building detail (GET).
  - `places/nearby` — POIs; reads CSV/JSON cache by default, hits Google Places only with
    `?refresh=1` **and** server `GOOGLE_PLACES_API_KEY` set. The key is server-only.
  - `leads`, `analytics` — **public POST** (no auth/rate-limit yet — known gap, plan
    Phase 1.1/1.2), admin-only GET. Writes to Google Sheet when configured, else local
    `.data/*.json` in dev.
  - `admin/login`, `admin/logout`, `admin/sync` — auth + sheet sync.

### Auth
- [`lib/admin-auth.ts`](lib/admin-auth.ts): HMAC-signed session token in the
  `nyrm_admin_session` cookie; `crypto.timingSafeEqual` for comparisons. Two server
  guards: `verifyAdminRequest` (cookie) and `verifyAdminSyncToken` (`x-admin-sync-token`
  header, for scheduled `/api/admin/sync`).
- Dev fallbacks exist (default password `123456`, derived secret). Production returns
  empty secrets when unset → routes should deny. **Do not weaken these guards.**

### Persistence policy
- [`lib/server-store.ts`](lib/server-store.ts) `localFileStoreAllowed()` gates all `.data`
  writes: allowed in dev, in prod only if `ENABLE_LOCAL_DATA_STORE=1`.
- [`lib/persistence-policy.ts`](lib/persistence-policy.ts) returns a 503 when prod has no
  configured persistent store (no Sheet creds and local store disabled).

## Conventions

- **Imports**: use the `@/*` path alias (maps to repo root, see `tsconfig.json`).
- **TypeScript strict** is on. Keep it compiling — don't introduce `any` to silence errors.
- **Match surrounding style**: small focused functions, explicit return types on exported
  fns, no comments unless they explain non-obvious intent. Mirror existing `normalize*` /
  `lib/*` patterns.
- **Tests**: `node:test` only (no jest/vitest). Compiled via `tsconfig.test.json` into
  `.test-dist/`. Name files `*.test.ts` under `tests/`. Test pure lib logic; keep handlers
  importable for testing.
- **Secrets**: never log API keys or tokens. `app/api/admin/sync/route.ts` redacts
  `AIza...` keys from error messages — reuse that pattern for any new external-API errors.
- **Env**: never use `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` or any `NEXT_PUBLIC_*` for
  secrets — those are bundled into the browser. Server-only keys stay server-only.
  Keep `.env.example` in sync with variables the code actually reads.

## Security-sensitive areas (handle with care)

- Public write endpoints (`leads`, `analytics`) — abuse surface; see plan Phase 1.
- `lib/admin-auth.ts`, `lib/public-dataset.ts` — auth and the internal/public boundary.
- `lib/google-sheets.ts` / `google-sheets-write.ts` — service-account JWT signing and
  Sheet writes.

## Gotchas

- `getRentalDataset` is `cache`-wrapped per request — don't expect cross-request memo.
- Buildings without coordinates or with zero units are filtered out in `lib/data.ts`;
  units with `grossRent <= 0` are dropped. Account for this when debugging "missing" data.
- POIs are de-duplicated by `buildingId|type|name`, preferring Google source then nearest
  distance — see the merge loop in `getRentalDataset`.
- Don't commit `tsconfig.tsbuildinfo`, `.data/`, `.places-cache/`, `.env.local`.
- Git operations: branch before committing on `main`; only commit/push when asked.

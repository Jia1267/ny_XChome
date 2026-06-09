# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file in sync
with the code — it is the first thing future sessions read.

## Project

**NY Rental Map V2** — a Next.js (App Router) + React + TypeScript app for discovering
NYC student rentals near Columbia, NYU, Baruch, and Pratt. Map-first UI with commute
filters, listing-confidence ("trust") metadata, nearby POIs (Google Places), unit
comparison, a rent-split calculator, an advanced share-budget filter, a shareable
listings page, and lead capture. There is a password-gated `/admin` operations panel.

Data comes from local CSV in `data/` and/or a private Google Sheet. Deployed on **Vercel**.

Status: functionally rich **trial / pre-commercial**. Roadmaps:
- [`MAINTENANCE_PLAN.md`](MAINTENANCE_PLAN.md) — phased hardening (Phases 0,1,2,4,5 done; 3 partial).
- [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) — forward product/technical roadmap.
- [`README_V2.md`](README_V2.md) — setup/ops/troubleshooting.

## Repo layout & platform (read first)

- **Monorepo**: the git root is one level up (`F:/F/ny`) and holds several projects.
  This project lives at `O/ny_rental_google_places_fixed_V2/`. Consequences:
  - The CI workflow is at the **repo root** `.github/workflows/ci.yml`, scoped to this
    subtree via `paths:` filters and `working-directory`.
  - `vercel.json` is in **this** directory — Vercel's project **Root Directory must be
    set to `O/ny_rental_google_places_fixed_V2`**.
- **Dev shell is PowerShell on Windows.** Use PowerShell syntax (`$env:VAR`, `$null`,
  backtick continuation) or the Bash tool for POSIX. `node`/`npm` are on the user's
  interactive PATH but **not** in non-interactive agent shells — the user runs
  `npm run typecheck/test/lint/build` and reports results; verify with them, don't assume.
- **Zero-new-dependency bias so far.** Recent work avoided adding npm packages
  (validation is hand-written, not zod; rate-limiting/caches are in-memory, not KV)
  because deps couldn't be installed/locked in-session. When a task genuinely needs a
  dependency (Vercel KV, Sentry, Auth.js, Stripe, Playwright), say so explicitly and let
  the user `npm install` — don't fake it with a fragile in-memory shim silently.

## Commands

```bash
npm run dev        # dev server on http://localhost:5503 (guards against double-start)
npm run dev:next   # raw `next dev -p 5503`
npm run build      # next build
npm run start      # next start -p 5503
npm run lint       # next lint (eslint, config: .eslintrc.json -> next/core-web-vitals)
npm run typecheck  # tsc --noEmit
npm test           # compile tsconfig.test.json -> .test-dist, run node:test on tests/*.test.js
npm run pull:sheets   # pull data from the private Google Sheet
npm run setup:sheets  # scaffold/repair the Google Sheet tabs + headers
```

Before declaring work done, ask the user to run `npm run typecheck && npm test && npm run
build`. CI runs lint→typecheck→test→build on PRs/pushes (see `.github/workflows/ci.yml`).
`npm run lint` currently emits one known **warning** (manual leaflet stylesheet in
`app/layout.tsx`) — warnings don't fail the build.

## Architecture

### Data flow
- **Source of truth**: `getRentalDataset()` in [`lib/data.ts`](lib/data.ts) (wrapped in
  React `cache`, per-request). Prefers a Google Sheet cache (`readGoogleSheetCache()`),
  falls back to local CSV in `data/`.
- Raw rows → `normalize*()` → typed domain objects in [`lib/types.ts`](lib/types.ts).
  Each building/unit carries a `TrustInfo` block (price/fee/availability status,
  last-updated, source) — this "listing confidence" is a core product concept. Preserve it.
- **Public vs internal split**: [`lib/public-dataset.ts`](lib/public-dataset.ts) strips
  internal fields (`contactId`, `updatedBy`, `internalNotes`, contacts/agents/changeLog)
  before anything reaches the browser. **Never send internal fields to the client** —
  route new public data through these helpers. Three derived entry points:
  - `getInitialPublicRentalDataset()` — home/listings: building **summaries only**
    (`units: []`, no photos/pois). Keeps the initial payload small.
  - `getPublicBuildingDetail(id)` — one building, full public detail (units/photos/pois).
    Served by `/api/buildings/[id]`, fetched on demand when a building is opened.
  - `getPublicRentalDataset()` — full public dataset incl. units. Used by
    `/api/floorplans` for the advanced filter.
- **Gotchas in `lib/data.ts`**: buildings without coords or with zero units are dropped;
  units with `grossRent <= 0` are dropped; POIs are de-duped by `buildingId|type|name`
  (prefer Google source, then nearest).

### Routes
- `app/page.tsx` → server component → hydrates `components/RentalApp.tsx` (the client root).
- `app/buildings/[id]/page.tsx` — shareable building/unit deep link (renders RentalApp).
- `app/listings/page.tsx` → `components/ListingsView.tsx` — searchable/sortable building list.
- `app/legal/[slug]/page.tsx`, `app/legal/page.tsx` — legal pages from [`lib/legal.ts`](lib/legal.ts).
- `app/error.tsx`, `app/global-error.tsx` — route + root error boundaries (recoverable UI).
- `app/robots.ts`, `app/sitemap.ts` — SEO (sitemap includes `/listings` + each building).
- API (`app/api/`):
  - `buildings/[id]` GET — public building detail.
  - `floorplans` GET — all buildings + floor plans (public) for the advanced filter.
  - `places/nearby` GET — POIs; CSV/JSON cache by default, hits Google Places only with
    `?refresh=1` **and** server `GOOGLE_PLACES_API_KEY`. Refresh results cached in
    **process memory** (30-day TTL) so prod benefits; file cache only works in dev.
  - `leads`, `analytics` — **public POST** (rate-limited + validated + honeypot),
    admin-only GET. Writes to Google Sheet when configured, else local `.data` in dev.
  - `health` GET — public liveness probe (counts + config booleans, **no secrets**).
  - `admin/login`, `admin/logout` — auth.
  - `admin/sync` POST/GET — Sheet sync. GET path is for **Vercel Cron** (auth via
    `CRON_SECRET` bearer); POST for admin cookie / `x-admin-sync-token`.
  - `admin/diagnostics` GET/POST — storage self-test (GET reports row counts/errors,
    POST runs a write probe that also auto-creates the operational tabs).
  - `admin/backup` GET — downloads a JSON snapshot of leads + analytics (admin or sync token).

### Components
- [`RentalApp.tsx`](components/RentalApp.tsx) — the `'use client'` orchestrator: owns map
  state, selection, compare, lead context, `advancedOpen`, `hoveredBuildingId`, analytics
  `track()`, and on-demand building-detail loading (`loadBuildingDetail` with error/retry).
  Wraps everything in `ImageZoomProvider`.
- [`components/rental/`](components/rental) — extracted UI (was one 1455-line file):
  `DetailPanel`, `BuildingDetail`, `UnitDetail`, `RentCalculator`, `CompareDock`
  (+ Mini/Full cards), `NearbyFacilities`, `TrustGrid`, `MapLegend`, `LeadModal`,
  `ImageZoom` (click-to-zoom lightbox via context), and `shared.ts` (helpers + `DetailStage`).
- [`MapCanvas.tsx`](components/MapCanvas.tsx) — Leaflet via dynamic `import('leaflet')`.
  Price markers (with hover tooltip preview: building photo + name), school markers,
  commute rings, POI markers, rail overlay. Accepts `hoveredBuildingId` → highlights +
  gently `panTo`s that marker (results-panel ↔ map linkage).
- [`AdvancedSearch.tsx`](components/AdvancedSearch.tsx) + [`MatchingResultsPanel.tsx`](components/MatchingResultsPanel.tsx)
  — advanced share-budget filter (see below).
- [`ListingsView.tsx`](components/ListingsView.tsx), [`AdminActions.tsx`](components/AdminActions.tsx),
  [`AdminLogin.tsx`](components/AdminLogin.tsx).

### Rent split & advanced filter
- [`lib/rent-split.ts`](lib/rent-split.ts) is the **single source of truth** for split math:
  `generateOccupantOptions` (1..bedrooms+1), `calculateAverageSplit`, `calculateWeightedSplit`
  (each tier `$200` cheaper: primary bed > second > ... > living room), `getMatchedPrices`.
  `components/rental/shared.ts` re-exports `calculateWeightedSplit as splitMonthly` — the
  RentCalculator uses that. **Don't reintroduce a second copy of this math.**
- [`lib/filter-floorplans.ts`](lib/filter-floorplans.ts): `getMatchingFloorPlans` (matches a
  floor plan if any share-group per-person price lands in budget), `groupResultsByBuilding`
  (one card per building), `sortBuildingGroups` (recommended/price/distance), `distanceMiles`.
  **Geographic scope is NOT done here** — it's decided by the map's commute rings:
  `RentalApp` passes `allowedBuildingIds = filteredBuildings.map(id)`; the anchor for
  distance sort is the commute-rings-selected school (or null). Bedroom search range is
  `desired .. desired+2`.

### Auth
- [`lib/admin-auth.ts`](lib/admin-auth.ts): HMAC-signed session token in the
  `nyrm_admin_session` cookie; `crypto.timingSafeEqual` comparisons. Guards:
  `verifyAdminRequest` (cookie), `verifyAdminSyncToken` (`x-admin-sync-token` header).
  `admin/sync` GET also accepts Vercel Cron's `Authorization: Bearer ${CRON_SECRET}`.
- Dev fallbacks exist (default password `123456`, derived secret). Production returns
  empty secrets when unset → routes deny. **Do not weaken these guards.**
- [`lib/env.ts`](lib/env.ts) `productionEnvProblems()` surfaces missing prod config in the
  `/admin` banner (non-throwing — never crash the site at import time).

### Request guards & validation (public POST endpoints)
- [`lib/api-guard.ts`](lib/api-guard.ts): `clientIp`, `isAllowedOrigin` (same-origin always
  allowed; cross-origin checked against `ALLOWED_APP_ORIGINS`; **fails open** when unset so
  the site's own calls never break), and an **in-memory** `rateLimit` (per-instance,
  best-effort on serverless — KV is the upgrade).
- [`lib/validation.ts`](lib/validation.ts): hand-written (no zod) `validateLead` /
  `validateAnalyticsEvent` — length caps, control-char stripping, event-type allow-pattern,
  and a **honeypot** (`website` field) on the lead form that silently drops bots.

### Persistence policy (Vercel = no durable disk)
- [`lib/server-store.ts`](lib/server-store.ts) `localFileStoreAllowed()` gates `.data`
  writes: dev only, or prod with `ENABLE_LOCAL_DATA_STORE=1`.
- [`lib/persistence-policy.ts`](lib/persistence-policy.ts) returns 503 when prod has no
  configured store.
- **On Vercel, leads/analytics only persist to Google Sheets.** If Sheets creds are
  missing, writes 503 and `/admin` shows 0 → the "metrics are 0" class of bug. The
  `leads`/`analytics_events` tabs are **auto-created on first write**
  (`ensureOperationalTabs` in `google-sheets-write.ts`); the service account needs **Editor**.
- Sheet cache + Places refresh cache + rate-limit buckets are all **per-instance memory**
  in prod. Migrating these to Vercel KV is the main scaling item.

### i18n
- [`lib/i18n.ts`](lib/i18n.ts) holds `copy.en` / `copy.zh` and the `CopyKey`/`Translate`
  types. **The two languages MUST have identical key sets** — `copy[language][key]` is a
  typed union index; a missing key breaks typecheck. RentalApp/ListingsView use this table.
- Some newer components (`AdvancedSearch`, `MatchingResultsPanel`) carry a **local** `copy`
  table keyed by `language` instead of the global one, to avoid global-parity churn.
  Either pattern is fine; match the file you're editing.

## Conventions

- **Imports**: use the `@/*` path alias (maps to repo root of the project; see `tsconfig.json`).
- **TypeScript strict** is on. No `any` to silence errors.
- **Match surrounding style**: small focused functions, explicit return types on exported
  fns, comments only for non-obvious intent.
- **Components using hooks/interactivity** get `'use client'`; presentational ones imported
  only by client components don't strictly need it but it's harmless.
- **Images** currently use native `<img>` (with `eslint-disable @next/next/no-img-element`,
  `loading="lazy"`, `decoding="async"`, and `onError` to hide broken). Floor-plan/hero
  images are click-to-zoom via `useImageZoom()`. Migrating to `next/image` needs the host
  added to `next.config.mjs` `remotePatterns` (only 7 hosts whitelisted today).
- **Tests**: `node:test` only (no jest/vitest), compiled via `tsconfig.test.json` into
  `.test-dist/`. Name `*.test.ts` under `tests/`. Coverage is **lib-only** today.
- **Secrets**: never log API keys/tokens. Reuse the `AIza...` / `ya29....` redaction in
  `google-sheets-write.ts` / `admin/sync` for any new external-API errors.
- **Env**: never use `NEXT_PUBLIC_*` for secrets (bundled into the browser). Keep
  `.env.example` in sync with variables the code reads.

## Environment variables

Server-only unless prefixed `NEXT_PUBLIC_`. Set the same set in Vercel → Project → Env Vars.

```
NEXT_PUBLIC_SITE_URL            # canonical prod URL (share links, sitemap, OG)
ALLOWED_APP_ORIGINS             # comma list; cross-origin POST allow-list (fails open if unset)
GOOGLE_PLACES_API_KEY           # server-only; enables /api/places/nearby?refresh=1
GOOGLE_SHEET_ID                 # private sheet id
GOOGLE_SERVICE_ACCOUNT_EMAIL    # service account; needs Editor on the sheet
GOOGLE_PRIVATE_KEY              # service account key (escaped \n newlines)
ADMIN_PASSWORD                  # /admin login
ADMIN_SESSION_SECRET            # HMAC secret for the session cookie (>=32 bytes)
ADMIN_SYNC_TOKEN                # x-admin-sync-token for manual/external sync
CRON_SECRET                     # Vercel Cron bearer for GET /api/admin/sync
ENABLE_LOCAL_DATA_STORE=0       # allow .data writes in prod (normally 0 on Vercel)
```

`vercel.json` defines a cron: `GET /api/admin/sync` every 4h (`0 */4 * * *`). Hobby plan
allows only daily cron — switch to `0 3 * * *` on Hobby, or use Pro.

## Security-sensitive areas (handle with care)
- Public write endpoints (`leads`, `analytics`) — abuse surface; guards in `api-guard.ts` + `validation.ts`.
- `lib/admin-auth.ts`, `lib/env.ts`, `lib/public-dataset.ts` — auth and the internal/public boundary.
- `lib/google-sheets.ts` / `google-sheets-write.ts` — service-account JWT signing, token
  cache, Sheet reads/writes, tab auto-creation.

## Security headers
`next.config.mjs` sets HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
Permissions-Policy. **CSP is intentionally not set yet** (Leaflet pulls tiles/inline styles
from CDNs) — add it in report-only mode first.

## Gotchas
- `getRentalDataset` is `cache`-wrapped per request — no cross-request memo.
- Home/listings ship **summaries only** (`units: []`); full unit data loads via
  `/api/buildings/[id]` or `/api/floorplans`. Account for empty `units` on the client.
- Advanced filter and detail panel are **mutually exclusive on the right** — opening one
  closes the other (`advancedOpen`); selecting a map marker / unit also closes advanced.
- `splitMonthly` is a re-export of `calculateWeightedSplit`; edit the math in `rent-split.ts`.
- Don't commit `tsconfig.tsbuildinfo`, `.data/`, `.places-cache/`, `.env.local`,
  `.test-dist/` (all gitignored).
- Git: branch before committing on `main`; **the user prefers local-only changes — do NOT
  push or open PRs unless explicitly asked.**

## What's NOT done yet (commercial-grade gaps)
Data layer is CSV/Sheets (needs a real DB); rate-limit/caches are in-memory (need Vercel
KV); single admin password (needs multi-role auth); legal pages are placeholder-grade
(need lawyer-reviewed TOS/privacy/Fair-Housing/agency-disclosure/ADA); tests are lib-only
(need API/component/E2E); no error monitoring (Sentry), no CSP, native `<img>` not
`next/image`, no a11y pass. See `DEVELOPMENT_ROADMAP.md` Phases 3–5 and the
"commercial-grade" notes.

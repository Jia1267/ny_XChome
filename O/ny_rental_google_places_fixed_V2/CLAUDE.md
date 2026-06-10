# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file in sync
with the code — it is the first thing future sessions read.

## Project

**UniNest** (repo name: NY Rental Map V2) — a Next.js (App Router) + React + TypeScript
app for discovering NYC student rentals near Columbia, NYU, Baruch, and Pratt. Map-first
UI with commute filters, listing-confidence ("trust") metadata, nearby POIs (Google
Places), unit comparison, a rent-split calculator, an advanced share-budget filter, a
shareable listings page, and lead capture. There is a password-gated `/admin` operations
panel.

Brand: user-facing name is **UniNest**. Assets: `public/logo-icon.svg` (SVG recreation
of the house mark — topbar; `public/favicon.svg` is the navy tile variant),
`public/logo-wordmark.png` (designer's cursive wordmark, transparent bg — admin login,
og-image), `public/og-image.png` (composed 1200×630 share card; **PNG, not SVG** —
WeChat/FB/Twitter don't render SVG og:images). The designer's original wordmark is
backed up at `.claude/logo-wordmark-original.png`.

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
  backtick continuation) or the Bash tool for POSIX. `node`/`npm` are **not** on the
  non-interactive agent PATH, but they live at `C:\Program Files\nodejs` — prefix the
  PATH and run directly: `$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; npm run
  typecheck` (works for test/build too; `.claude/launch.json` + `.claude/dev-launch.cmd`
  use the same trick for the preview dev server). Verify yourself, don't assume.
- **Lean-dependency bias.** Most hardening is hand-written (validation, not zod;
  shared rate limiting via Upstash REST `fetch`, no client lib). The one installed
  monitoring dep is **`@sentry/nextjs`** (config at repo root: `sentry.{client,server,
  edge}.config.ts` + `instrumentation.ts`; `next.config.mjs` is wrapped in
  `withSentryConfig`; disabled unless `NEXT_PUBLIC_SENTRY_DSN` is set). `npm install`
  works from agent shells (PATH-prefix trick below) but network can be flaky
  (ECONNRESET → retry with `--fetch-retries=5`). When a task genuinely needs another
  dependency (Auth.js, Stripe, Playwright), say so explicitly — don't fake it with a
  fragile shim silently.

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
- `app/robots.ts`, `app/sitemap.ts` — SEO (sitemap includes `/listings`, `/legal` + each
  legal page, and each building).
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
  [`AdminLogin.tsx`](components/AdminLogin.tsx), [`ConsentBanner.tsx`](components/ConsentBanner.tsx)
  (first-visit privacy notice, mounted in `app/layout.tsx`).
- [`components/useDialog.ts`](components/useDialog.ts) — `useFocusTrap` (modal: trap Tab,
  focus first control, Esc closes + restores focus) and `useEscapeKey` (non-modal: Esc only).
- **Code-splitting**: `RentalApp` lazy-loads `DetailPanel`, `CompareDock`, `LeadModal`, and
  `AdvancedSearch` via `next/dynamic` — the first-paint bundle is just the map + chrome;
  those chunks load on demand. Keep heavy/non-first-paint UI lazy.

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
- [`lib/api-guard.ts`](lib/api-guard.ts):
  - `clientIp` — anti-spoof: prefers platform-set headers (`x-vercel-forwarded-for`,
    then `x-real-ip`); the `x-forwarded-for` fallback takes the **last** hop (appended
    by the trusted proxy), never the client-controlled first entry.
  - `isAllowedOrigin` — same-origin always allowed; cross-origin checked against
    `ALLOWED_APP_ORIGINS`; **fails open** when unset so the site's own calls never break.
  - `rateLimitShared(key, limit, windowMs)` — **the limiter routes should use.** When
    `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` are set it runs a fixed-window
    counter in Upstash Redis via plain `fetch` (no npm dep; pipeline INCR/PEXPIRE-NX/PTTL,
    2s timeout), shared across serverless instances. Unset or on any Upstash error it
    falls back to the in-memory `rateLimit` (per-instance, best-effort) so requests never
    fail because the limiter is down. Used by `leads`, `analytics`, and `admin/login`
    (5 attempts / 15 min per IP — brute-force guard).
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
- Sheet cache + Places refresh cache are **per-instance memory** in prod; rate limiting
  is per-instance too **unless** Upstash REST env vars are set (then it's shared — see
  Request guards). Migrating the remaining caches to KV is the main scaling item.

### i18n
- [`lib/i18n.ts`](lib/i18n.ts) holds `copy.en` / `copy.zh` and the `CopyKey`/`Translate`
  types. **The two languages MUST have identical key sets** — `copy[language][key]` is a
  typed union index; a missing key breaks typecheck. RentalApp/ListingsView use this table.
- Some newer components (`AdvancedSearch`, `MatchingResultsPanel`, `ConsentBanner`)
  carry a **local** `copy` table keyed by `language` instead of the global
  one, to avoid global-parity churn. Either pattern is fine; match the file you're editing.

### Legal & compliance
- [`lib/legal.ts`](lib/legal.ts) holds all legal copy as data: `LegalPage[]` with
  `effectiveDate` and `sections` of `{ title, body: string[], bullets? }`. 11 pages —
  Terms, Privacy (CCPA/CPRA + NY SHIELD), Cookie, Fair Housing, Agency & Standardized
  Operating Procedures (NY RPL §442-h), Accessibility (ADA/WCAG), plus fees/data/platform/
  contact/maps disclaimers. Rendered by `app/legal/[slug]/page.tsx`.
- These are **industry-aligned templates, NOT final legal text**: counsel review is
  required before launch — do not present them as final. Operator identity (legal name,
  privacy/contact emails) is **env-driven**: `OPERATOR_LEGAL_NAME`,
  `OPERATOR_PRIVACY_EMAIL`, `OPERATOR_CONTACT_EMAIL` (read at module load in
  `lib/legal.ts`). Unset → bracketed placeholders render as-is and `/admin` shows a
  warning via `productionEnvProblems()`. A few counsel-decision placeholders (arbitration
  clause, retention periods, agency licensing) intentionally remain in the text.

### Accessibility (a11y)
- Dialogs/panels use the hooks in [`components/useDialog.ts`](components/useDialog.ts).
  True modals (`LeadModal`, image zoom) use `useFocusTrap` (Tab trap, initial focus,
  Esc closes + restores focus, `role="dialog"`/`aria-modal`); non-modal side panels
  (`AdvancedSearch`, `DetailPanel`) use `useEscapeKey` (Esc only, no trap). Keep new
  dialogs consistent. Not yet covered: skip-links, map-marker keyboard nav, full contrast audit.

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
  `.test-dist/`. Name `*.test.ts` under `tests/`. Coverage is **lib-only** but covers each
  route's decision logic without importing the Next runtime: rent-split, filter-floorplans,
  validation, api-guard, admin-auth, persistence-policy, public-dataset, server-store,
  google-sheets-write. Handler integration / component / E2E need Playwright (not added).
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
UPSTASH_REDIS_REST_URL          # optional: enables shared cross-instance rate limiting
UPSTASH_REDIS_REST_TOKEN        # optional: Upstash REST token (pairs with the URL)
OPERATOR_LEGAL_NAME             # legal-page operator identity (else placeholders render)
OPERATOR_PRIVACY_EMAIL          # privacy contact on legal pages
OPERATOR_CONTACT_EMAIL          # general contact on legal pages
NEXT_PUBLIC_SENTRY_DSN          # optional: enables Sentry (unset = SDK fully disabled)
SENTRY_AUTH_TOKEN               # optional, build-time only: source-map upload
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
Data layer is CSV/Sheets (needs a real DB); Sheet/Places caches are in-memory (need KV;
rate limiting is already shared **when Upstash env is configured**, in-memory otherwise);
single admin password (needs multi-role auth — Auth.js/Clerk); legal pages are
**template drafts** (operator identity is env-driven now, but counsel review is still
required); tests are lib-only (need
handler/component/E2E via Playwright); error monitoring is wired (`@sentry/nextjs`) but
inert until `NEXT_PUBLIC_SENTRY_DSN` is set; no CSP; images use
native `<img>` (blanket `next/image` is impractical with data-driven external hosts —
needs an image CDN); a11y covers dialogs but not skip-links / map-marker keyboard nav /
full contrast audit. The remaining items mostly need a deliberate `npm install` (Vercel
KV, Sentry, Auth.js, Playwright). See `DEVELOPMENT_ROADMAP.md` and the commercial-grade notes.

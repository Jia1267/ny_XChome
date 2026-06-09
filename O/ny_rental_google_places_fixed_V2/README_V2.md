# NY Rental Map V2

This folder is the Next.js + React + TypeScript rebuild of the previous Leaflet prototype.

## What changed

- Frontend stack: Next.js App Router, React, TypeScript.
- Data remains compatible with the supplied CSV files in `data/`.
- Building and unit pages show listing confidence:
  - Last updated
  - Data source
  - Price confirmation status
  - Fee confirmation status
  - Availability status
  - Availability checked time
  - Leasing or agent contact
- Private `/admin` operations panel:
  - Password-gated dashboard
  - Leads and analytics summary
  - Building/unit trust tables
  - Google Sheet sync status
- Mobile-first layout:
  - Full-screen map
  - Building and unit details become a bottom sheet
  - Unit comparison becomes a full-screen comparison view on mobile
  - Contact button is fixed at the bottom on mobile
- Trial analytics:
  - Page views
  - School filter clicks
  - Building clicks
  - Unit clicks
  - Share clicks
  - Contact clicks
  - Lead submissions
  - Top schools, buildings, budgets, and conversion rate
- Legal pages:
  - Fair Housing
  - Privacy
  - Fees disclaimer
  - Data disclaimer
  - Platform role
  - Lead contact consent
  - Google and map data notice
- Google Places:
  - API key is server-only through `/api/places/nearby`
  - Frontend reads cached POI data first
  - A refresh can be triggered server-side with `?refresh=1` when `GOOGLE_PLACES_API_KEY` is configured

## Run locally

```bash
npm install
npm run dev
```

The default local URL is:

```txt
http://localhost:5503
```

## Environment

Copy `.env.example` to `.env.local` and fill server-only values.

```txt
NEXT_PUBLIC_SITE_URL=https://your-production-domain.example
GOOGLE_PLACES_API_KEY=your_server_side_key
ALLOWED_APP_ORIGINS=http://localhost:5503
ADMIN_PASSWORD=replace-with-a-strong-random-password
ADMIN_SESSION_SECRET=replace-with-at-least-32-random-bytes
ADMIN_SYNC_TOKEN=replace-with-at-least-32-random-bytes
GOOGLE_SHEET_ID=your_private_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ENABLE_LOCAL_DATA_STORE=0
```

Do not use `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`. A `NEXT_PUBLIC_*` key is bundled into browser code.

Do not commit `.env.local`. It is ignored by Git and must stay server-only.

## Admin panel

Open:

```txt
http://localhost:5503/admin
```

Change `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and `ADMIN_SYNC_TOKEN` to strong random values before any public launch.

The admin panel is meant for you and broker partners only. It shows operational proof that can support future pricing:

- Visits
- School clicks
- Building clicks
- Unit clicks
- Share clicks
- Contact clicks
- Lead conversion
- Popular schools, budgets, and buildings
- Recent leads
- Listing confidence gaps

## Google Sheet sync

Keep the Google Sheet private. Do not publish the Sheet to the web and do not read it from browser JavaScript.

Create these exact tabs:

```txt
buildings
units
photos
nearby_pois
contacts
agents
data_sources
change_log
leads
analytics_events
```

Each `building` and `unit` row should include:

```txt
last_updated_at
source_name
source_url
price_status
fee_status
availability_status
availability_checked_at
contact_id
updated_by
internal_notes
```

Use values like `verified`, `provided`, `needs_confirmation`, or `unknown` for status fields.

For a 4-hour refresh, run a scheduled POST request to:

```txt
/api/admin/sync
```

with this header:

```txt
x-admin-sync-token: your ADMIN_SYNC_TOKEN
```

Local development can save a server-side cache at `.data/google-sheets-cache.json`. In production, local `.data` persistence is disabled by default; the app reads Google Sheets directly when configured and falls back to local CSV if Sheets is unavailable during build.

Lead submissions append directly to the private `leads` tab when Google service account credentials are configured. Analytics events append to `analytics_events`. The service account needs Editor access to the Sheet for these writes.

## Production data and performance

- The home page now sends only sanitized building summaries to the browser.
- Building units, photos, and nearby POIs are loaded on demand through `/api/buildings/[id]`.
- The share URL for a building is `/buildings/[id]`, with `?unit=...` for a unit.
- Local `.data` JSON storage is disabled in production unless `ENABLE_LOCAL_DATA_STORE=1` is set explicitly.
- Google Places refresh cache writes to `.places-cache` only in local development.

## Mobile launch QA checklist

Before launch, test on at least one real iPhone and one real Android phone in addition to browser mobile emulation.

Required checks:

- Home map loads without a blank screen or framework error overlay.
- Map view selector opens and closes without overflowing the right edge.
- School commute panel opens, shows all school and commute chips, and closes after choosing a commute option.
- Building marker opens the mobile bottom sheet, and unit cards load from `/api/buildings/[id]`.
- Nearby selector on a selected building stays within the viewport and can show restaurant, grocery, coffee, and subway filters.
- Compact compare pill does not cover the fixed contact button; two selected units open the full-screen compare panel.
- Lead form opens as a bottom floating panel, shows name, WeChat, school, budget, move-in date, interested unit, notes, cancel, and submit without horizontal scrolling.
- Submit a real test lead only against a staging/private Sheet, then confirm the row appears in the `leads` tab.
- Share button produces `/buildings/[id]` and preserves `?unit=...` when a unit is selected.
- Rotate the phone once and confirm the bottom sheet, compare panel, and lead panel remain usable.

Browser emulation evidence from development is useful, but it does not replace physical device QA for launch.

## Google Places safety checklist

Before production:

- Create a new Google Maps Platform key.
- Restrict the key to only the APIs needed, such as Places API.
- Restrict usage by production domain or backend environment.
- Set quota limits.
- Set budget alerts.
- Rotate any key that was pasted into chat, docs, screenshots, or client code.
- Cache Places results and refresh on a schedule, such as monthly.

## Data update workflow for agents

For the trial version, agents can send updated rows for:

- `buildings.csv`
- `units.csv`
- `photos.csv`
- `building_google_nearby_pois_500m.csv`

Production should move this into an admin dashboard backed by a database. Recommended next data fields:

- Agent company
- Agent name
- Agent WeChat
- Agent email
- Price verified at
- Fees verified at
- Availability verified at
- Internal notes
- Public notes
- Listing owner

## Current trial limitations

- Browser localStorage is still used for immediate UI analytics/lead feedback, but production server persistence uses Google Sheets when configured.
- If Google Sheets write credentials are not configured in production, lead submission returns a storage configuration error.
- Commute rings are estimates and not routing guarantees.
- Nearby POIs are cached and should be refreshed before showing to paying partners.

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
GOOGLE_PLACES_API_KEY=your_server_side_key
ALLOWED_APP_ORIGINS=http://localhost:5503
ADMIN_PASSWORD=123456
ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_SYNC_TOKEN=replace-with-a-private-cron-token
GOOGLE_SHEET_ID=your_private_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Do not use `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`. A `NEXT_PUBLIC_*` key is bundled into browser code.

## Admin panel

Open:

```txt
http://localhost:5503/admin
```

The trial password defaults to `123456`. Change `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` before any public launch.

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

The sync saves a server-side cache at `.data/google-sheets-cache.json`. The public site reads only the sanitized dataset generated from that cache.

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

- Analytics and leads use browser localStorage plus local server JSON files in `.data/`.
- In serverless deployment, `.data/` is not persistent. Use Supabase, Postgres, Airtable, HubSpot, or Google Sheets for production.
- Commute rings are estimates and not routing guarantees.
- Nearby POIs are cached and should be refreshed before showing to paying partners.

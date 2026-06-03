NYC Student Rental Map - First Public MVP

This version keeps the Clean Leaflet Enterprise MVP architecture:
- top search
- filters/list panel
- Leaflet map
- marker clustering for lifestyle POIs
- detail drawer
- local CSV data loading
- no live Overpass requests during interaction

Updated to match our B2B first-release plan:
- Student-first brand and copy.
- Building overview explains location, amenities, data quality, and compliance reminders.
- Units are clickable and open a unit detail view.
- Unit detail includes floor plan, real unit photos if available, rent calculator, roommate split, share link, and inquiry message preparation.
- No fake floor plan is shown when real data is missing.
- Nearby tools use local community_pois.csv.
- Lead form is front-end only in V1 and prepares an email-style inquiry message. A backend/CRM can be added later.

Run locally:
1. Open terminal in this folder.
2. Run: python -m http.server 5500
3. Open: http://localhost:5500

Important:
This site is an information and discovery tool only. It does not collect rent, deposits, or sign leases. All fees, terms, availability, floor plans, photos, and flex wall/living-room occupancy policies must be verified in writing.

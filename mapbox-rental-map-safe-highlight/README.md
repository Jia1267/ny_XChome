# Mapbox Rental Map - Safe Building Highlight

This version keeps each rental marker at the exact `lat,lng` from `public/listings.csv`.
It highlights the closest Mapbox 3D building only when it is within a safe distance, so markers will not jump to the wrong borough or Long Island.

Run:

```powershell
npm install
copy .env.example .env
notepad .env
npm run dev
```

Fill `.env` with your Mapbox public token:

```env
VITE_MAPBOX_TOKEN=pk.your_token_here
```

If a selected building does not highlight, its CSV coordinate is probably not close enough to a Mapbox building footprint. Manually adjust `lat,lng` to the building center.

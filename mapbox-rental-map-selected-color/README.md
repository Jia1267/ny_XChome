# NY Rental Map - Mapbox Fixed Version

This version fixes the previous issues:

- Uses Mapbox geocoding once per building address and caches coordinates in browser localStorage.
- Removes the fake blue 3D cube. The 3D buildings are now Mapbox's real grey building layer.
- Nearby Restaurants, Stores, and Subway use OpenStreetMap/Overpass as a working free fallback.
- Subway also turns on an OpenRailwayMap overlay.
- Clicking the same building again, the Back button, or the panel close button returns to the overview map.

## Run

```powershell
npm install
copy .env.example .env
notepad .env
npm run dev
```

Put your Mapbox public token in `.env`:

```env
VITE_MAPBOX_TOKEN=pk.your_token_here
```

## Data

Edit `public/listings.csv`. If coordinates are inaccurate, the app will try to geocode the address and cache the result locally. For production, save verified `lat,lng` into the database/table.

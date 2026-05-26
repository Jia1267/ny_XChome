# NY / NJ / LIC Mapbox 3D Rental Map

A React + Vite + Mapbox GL JS demo for a building-first rental map.

## Features

- Mapbox clean light / streets / satellite styles
- Grey Mapbox 3D buildings when zoomed in
- Rental buildings from `public/listings.csv`
- Custom building-shaped markers
- Zoom-out cluster labels like "12 buildings"
- Click a building to fly in and open the right detail panel
- Nearby buttons: Restaurants, Stores, Subway
- Nearby search uses Mapbox POI/geocoding search with 7-day browser cache

## Run

```powershell
npm install
copy .env.example .env
```

Open `.env` and set:

```env
VITE_MAPBOX_TOKEN=pk.your_mapbox_public_token_here
```

Then:

```powershell
npm run dev
```

Open the local URL from the terminal, usually:

```text
http://localhost:5173/
```

## Data

Edit:

```text
public/listings.csv
```

Use the same `building_id` for multiple units in the same building.

Recommended important fields:

```csv
building_id,building_name,room_num,address,city_area,floor_plan,price,link,lat,lng,lease_term,available_date,concession,utilities,amenities,nearby,status,height
```

`lat` and `lng` are important for fast loading. Do not geocode addresses every time a user opens the site.

## Notes

- This demo uses Mapbox's built-in 3D building layer for realistic grey city buildings.
- The highlighted rental footprint is an approximate small polygon around the listing point, because matching each listing address to the exact Mapbox building footprint requires a more advanced backend or building-footprint dataset.
- Nearby POI search is triggered only when the user clicks the buttons, not automatically.

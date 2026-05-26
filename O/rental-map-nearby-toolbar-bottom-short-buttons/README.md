# NY Rental Map - Free/Open Nearby POI Version

This version uses a free/open stack:

- Leaflet for the map
- CARTO/OpenStreetMap/Esri tiles for base maps
- OpenStreetMap Overpass API for nearby restaurants, stores, and subway stations
- OpenRailwayMap tile overlay for the subway/rail line layer
- `listings.csv` as the listing data source

## Run

```bash
cd rental-map-open-nearby
python -m http.server 5500
```

Open:

```text
http://localhost:5500
```

## How to use

1. Click one building marker.
2. The map zooms to the building and the right detail panel opens.
3. Click:
   - Restaurants
   - Stores
   - Subway
   - Clear

## Notes

- This version does not need Mapbox token or Google API key.
- Nearby POI search requires internet access because it queries Overpass API in real time.
- Overpass can be slow or temporarily busy. For production, use a backend cache.
- Subway line layer is an OpenRailwayMap overlay; nearby station points are highlighted within 1 mile.
- Keep `lat` and `lng` in `listings.csv`; this demo does not geocode addresses automatically.

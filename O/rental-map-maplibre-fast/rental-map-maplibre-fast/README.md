# NY Rental Map - MapLibre Final Version

This is the upgraded version using **React + Vite + MapLibre GL JS**.

It is designed for the final target effect:

- Default 2D Clean light map
- Optional OpenStreetMap and Satellite styles
- Zoom out shows clusters like "12 buildings"
- Zoom in shows real WebGL 3D building extrusions for rental buildings
- Hover over a building to highlight it
- Click a building to zoom/pitch to it and open the right detail panel
- Bottom toolbar for Restaurants, Stores, Subway, and Clear
- Restaurants: OpenStreetMap/Overpass within 200m
- Stores: OpenStreetMap/Overpass within 500m
- Subway: highlights nearby stations within 1 mile and turns on an OpenRailwayMap subway/rail layer
- Data comes from `public/listings.csv`

## Run

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite, usually:

```text
http://localhost:5173
```

## Update data

Edit:

```text
public/listings.csv
```

Important columns:

```csv
building_id,building_name,room_num,address,city_area,Floor Plan,price,link,lat,lng,utilities,amenities,nearby,lease_term,available_date,concession
```

Use the same `building_id` for multiple units in the same building.

## Notes

This version does not require a Mapbox token. It uses open/free map tiles and OpenStreetMap-based data.
For a production commercial site, use a stable tile provider and add backend caching for Overpass/POI requests.


## Performance optimized changes

This version uses shorter camera animations, disables tile fade, delays 3D extrusions until zoom 14, and shows simple rental dots/clusters at lower zoom levels.

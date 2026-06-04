NY Rental Map - Clean Leaflet Enterprise MVP

Run locally:
1. Open terminal in this folder.
2. Run: python -m http.server 5500
3. Open: http://localhost:5500

Files:
- index.html: clean product layout with top search, filters, listing panel, map panel, detail drawer.
- styles.css: organized design system and responsive UI.
- app.js: normalized CSV loading, local POI search, marker clustering, filters, listing rendering, detail drawer.
- buildings.csv / units.csv / photos.csv / community_pois.csv: same data source files.

Main improvements:
- Leaflet.markercluster is added for POI performance.
- Building markers are clean rent pills instead of heavy custom building icons.
- Selecting a building updates only active markers, not all markers.
- Nearby tools use local community_pois.csv data instead of live Overpass requests.
- Top search, school quick filters, side listing panel, and detail drawer make it closer to a real rental platform.
- Layer selector is collapsed by default.
- CSS is organized by sections and avoids repeated competing definitions.
Latest update notes
-------------------
- The page is now map-first: the left search/filter/list panel and top search box are hidden.
- The old Rent mode is now Building mode.
- Nearby tools are Restaurants, Grocery, Coffee, Subway.
- Subway view shows the rail/subway overlay and caps nearby station markers to the nearest 4 per building.
- Unit rows are clickable again. Unit detail pages use photos.csv floorplan rows by unit_id first, then reuse the same building/floor_plan image when possible.
- photos.csv currently contains 18 building_primary images and 106 floorplan images. Units without a matching floorplan image show a clear placeholder.
- Google nearby POIs should be refreshed into building_google_nearby_pois_500m.csv about once per month.

Monthly Google nearby POI update
--------------------------------
1. Enable billing and Places API in Google Cloud.
2. Restrict the API key to Places API and keep a monthly budget alert.
3. In PowerShell, from this folder:

   $env:GOOGLE_PLACES_API_KEY="YOUR_KEY"
   python generate_google_nearby_pois.py

4. Do not paste the real API key into the CSV, app.js, index.html, or README.

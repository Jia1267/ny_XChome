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

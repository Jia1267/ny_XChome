NY Rental Map - Debugged relational CSV version

Run:
  python -m http.server 5500
  open http://localhost:5500
  press Ctrl+F5 if the browser cached an old app.js/styles.css

This version reads:
  buildings.csv        34 buildings
  units.csv            734 units
  photos.csv           building photos + 106 unit floorplan images
  community_pois.csv   school, transit, Chinese grocery, Chinese restaurant, shopping mall POIs

Main fixes:
  - app.js no longer reads listings.csv
  - all 34 buildings are rendered from buildings.csv
  - building photos and unit floorplans are loaded from photos.csv
  - school POIs use larger badge-style icons and stay above other POIs when zoomed out
  - non-school POIs fade/hide when zoomed out so schools and buildings stay clear
  - legend added in the bottom-left corner

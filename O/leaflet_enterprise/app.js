/* =========================================================
   NY Rental Map · Clean Leaflet Enterprise MVP
   Goals:
   - no live POI fetch during user interaction
   - no full marker rerender on building select
   - clean state, filters, listing list, drawer, local nearby tools
   ========================================================= */

const CONFIG = {
  dev: ['localhost', '127.0.0.1'].includes(location.hostname),
  defaultCenter: [40.776, -73.965],
  defaultZoom: 11,
  poiRadius: {
    subway: 1609,
    chineseStore: 1200,
    chineseFood: 900,
    university: 2400,
    mall: 1600,
    community: 1200,
  },
  maxNearbyResults: 12,
};

const state = {
  buildings: [],
  units: [],
  photos: [],
  pois: [],
  buildingMap: new Map(),
  unitsByBuilding: new Map(),
  photosByBuilding: new Map(),
  photosByUnit: new Map(),
  buildingMarkers: new Map(),
  selectedId: null,
  activeNearbyType: null,
  activeSchool: '',
  filteredBuildings: [],
};

const els = {
  workspace: document.querySelector('.workspace'),
  listingList: document.getElementById('listingList'),
  resultCount: document.getElementById('resultCount'),
  dataSummary: document.getElementById('dataSummary'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  areaFilter: document.getElementById('areaFilter'),
  bedFilter: document.getElementById('bedFilter'),
  rentFilter: document.getElementById('rentFilter'),
  sortFilter: document.getElementById('sortFilter'),
  resetFilters: document.getElementById('resetFilters'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailContent: document.getElementById('detailContent'),
  closeDrawer: document.getElementById('closeDrawer'),
  nearbyToolbar: document.getElementById('nearbyToolbar'),
  nearbyBuildingName: document.getElementById('nearbyBuildingName'),
};

// -----------------------------
// Map setup
// -----------------------------
const map = L.map('map', {
  zoomControl: true,
  scrollWheelZoom: true,
  preferCanvas: true,
}).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);

const baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20,
}).addTo(map);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri',
  maxZoom: 19,
});

L.control.layers(
  { 'Clean map': baseLayer, Satellite: satelliteLayer },
  null,
  { position: 'topright', collapsed: true }
).addTo(map);

const buildingLayer = L.layerGroup().addTo(map);
const poiClusterLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 15,
  maxClusterRadius: 44,
}).addTo(map);
const nearbyLayer = L.layerGroup().addTo(map);
const radiusLayer = L.layerGroup().addTo(map);

// -----------------------------
// Utilities
// -----------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map(header => header.trim().replace(/^\uFEFF/, ''));
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
}

async function loadCSV(filename) {
  const url = CONFIG.dev ? `${filename}?v=${Date.now()}` : filename;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${filename} HTTP ${response.status}`);
  return parseCSV(await response.text());
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number) || number <= 0) return 'Ask';
  if (number >= 1000) return `$${Math.round(number / 100) / 10}k`;
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fullMoney(value) {
  const number = toNumber(value, NaN);
  return Number.isFinite(number) && number > 0
    ? number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : 'Ask agent';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function splitList(value) {
  return String(value || '').split(/[;|]/).map(item => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkingLabel(meters) {
  if (!Number.isFinite(meters)) return 'Nearby';
  const miles = meters / 1609.344;
  const minutes = Math.max(1, Math.round(meters / 80));
  return `${minutes} min walk · ${miles.toFixed(1)} mi`;
}

function minRent(building) {
  const rents = building.units.map(unit => unit.priceNum).filter(value => value > 0);
  return rents.length ? Math.min(...rents) : 0;
}

function maxRent(building) {
  const rents = building.units.map(unit => unit.priceNum).filter(value => value > 0);
  return rents.length ? Math.max(...rents) : 0;
}

function bedroomText(beds) {
  const number = toNumber(beds, 0);
  if (number <= 0) return 'Studio';
  return `${number}+ bed`;
}

function bathText(baths) {
  const number = toNumber(baths, 1);
  return `${Number.isInteger(number) ? number : number.toFixed(1)} bath`;
}

function normalizePoiType(category, name = '') {
  const c = String(category || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (c.includes('transit') || c.includes('subway') || c.includes('station') || n.includes(' station')) return 'subway';
  if (c.includes('restaurant') || c.includes('chinese_food')) return 'chineseFood';
  if (c.includes('grocery') || c.includes('supermarket') || c.includes('facility')) return 'chineseStore';
  if (c.includes('mall') || c.includes('shopping')) return 'mall';
  if (n.includes('university') || n.includes('college') || c.includes('university')) return 'university';
  return 'community';
}

// -----------------------------
// Data normalization
// -----------------------------
function buildData(buildingRows, unitRows, photoRows, poiRows) {
  const photosByBuilding = new Map();
  const photosByUnit = new Map();

  photoRows.forEach(photo => {
    if (!photo.photo_url) return;
    const normalized = { ...photo, photo_type: photo.photo_type || 'photo' };
    if (photo.unit_id) {
      const list = photosByUnit.get(photo.unit_id) || [];
      list.push(normalized);
      photosByUnit.set(photo.unit_id, list);
    } else if (photo.building_id) {
      const list = photosByBuilding.get(photo.building_id) || [];
      list.push(normalized);
      photosByBuilding.set(photo.building_id, list);
    }
  });

  const unitsByBuilding = new Map();
  const units = unitRows.map(unit => {
    const normalized = {
      ...unit,
      unit_id: unit.unit_id,
      building_id: unit.building_id,
      priceNum: toNumber(unit.gross_rent || unit.net_effective_rent, 0),
      bedsNum: toNumber(unit.beds, 0),
      bathsNum: toNumber(unit.baths, 1),
      sqftNum: toNumber(unit.sqft, NaN),
      photos: photosByUnit.get(unit.unit_id) || [],
    };
    return normalized;
  }).filter(unit => unit.unit_id && unit.building_id && unit.priceNum > 0);

  units.forEach(unit => {
    const list = unitsByBuilding.get(unit.building_id) || [];
    list.push(unit);
    unitsByBuilding.set(unit.building_id, list);
  });

  const buildings = buildingRows.map(row => {
    const lat = toNumber(row.lat, NaN);
    const lng = toNumber(row.lng, NaN);
    const unitsForBuilding = (unitsByBuilding.get(row.building_id) || []).sort((a, b) => a.priceNum - b.priceNum);
    const photos = [...(photosByBuilding.get(row.building_id) || [])];
    if (row.primary_photo_url) {
      photos.unshift({ photo_url: row.primary_photo_url, photo_type: 'primary', caption: row.building_name });
    }
    return {
      ...row,
      id: row.building_id,
      building_name: row.building_name || row.address || row.building_id,
      lat,
      lng,
      units: unitsForBuilding,
      photos: dedupePhotos(photos),
      minRent: unitsForBuilding.length ? Math.min(...unitsForBuilding.map(unit => unit.priceNum)) : 0,
      maxRent: unitsForBuilding.length ? Math.max(...unitsForBuilding.map(unit => unit.priceNum)) : 0,
    };
  }).filter(building => building.id && Number.isFinite(building.lat) && Number.isFinite(building.lng) && building.units.length);

  const poiMap = new Map();
  poiRows.forEach(row => {
    const lat = toNumber(row.lat, NaN);
    const lng = toNumber(row.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !row.name) return;
    const type = normalizePoiType(row.category || row.type, row.name);
    const key = `${type}|${String(row.name).toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (!poiMap.has(key)) poiMap.set(key, { ...row, id: row.poi_id || key, type, lat, lng });
  });

  state.buildings = buildings;
  state.units = units;
  state.photos = photoRows;
  state.pois = [...poiMap.values()];
  state.buildingMap = new Map(buildings.map(building => [building.id, building]));
  state.unitsByBuilding = unitsByBuilding;
  state.photosByBuilding = photosByBuilding;
  state.photosByUnit = photosByUnit;
  state.filteredBuildings = buildings;
}

function dedupePhotos(photos) {
  const seen = new Set();
  return photos.filter(photo => {
    if (!photo.photo_url || seen.has(photo.photo_url)) return false;
    seen.add(photo.photo_url);
    return true;
  });
}

// -----------------------------
// Icons and markers
// -----------------------------
function rentIcon(building, active = false) {
  return L.divIcon({
    className: '',
    html: `<div class="rentMarker ${active ? 'active' : ''}">${escapeHtml(money(minRent(building)))}</div>`,
    iconSize: [82, 36],
    iconAnchor: [41, 18],
    popupAnchor: [0, -18],
  });
}

function poiIcon(type) {
  const label = {
    subway: 'M',
    university: '🎓',
    chineseStore: '🛒',
    chineseFood: '🍜',
    mall: '🛍',
    community: '•',
  }[type] || '•';
  return L.divIcon({
    className: '',
    html: `<div class="poiPin ${escapeHtml(type)}">${label}</div>`,
    iconSize: type === 'university' ? [46, 52] : [34, 42],
    iconAnchor: type === 'university' ? [23, 46] : [17, 34],
    popupAnchor: [0, -28],
  });
}

function renderBuildingMarkers(buildings = state.filteredBuildings) {
  buildingLayer.clearLayers();
  state.buildingMarkers.clear();

  const bounds = [];
  buildings.forEach(building => {
    const marker = L.marker([building.lat, building.lng], {
      icon: rentIcon(building, state.selectedId === building.id),
      zIndexOffset: state.selectedId === building.id ? 1500 : 900,
      keyboard: true,
      title: building.building_name,
    });
    marker.bindPopup(`
      <div class="popupTitle">${escapeHtml(building.building_name)}</div>
      <div class="popupSub">${escapeHtml(building.neighborhood || building.city_area || 'New York')} · ${building.units.length} units · From ${fullMoney(minRent(building))}</div>
    `);
    marker.on('click', () => selectBuilding(building.id));
    marker.on('mouseover', () => marker.setIcon(rentIcon(building, true)));
    marker.on('mouseout', () => {
      if (state.selectedId !== building.id) marker.setIcon(rentIcon(building, false));
    });
    marker.addTo(buildingLayer);
    state.buildingMarkers.set(building.id, marker);
    bounds.push([building.lat, building.lng]);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [55, 55], maxZoom: 12 });
}

function updateActiveMarker(previousId, nextId) {
  if (previousId && state.buildingMarkers.has(previousId)) {
    const previous = state.buildingMap.get(previousId);
    state.buildingMarkers.get(previousId).setIcon(rentIcon(previous, false));
    state.buildingMarkers.get(previousId).setZIndexOffset(900);
  }
  if (nextId && state.buildingMarkers.has(nextId)) {
    const next = state.buildingMap.get(nextId);
    state.buildingMarkers.get(nextId).setIcon(rentIcon(next, true));
    state.buildingMarkers.get(nextId).setZIndexOffset(1500);
    state.buildingMarkers.get(nextId).openPopup();
  }
}

function renderDefaultPoiLayer(mode = 'life') {
  poiClusterLayer.clearLayers();
  const typesByMode = {
    rent: [],
    school: ['university'],
    life: ['university', 'chineseStore', 'chineseFood', 'mall'],
  };
  const allowed = typesByMode[mode] || typesByMode.life;
  if (!allowed.length) return;

  state.pois
    .filter(poi => allowed.includes(poi.type))
    .forEach(poi => {
      const marker = L.marker([poi.lat, poi.lng], {
        icon: poiIcon(poi.type),
        zIndexOffset: poi.type === 'university' ? 1200 : 320,
      }).bindPopup(`
        <div class="popupTitle">${escapeHtml(poi.name)}</div>
        <div class="popupSub">${escapeHtml(poi.address || poi.category || '')}</div>
      `);
      poiClusterLayer.addLayer(marker);
    });
}

// -----------------------------
// Filters and list rendering
// -----------------------------
function populateFilters() {
  const areas = unique(state.buildings.map(building => building.neighborhood || building.city_area)).sort();
  els.areaFilter.innerHTML = '<option value="">All areas</option>'
    + areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');
}

function currentFilters() {
  return {
    query: els.searchInput.value.trim().toLowerCase(),
    area: els.areaFilter.value,
    beds: els.bedFilter.value,
    rent: toNumber(els.rentFilter.value, 0),
    sort: els.sortFilter.value,
    school: state.activeSchool,
  };
}

function applyFilters({ fitMap = true } = {}) {
  const filters = currentFilters();
  let buildings = state.buildings.filter(building => {
    const searchable = [
      building.building_name,
      building.address,
      building.neighborhood,
      building.city_area,
      building.transit_summary,
      building.nearby_summary,
    ].join(' ').toLowerCase();

    if (filters.query && !searchable.includes(filters.query)) return false;
    if (filters.area && (building.neighborhood || building.city_area) !== filters.area) return false;
    if (filters.rent && minRent(building) > filters.rent) return false;
    if (filters.beds !== '') {
      const requested = Number(filters.beds);
      const hasBed = building.units.some(unit => requested === 2 ? unit.bedsNum >= 2 : unit.bedsNum === requested);
      if (!hasBed) return false;
    }
    if (filters.school) {
      const schoolPoi = findSchoolPoi(filters.school);
      if (schoolPoi) {
        const distance = haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng);
        if (distance > 4500) return false;
      }
    }
    return true;
  });

  buildings = sortBuildings(buildings, filters.sort, filters.school);
  state.filteredBuildings = buildings;
  renderListingList(buildings);
  renderBuildingMarkers(buildings);
  updateCounts(buildings);
  if (fitMap) fitFilteredBounds(buildings);
}

function sortBuildings(buildings, sort, school) {
  const copy = [...buildings];
  const schoolPoi = school ? findSchoolPoi(school) : null;
  if (sort === 'rentAsc') return copy.sort((a, b) => minRent(a) - minRent(b));
  if (sort === 'unitsDesc') return copy.sort((a, b) => b.units.length - a.units.length);
  if (sort === 'nameAsc') return copy.sort((a, b) => a.building_name.localeCompare(b.building_name));
  return copy.sort((a, b) => {
    const scoreA = recommendedScore(a, schoolPoi);
    const scoreB = recommendedScore(b, schoolPoi);
    return scoreB - scoreA;
  });
}

function recommendedScore(building, schoolPoi) {
  let score = 0;
  score += Math.min(building.units.length, 20) * 4;
  score -= minRent(building) / 1000;
  if (building.photos.length) score += 5;
  if (building.amenities) score += 4;
  if (schoolPoi) score -= haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng) / 500;
  return score;
}

function findSchoolPoi(schoolKey) {
  const key = schoolKey.toLowerCase();
  return state.pois.find(poi => poi.type === 'university' && poi.name.toLowerCase().includes(key));
}

function fitFilteredBounds(buildings) {
  if (!buildings.length) return;
  const bounds = buildings.map(building => [building.lat, building.lng]);
  map.fitBounds(bounds, { padding: [70, 70], maxZoom: 13 });
}

function renderListingList(buildings) {
  if (!buildings.length) {
    els.listingList.innerHTML = `<div class="listingCard"><strong>No results found</strong><div class="cardFooter"><span>Try another area, rent, or school.</span></div></div>`;
    return;
  }
  els.listingList.innerHTML = buildings.map(building => listingCardHtml(building)).join('');
}

function listingCardHtml(building) {
  const area = [building.neighborhood, building.city_area].filter(Boolean).join(' · ') || 'New York';
  const unitTypes = unique(building.units.map(unit => bedroomText(unit.bedsNum))).slice(0, 3).join(' / ');
  return `
    <button class="listingCard ${state.selectedId === building.id ? 'active' : ''}" type="button" data-building-id="${escapeHtml(building.id)}">
      <div class="listingTop">
        <div class="listingTitle">
          <strong>${escapeHtml(building.building_name)}</strong>
          <span>${escapeHtml(building.address)}</span>
        </div>
        <span class="rentBadge">${escapeHtml(money(minRent(building)))}+</span>
      </div>
      <div class="cardMeta">
        <span>${building.units.length} units</span>
        <span>${escapeHtml(unitTypes || 'Units')}</span>
        <span>${escapeHtml(area)}</span>
      </div>
      <div class="cardFooter">
        <span>${escapeHtml(building.transit_summary || building.nearby_summary || 'Transit info available')}</span>
        <span>View</span>
      </div>
    </button>
  `;
}

function updateCounts(buildings) {
  els.resultCount.textContent = `${buildings.length} buildings`;
  els.dataSummary.textContent = `${state.units.length} units · ${state.pois.length} POIs`;
}

// -----------------------------
// Selection and drawer
// -----------------------------
function selectBuilding(id, { fly = true } = {}) {
  const building = state.buildingMap.get(id);
  if (!building) return;

  const previousId = state.selectedId;
  state.selectedId = id;
  state.activeNearbyType = null;

  updateActiveMarker(previousId, id);
  renderListingList(state.filteredBuildings);
  openDrawer(building);
  showNearbyToolbar(building);
  clearNearby(false);

  if (fly) {
    map.flyTo([building.lat, building.lng], Math.max(map.getZoom(), 15), {
      duration: 0.65,
      easeLinearity: 0.25,
    });
  }

  const url = new URL(location.href);
  url.searchParams.set('building', id);
  history.replaceState({}, '', url);
}

function openDrawer(building) {
  els.workspace.classList.add('drawerOpen');
  els.detailDrawer.classList.remove('hidden');
  els.detailContent.innerHTML = detailHtml(building);
  requestAnimationFrame(() => map.invalidateSize());
}

function closeDrawer() {
  const previousId = state.selectedId;
  state.selectedId = null;
  state.activeNearbyType = null;
  updateActiveMarker(previousId, null);
  clearNearby(false);
  els.workspace.classList.remove('drawerOpen');
  els.detailDrawer.classList.add('hidden');
  els.nearbyToolbar.classList.add('hidden');
  renderListingList(state.filteredBuildings);
  const url = new URL(location.href);
  url.searchParams.delete('building');
  history.replaceState({}, '', url);
  requestAnimationFrame(() => map.invalidateSize());
}

function detailHtml(building) {
  const photos = building.photos.slice(0, 4);
  const amenities = splitList(building.amenities).slice(0, 9);
  const security = splitList(building.security_features).slice(0, 4);
  const nearestTransit = nearbyItemsFor(building, 'subway', CONFIG.poiRadius.subway).slice(0, 4);
  const nearestSchools = nearbyItemsFor(building, 'university', CONFIG.poiRadius.university).slice(0, 4);
  return `
    <div class="detailContentInner">
      <div class="heroPhotos">
        ${[0,1,2,3].map(index => photoTileHtml(photos[index], building, index)).join('')}
      </div>

      <section class="detailHero">
        <h2>${escapeHtml(building.building_name)}</h2>
        <p>${escapeHtml(building.address)}<br>${escapeHtml([building.neighborhood, building.city_area].filter(Boolean).join(' · ') || 'New York')}</p>
        <div class="detailPriceRow">
          <div><span>Starting rent</span><br><strong>${fullMoney(minRent(building))}</strong></div>
          <span>${building.units.length} available units</span>
        </div>
        <div class="ctaRow">
          ${building.availability_url ? `<a class="ctaButton" href="${escapeHtml(building.availability_url)}" target="_blank" rel="noreferrer">Check availability</a>` : `<button class="ctaButton" type="button">Ask availability</button>`}
          ${building.official_website ? `<a class="ctaButton secondary" href="${escapeHtml(building.official_website)}" target="_blank" rel="noreferrer">Official site</a>` : `<button class="ctaButton secondary" type="button">Share</button>`}
        </div>
      </section>

      <section>
        <div class="sectionTitle">Building overview</div>
        <div class="factGrid">
          <div class="factBox"><span>Rent range</span><strong>${fullMoney(minRent(building))} - ${fullMoney(maxRent(building))}</strong></div>
          <div class="factBox"><span>Lease</span><strong>${escapeHtml(building.lease_term_default || 'Ask agent')}</strong></div>
          <div class="factBox"><span>Utilities</span><strong>${escapeHtml(building.utilities_policy || 'Ask agent')}</strong></div>
          <div class="factBox"><span>Verification</span><strong>${escapeHtml(building.verification_status || 'CSV data')}</strong></div>
        </div>
        <p class="disclaimer">${escapeHtml(building.description || 'Rental building information is shown from the current CSV data. Confirm final price, availability, fees, and lease terms with the listing agent or official building office.')}</p>
      </section>

      <section>
        <div class="sectionTitle">Amenities and policies</div>
        <div class="tagList">
          ${[...amenities, ...security, building.pet_policy, building.parking_info].filter(Boolean).slice(0, 14).map(item => `<span>${escapeHtml(item)}</span>`).join('') || '<span>Ask agent for amenities</span>'}
        </div>
      </section>

      <section>
        <div class="sectionTitle">Available units</div>
        <div class="unitTable">
          ${building.units.slice(0, 8).map(unit => unitRowHtml(unit)).join('')}
        </div>
      </section>

      <section>
        <div class="sectionTitle">Nearby transit</div>
        <div class="nearbyList">${nearbyListHtml(nearestTransit)}</div>
      </section>

      <section>
        <div class="sectionTitle">Nearby schools</div>
        <div class="nearbyList">${nearbyListHtml(nearestSchools)}</div>
      </section>

      <p class="disclaimer"><strong>Important:</strong> This platform is an information and discovery tool. It does not collect rent, deposits, or sign leases. All listing details should be confirmed directly with the agent, owner, or building management.</p>
    </div>
  `;
}

function photoTileHtml(photo, building, index) {
  if (!photo?.photo_url) return `<div class="heroPhoto empty"><span>${index === 0 ? 'Building photo' : 'Photo'}</span></div>`;
  return `<div class="heroPhoto"><img src="${escapeHtml(photo.photo_url)}" alt="${escapeHtml(photo.caption || building.building_name)}" loading="lazy"></div>`;
}

function unitRowHtml(unit) {
  const sqft = Number.isFinite(unit.sqftNum) ? `${unit.sqftNum} sqft` : 'sqft N/A';
  return `
    <div class="unitRow">
      <div class="unitRowTop">
        <span>${escapeHtml(unit.floor_plan || 'Floor plan')} · #${escapeHtml(unit.unit_number || unit.unit_id)}</span>
        <strong>${fullMoney(unit.priceNum)}</strong>
      </div>
      <div class="unitRowMeta">
        <span>${bedroomText(unit.bedsNum)}</span>
        <span>${bathText(unit.bathsNum)}</span>
        <span>${escapeHtml(sqft)}</span>
        <span>Available: ${escapeHtml(unit.available_date || 'Ask')}</span>
      </div>
    </div>
  `;
}

function nearbyListHtml(items) {
  if (!items.length) return '<div class="nearbyItem"><strong>No nearby data in CSV</strong><span>Ask agent</span></div>';
  return items.map(item => `
    <div class="nearbyItem">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${walkingLabel(item.distance)}</span>
    </div>
  `).join('');
}

function showNearbyToolbar(building) {
  els.nearbyToolbar.classList.remove('hidden');
  els.nearbyBuildingName.textContent = building.building_name;
}

// -----------------------------
// Nearby local POI tools
// -----------------------------
function nearbyItemsFor(building, type, radiusMeters) {
  return state.pois
    .filter(poi => poi.type === type)
    .map(poi => ({ ...poi, distance: haversineMeters(building.lat, building.lng, poi.lat, poi.lng) }))
    .filter(poi => poi.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, CONFIG.maxNearbyResults);
}

function handleNearby(type) {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  if (!building) return;
  if (type === 'clear') {
    clearNearby(true);
    return;
  }

  state.activeNearbyType = type;
  document.querySelectorAll('[data-nearby]').forEach(button => {
    button.classList.toggle('active', button.dataset.nearby === type);
  });

  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();

  const radius = CONFIG.poiRadius[type] || 1000;
  L.circle([building.lat, building.lng], {
    radius,
    color: '#1769e0',
    weight: 2,
    fillColor: '#1769e0',
    fillOpacity: 0.055,
    dashArray: '6 6',
  }).addTo(radiusLayer);

  const items = nearbyItemsFor(building, type, radius);
  items.forEach(item => {
    L.marker([item.lat, item.lng], { icon: poiIcon(item.type), zIndexOffset: 1000 })
      .bindPopup(`<div class="popupTitle">${escapeHtml(item.name)}</div><div class="popupSub">${walkingLabel(item.distance)}<br>${escapeHtml(item.address || item.category || '')}</div>`)
      .addTo(nearbyLayer);
  });

  const layers = [...nearbyLayer.getLayers(), state.buildingMarkers.get(building.id)].filter(Boolean);
  if (layers.length > 1) {
    map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [72, 72], maxZoom: type === 'subway' ? 14 : 16 });
  }
}

function clearNearby(resetButtons = true) {
  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();
  state.activeNearbyType = null;
  if (resetButtons) document.querySelectorAll('[data-nearby]').forEach(button => button.classList.remove('active'));
}

// -----------------------------
// Events
// -----------------------------
function bindEvents() {
  els.searchForm.addEventListener('submit', event => {
    event.preventDefault();
    applyFilters();
  });
  [els.areaFilter, els.bedFilter, els.rentFilter, els.sortFilter].forEach(element => {
    element.addEventListener('change', () => applyFilters());
  });
  els.searchInput.addEventListener('input', debounce(() => applyFilters({ fitMap: false }), 180));

  els.resetFilters.addEventListener('click', () => {
    els.searchInput.value = '';
    els.areaFilter.value = '';
    els.bedFilter.value = '';
    els.rentFilter.value = '';
    els.sortFilter.value = 'recommended';
    state.activeSchool = '';
    document.querySelectorAll('[data-school]').forEach(button => button.classList.remove('active'));
    applyFilters();
  });

  els.listingList.addEventListener('click', event => {
    const card = event.target.closest('[data-building-id]');
    if (card) selectBuilding(card.dataset.buildingId);
  });

  els.closeDrawer.addEventListener('click', closeDrawer);

  document.querySelectorAll('[data-school]').forEach(button => {
    button.addEventListener('click', () => {
      const school = button.dataset.school;
      state.activeSchool = school === 'clear' ? '' : school;
      document.querySelectorAll('[data-school]').forEach(btn => btn.classList.toggle('active', btn === button && school !== 'clear'));
      applyFilters();
    });
  });

  document.querySelectorAll('[data-map-mode]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-map-mode]').forEach(btn => btn.classList.toggle('active', btn === button));
      renderDefaultPoiLayer(button.dataset.mapMode);
    });
  });

  document.querySelectorAll('[data-nearby]').forEach(button => {
    button.addEventListener('click', () => handleNearby(button.dataset.nearby));
  });

  window.addEventListener('resize', debounce(() => map.invalidateSize(), 120));
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function openInitialRoute() {
  const buildingId = new URLSearchParams(location.search).get('building');
  if (buildingId && state.buildingMap.has(buildingId)) {
    selectBuilding(buildingId, { fly: false });
    map.setView([state.buildingMap.get(buildingId).lat, state.buildingMap.get(buildingId).lng], 15);
  }
}

// -----------------------------
// Initialize
// -----------------------------
async function init() {
  try {
    const [buildingRows, unitRows, photoRows, poiRows] = await Promise.all([
      loadCSV('buildings.csv'),
      loadCSV('units.csv'),
      loadCSV('photos.csv'),
      loadCSV('community_pois.csv'),
    ]);

    buildData(buildingRows, unitRows, photoRows, poiRows);
    populateFilters();
    bindEvents();
    renderDefaultPoiLayer('rent');
    applyFilters();
    openInitialRoute();

    console.info('NY Rental Map loaded', {
      buildings: state.buildings.length,
      units: state.units.length,
      pois: state.pois.length,
    });
  } catch (error) {
    console.error(error);
    els.resultCount.textContent = 'Load failed';
    els.dataSummary.textContent = 'Check console';
    els.listingList.innerHTML = `
      <div class="listingCard">
        <strong>Could not load CSV files</strong>
        <div class="cardFooter"><span>${escapeHtml(error.message || String(error))}</span></div>
      </div>`;
    alert(`Could not load CSV files. Run this folder with:\npython -m http.server 5500\n\nError: ${error.message || error}`);
  }
}

init();

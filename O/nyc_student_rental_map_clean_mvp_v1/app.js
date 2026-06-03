/* =========================================================
   NYC Student Rental Map · Clean Leaflet MVP
   Keeps architecture: search/list panel + Leaflet map + detail drawer + local CSV data.
   Adds our V1 product direction: unit detail, floor plans, rent calculator, roommate split,
   inquiry preparation, and compliance reminders.
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
  selectedUnitId: null,
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

const map = L.map('map', { zoomControl: true, scrollWheelZoom: true, preferCanvas: true }).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);

const baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20,
}).addTo(map);
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri',
  maxZoom: 19,
});
L.control.layers({ 'Clean map': baseLayer, Satellite: satelliteLayer }, null, { position: 'topright', collapsed: true }).addTo(map);

const buildingLayer = L.layerGroup().addTo(map);
const poiClusterLayer = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 15, maxClusterRadius: 44 }).addTo(map);
const nearbyLayer = L.layerGroup().addTo(map);
const radiusLayer = L.layerGroup().addTo(map);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
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
  return Number.isFinite(number) && number > 0 ? number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : 'Ask agent';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function splitList(value) { return String(value || '').split(/[;|]/).map(item => item.trim()).filter(Boolean); }
function unique(values) { return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]; }
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function walkingLabel(meters) {
  if (!Number.isFinite(meters)) return 'Nearby';
  const miles = meters / 1609.344;
  const minutes = Math.max(1, Math.round(meters / 80));
  return `${minutes} min walk · ${miles.toFixed(1)} mi`;
}
function minRent(building) { const rents = building.units.map(unit => unit.priceNum).filter(value => value > 0); return rents.length ? Math.min(...rents) : 0; }
function maxRent(building) { const rents = building.units.map(unit => unit.priceNum).filter(value => value > 0); return rents.length ? Math.max(...rents) : 0; }
function bedroomText(beds) { const number = toNumber(beds, 0); return number <= 0 ? 'Studio' : `${number}+ bed`; }
function fullBedroomText(beds) { const number = toNumber(beds, 0); return number <= 0 ? 'Studio' : `${number} bedroom${number > 1 ? 's' : ''}`; }
function bathText(baths) { const number = toNumber(baths, 1); return `${Number.isInteger(number) ? number : number.toFixed(1)} bath`; }
function netEffectiveRent(unit) { const net = toNumber(unit.net_effective_rent, 0); return net > 0 ? net : unit.priceNum; }
function peopleForUnit(unit) { const explicit = toNumber(unit.default_people, NaN); if (Number.isFinite(explicit) && explicit > 0) return explicit; if (unit.bedsNum <= 0) return 1; if (unit.bedsNum === 1) return 2; return 3; }
function maxPeopleForUnit(unit) { const explicit = toNumber(unit.max_people, NaN); if (Number.isFinite(explicit) && explicit > 0) return explicit; if (unit.bedsNum <= 0) return 1; if (unit.bedsNum === 1) return 2; return Math.max(3, unit.bedsNum + 1); }
function shareLabelsForUnit(unit, count) {
  const custom = [unit.space_1_name, unit.space_2_name, unit.space_3_name].filter(Boolean);
  if (custom.length >= count) return custom.slice(0, count);
  if (count === 1) return ['Whole unit'];
  if (count === 2) return ['Living room', 'Bedroom'];
  if (count === 3) return ['Living room', 'Second bedroom', 'Primary bedroom'];
  return Array.from({ length: count }, (_, i) => i === 0 ? 'Living room' : `Room ${i}`);
}
function splitRentByRoom(totalMonthly, people, unit) {
  const count = Math.max(1, Math.floor(toNumber(people, 1)));
  const step = Math.max(0, toNumber(unit.rent_step_difference, 200));
  const labels = shareLabelsForUnit(unit, count);
  if (count === 1) return [{ label: labels[0], amount: totalMonthly }];
  const offsetTotal = step * (count * (count - 1) / 2);
  const base = Math.max(0, (totalMonthly - offsetTotal) / count);
  return labels.map((label, index) => ({ label, amount: base + index * step }));
}
function bestUnitFloorPlan(unit) { return (unit.photos || []).find(photo => String(photo.photo_type || '').toLowerCase().includes('floor')) || null; }
function realUnitPhotos(unit) { return (unit.photos || []).filter(photo => !String(photo.photo_type || '').toLowerCase().includes('floor')).slice(0, 4); }
function complianceFeeText(unit) {
  const broker = toNumber(unit.broker_fee_amount, 0);
  const amenity = toNumber(unit.amenity_fee_amount, 0);
  const deposit = toNumber(unit.security_deposit_amount, 0);
  const parts = [];
  if (deposit > 0) parts.push(`Security deposit: ${fullMoney(deposit)}`);
  if (broker > 0) parts.push(`Broker / agent fee listed: ${fullMoney(broker)}`);
  if (amenity > 0) parts.push(`Amenity / application fees estimate: ${fullMoney(amenity)}`);
  return parts.length ? parts.join(' · ') : 'Fees not fully listed. Confirm all fees in writing before applying.';
}
function dataQualityLabel(building) {
  let score = 0;
  if (building.photos.length) score += 25;
  if (building.units.some(bestUnitFloorPlan)) score += 25;
  if (building.units.some(u => u.available_date)) score += 15;
  if (building.amenities) score += 15;
  if (building.source_last_checked) score += 20;
  if (score >= 75) return 'High data quality';
  if (score >= 45) return 'Medium data quality';
  return 'Needs confirmation';
}
function normalizePoiType(category, name = '') {
  const c = String(category || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (c.includes('transit') || c.includes('subway') || c.includes('station') || n.includes(' station')) return 'subway';
  if (c.includes('restaurant') || c.includes('chinese_food')) return 'chineseFood';
  if (c.includes('grocery') || c.includes('supermarket') || c.includes('facility')) return 'chineseStore';
  if (c.includes('mall') || c.includes('shopping')) return 'mall';
  const isK12 = n.includes('public school') || n.includes('high school') || n.includes('middle school') || n.includes('elementary') || n.includes('montessori') || n.includes('daycare');
  const isCollegeLike = n.includes('university') || n.includes('college') || c.includes('university') || c.includes('college');
  return isCollegeLike && !isK12 ? 'university' : 'community';
}

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
  const units = unitRows.map(unit => ({
    ...unit,
    unit_id: unit.unit_id,
    building_id: unit.building_id,
    priceNum: toNumber(unit.gross_rent || unit.net_effective_rent, 0),
    bedsNum: toNumber(unit.beds, 0),
    bathsNum: toNumber(unit.baths, 1),
    sqftNum: toNumber(unit.sqft, NaN),
    photos: photosByUnit.get(unit.unit_id) || [],
  })).filter(unit => unit.unit_id && unit.building_id && unit.priceNum > 0);

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
    if (row.primary_photo_url) photos.unshift({ photo_url: row.primary_photo_url, photo_type: 'primary', caption: row.building_name });
    return { ...row, id: row.building_id, building_name: row.building_name || row.address || row.building_id, lat, lng, units: unitsForBuilding, photos: dedupePhotos(photos), minRent: unitsForBuilding.length ? Math.min(...unitsForBuilding.map(unit => unit.priceNum)) : 0, maxRent: unitsForBuilding.length ? Math.max(...unitsForBuilding.map(unit => unit.priceNum)) : 0 };
  }).filter(building => building.id && Number.isFinite(building.lat) && Number.isFinite(building.lng) && building.units.length);

  const poiMap = new Map();
  poiRows.forEach(row => {
    const lat = toNumber(row.lat, NaN);
    const lng = toNumber(row.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !row.name) return;
    const type = normalizePoiType(row.category || row.type, row.name);
    if (type === 'subway') return; // subway is only shown when user presses Nearby > Subway
    const normalizedName = String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const key = type === 'university' ? `${type}|${normalizedName}` : `${type}|${normalizedName}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
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
function dedupePhotos(photos) { const seen = new Set(); return photos.filter(photo => { if (!photo.photo_url || seen.has(photo.photo_url)) return false; seen.add(photo.photo_url); return true; }); }

function rentIcon(building, active = false) {
  return L.divIcon({ className: '', html: `<div class="rentMarker ${active ? 'active' : ''}">${escapeHtml(money(minRent(building)))}</div>`, iconSize: [82, 36], iconAnchor: [41, 18], popupAnchor: [0, -18] });
}
function poiIcon(type) {
  const label = { subway: 'M', university: '🎓', chineseStore: '🛒', chineseFood: '🍜', mall: '🛍', community: '•' }[type] || '•';
  return L.divIcon({ className: '', html: `<div class="poiPin ${escapeHtml(type)}">${label}</div>`, iconSize: type === 'university' ? [46, 52] : [34, 42], iconAnchor: type === 'university' ? [23, 46] : [17, 34], popupAnchor: [0, -28] });
}
function renderBuildingMarkers(buildings = state.filteredBuildings) {
  buildingLayer.clearLayers();
  state.buildingMarkers.clear();
  const bounds = [];
  buildings.forEach(building => {
    const marker = L.marker([building.lat, building.lng], { icon: rentIcon(building, state.selectedId === building.id), zIndexOffset: state.selectedId === building.id ? 1500 : 900, keyboard: true, title: building.building_name });
    marker.bindPopup(`<div class="popupTitle">${escapeHtml(building.building_name)}</div><div class="popupSub">${escapeHtml(building.neighborhood || building.city_area || 'New York')} · ${building.units.length} units · From ${fullMoney(minRent(building))}</div>`);
    marker.on('click', () => selectBuilding(building.id));
    marker.on('mouseover', () => marker.setIcon(rentIcon(building, true)));
    marker.on('mouseout', () => { if (state.selectedId !== building.id) marker.setIcon(rentIcon(building, false)); });
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
  const typesByMode = { rent: [], school: ['university'], life: ['university', 'chineseStore', 'chineseFood', 'mall'] };
  const allowed = typesByMode[mode] || typesByMode.life;
  if (!allowed.length) return;
  state.pois.filter(poi => allowed.includes(poi.type)).forEach(poi => {
    const marker = L.marker([poi.lat, poi.lng], { icon: poiIcon(poi.type), zIndexOffset: poi.type === 'university' ? 1200 : 320 }).bindPopup(`<div class="popupTitle">${escapeHtml(poi.name)}</div><div class="popupSub">${escapeHtml(poi.address || poi.category || '')}</div>`);
    poiClusterLayer.addLayer(marker);
  });
}

function populateFilters() { const areas = unique(state.buildings.map(building => building.neighborhood || building.city_area)).sort(); els.areaFilter.innerHTML = '<option value="">All areas</option>' + areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join(''); }
function currentFilters() { return { query: els.searchInput.value.trim().toLowerCase(), area: els.areaFilter.value, beds: els.bedFilter.value, rent: toNumber(els.rentFilter.value, 0), sort: els.sortFilter.value, school: state.activeSchool }; }
function applyFilters({ fitMap = true } = {}) {
  const filters = currentFilters();
  let buildings = state.buildings.filter(building => {
    const searchable = [building.building_name, building.address, building.neighborhood, building.city_area, building.transit_summary, building.nearby_summary].join(' ').toLowerCase();
    if (filters.query && !searchable.includes(filters.query)) return false;
    if (filters.area && (building.neighborhood || building.city_area) !== filters.area) return false;
    if (filters.rent && minRent(building) > filters.rent) return false;
    if (filters.beds !== '') { const requested = Number(filters.beds); const hasBed = building.units.some(unit => requested === 2 ? unit.bedsNum >= 2 : unit.bedsNum === requested); if (!hasBed) return false; }
    if (filters.school) { const schoolPoi = findSchoolPoi(filters.school); if (schoolPoi) { const distance = haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng); if (distance > 4500) return false; } }
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
  return copy.sort((a, b) => recommendedScore(b, schoolPoi) - recommendedScore(a, schoolPoi));
}
function recommendedScore(building, schoolPoi) {
  let score = 0;
  score += Math.min(building.units.length, 20) * 4;
  score -= minRent(building) / 1000;
  if (building.photos.length) score += 5;
  if (building.amenities) score += 4;
  if (building.units.some(bestUnitFloorPlan)) score += 8;
  if (schoolPoi) score -= haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng) / 500;
  return score;
}
function findSchoolPoi(schoolKey) { const key = schoolKey.toLowerCase(); return state.pois.find(poi => poi.type === 'university' && poi.name.toLowerCase().includes(key)); }
function fitFilteredBounds(buildings) { if (!buildings.length) return; map.fitBounds(buildings.map(building => [building.lat, building.lng]), { padding: [70, 70], maxZoom: 13 }); }
function renderListingList(buildings) { if (!buildings.length) { els.listingList.innerHTML = `<div class="listingCard"><strong>No results found</strong><div class="cardFooter"><span>Try another area, rent, or school.</span></div></div>`; return; } els.listingList.innerHTML = buildings.map(building => listingCardHtml(building)).join(''); }
function listingCardHtml(building) {
  const area = [building.neighborhood, building.city_area].filter(Boolean).join(' · ') || 'New York';
  const unitTypes = unique(building.units.map(unit => bedroomText(unit.bedsNum))).slice(0, 3).join(' / ');
  const quality = dataQualityLabel(building);
  return `<button class="listingCard ${state.selectedId === building.id ? 'active' : ''}" type="button" data-building-id="${escapeHtml(building.id)}"><div class="listingTop"><div class="listingTitle"><strong>${escapeHtml(building.building_name)}</strong><span>${escapeHtml(building.address)}</span></div><span class="rentBadge">${escapeHtml(money(minRent(building)))}+</span></div><div class="cardMeta"><span>${building.units.length} units</span><span>${escapeHtml(unitTypes || 'Units')}</span><span>${escapeHtml(area)}</span><span>${escapeHtml(quality)}</span></div><div class="cardFooter"><span>${escapeHtml(building.transit_summary || building.nearby_summary || 'School and lifestyle context available')}</span><span>Details</span></div></button>`;
}
function updateCounts(buildings) { els.resultCount.textContent = `${buildings.length} buildings`; els.dataSummary.textContent = `${state.units.length} units · ${state.pois.length} lifestyle POIs`; }

function selectBuilding(id, { fly = true } = {}) {
  const building = state.buildingMap.get(id);
  if (!building) return;
  const previousId = state.selectedId;
  state.selectedId = id;
  state.selectedUnitId = null;
  state.activeNearbyType = null;
  updateActiveMarker(previousId, id);
  renderListingList(state.filteredBuildings);
  openDrawer(building);
  showNearbyToolbar(building);
  clearNearby(false);
  if (fly) map.flyTo([building.lat, building.lng], Math.max(map.getZoom(), 15), { duration: 0.65, easeLinearity: 0.25 });
  const url = new URL(location.href);
  url.searchParams.set('building', id);
  url.searchParams.delete('unit');
  history.replaceState({}, '', url);
}
function openDrawer(building) { els.workspace.classList.add('drawerOpen'); els.detailDrawer.classList.remove('hidden'); els.detailContent.innerHTML = detailHtml(building); els.detailDrawer.scrollTop = 0; requestAnimationFrame(() => map.invalidateSize()); }
function closeDrawer() { const previousId = state.selectedId; state.selectedId = null; state.selectedUnitId = null; state.activeNearbyType = null; updateActiveMarker(previousId, null); clearNearby(false); els.workspace.classList.remove('drawerOpen'); els.detailDrawer.classList.add('hidden'); els.nearbyToolbar.classList.add('hidden'); renderListingList(state.filteredBuildings); const url = new URL(location.href); url.searchParams.delete('building'); url.searchParams.delete('unit'); history.replaceState({}, '', url); requestAnimationFrame(() => map.invalidateSize()); }
function detailHtml(building) {
  const photos = building.photos.slice(0, 4);
  const amenities = splitList(building.amenities).slice(0, 9);
  const security = splitList(building.security_features).slice(0, 4);
  const nearestTransit = nearbyItemsFor(building, 'subway', CONFIG.poiRadius.subway).slice(0, 4);
  const nearestSchools = nearbyItemsFor(building, 'university', CONFIG.poiRadius.university).slice(0, 4);
  const quality = dataQualityLabel(building);
  return `<div class="detailContentInner"><div class="drawerTopLine"><span class="eyebrow">Building overview</span><span class="qualityBadge">${escapeHtml(quality)}</span></div><div class="heroPhotos ${photos.length ? '' : 'noRealPhotos'}">${[0,1,2,3].map(index => photoTileHtml(photos[index], building, index)).join('')}</div><section class="detailHero"><h2>${escapeHtml(building.building_name)}</h2><p>${escapeHtml(building.address)}<br>${escapeHtml([building.neighborhood, building.city_area].filter(Boolean).join(' · ') || 'New York')}</p><div class="detailPriceRow"><div><span>Starting rent</span><br><strong>${fullMoney(minRent(building))}</strong></div><span>${building.units.length} available units · ${escapeHtml(building.source_last_checked || 'Last checked: ask')}</span></div><div class="ctaRow"><button class="ctaButton" type="button" data-scroll-units>View units</button><button class="ctaButton secondary" type="button" data-share-building>Copy building link</button></div></section><section><div class="sectionTitle">What this page is for</div><p class="plainText">This student-first rental page helps renters compare location, floor plans, estimated real costs, roommate split, Chinese lifestyle access, and school commute context before contacting an agent.</p></section><section><div class="sectionTitle">Building snapshot</div><div class="factGrid"><div class="factBox"><span>Rent range</span><strong>${fullMoney(minRent(building))} - ${fullMoney(maxRent(building))}</strong></div><div class="factBox"><span>Lease</span><strong>${escapeHtml(building.lease_term_default || 'Ask agent')}</strong></div><div class="factBox"><span>Utilities</span><strong>${escapeHtml(building.utilities_policy || 'Ask agent')}</strong></div><div class="factBox"><span>Verification</span><strong>${escapeHtml(building.verification_status || 'Agent / public data to verify')}</strong></div></div><p class="disclaimer">${escapeHtml(building.description || 'Building information is based on currently available data. Confirm final price, availability, fees, and lease terms with the listing agent or building management before applying.')}</p></section><section><div class="sectionTitle">Amenities, safety, and policies</div><div class="tagList">${[...amenities, ...security, building.pet_policy, building.parking_info].filter(Boolean).slice(0, 14).map(item => `<span>${escapeHtml(item)}</span>`).join('') || '<span>Ask agent for amenities</span>'}</div></section><section id="unitSection"><div class="sectionTitle">Available units</div><div class="simpleHelp">Click a unit to open its floor plan, rent calculator, roommate split, share link, and inquiry form.</div><div class="unitTable">${building.units.slice(0, 12).map(unit => unitRowHtml(unit)).join('')}</div></section><section><div class="sectionTitle">Nearby transit</div><div class="nearbyList">${nearbyListHtml(nearestTransit)}</div></section><section><div class="sectionTitle">Nearby schools</div><div class="nearbyList">${nearbyListHtml(nearestSchools)}</div></section><section class="complianceBox"><div class="sectionTitle">Important rental disclaimer</div><p>This website is an information and discovery tool. It does not collect rent, deposits, or sign leases. Prices, availability, concessions, fees, photos, and floor plans may change. Always confirm all fees, lease terms, flex wall rules, living-room occupancy, and availability in writing with the agent, owner, or building management before applying.</p></section></div>`;
}
function photoTileHtml(photo, building, index) { if (!photo?.photo_url) return `<div class="heroPhoto empty"><span>${index === 0 ? 'No real building photo yet' : 'Photo unavailable'}</span></div>`; return `<div class="heroPhoto"><img src="${escapeHtml(photo.photo_url)}" alt="${escapeHtml(photo.caption || building.building_name)}" loading="lazy"></div>`; }
function unitRowHtml(unit) { const sqft = Number.isFinite(unit.sqftNum) ? `${unit.sqftNum} sqft` : 'sqft N/A'; const floorPlan = bestUnitFloorPlan(unit); return `<button class="unitRow unitRowButton" type="button" data-unit-id="${escapeHtml(unit.unit_id)}"><div class="unitRowTop"><span>${escapeHtml(unit.floor_plan || 'Floor plan')} · #${escapeHtml(unit.unit_number || unit.unit_id)}</span><strong>${fullMoney(unit.priceNum)}</strong></div><div class="unitRowMeta"><span>${fullBedroomText(unit.bedsNum)}</span><span>${bathText(unit.bathsNum)}</span><span>${escapeHtml(sqft)}</span><span>Available: ${escapeHtml(unit.available_date || 'Ask')}</span><span>${floorPlan ? 'Floor plan available' : 'Floor plan not listed'}</span></div></button>`; }
function unitDetailHtml(building, unit) {
  const floorPlan = bestUnitFloorPlan(unit);
  const unitPhotos = realUnitPhotos(unit);
  const people = peopleForUnit(unit);
  const maxPeople = maxPeopleForUnit(unit);
  const gross = unit.priceNum;
  const net = netEffectiveRent(unit);
  const utilities = toNumber(unit.utilities_estimate_monthly, 180);
  const deposit = toNumber(unit.security_deposit_amount, gross);
  const broker = toNumber(unit.broker_fee_amount, 0);
  const amenity = toNumber(unit.amenity_fee_amount, 0);
  return `<div class="detailContentInner unitDetailView"><div class="drawerTopLine"><button class="backButton" type="button" data-back-building>← Building overview</button><button class="shareTiny" type="button" data-share-unit>Share unit</button></div><section class="detailHero unitHero"><span class="eyebrow">Unit detail</span><h2>${escapeHtml(unit.floor_plan || 'Floor plan')} · #${escapeHtml(unit.unit_number || unit.unit_id)}</h2><p>${escapeHtml(building.building_name)}<br>${escapeHtml(building.address)}</p><div class="detailPriceRow"><div><span>Monthly gross rent</span><br><strong>${fullMoney(gross)}</strong></div><span>${fullBedroomText(unit.bedsNum)} · ${bathText(unit.bathsNum)} · ${Number.isFinite(unit.sqftNum) ? `${unit.sqftNum} sqft` : 'sqft N/A'}</span></div></section><section><div class="sectionTitle">Floor plan</div>${floorPlan ? `<a class="floorPlanCard" href="${escapeHtml(floorPlan.photo_url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(floorPlan.photo_url)}" alt="${escapeHtml(floorPlan.caption || unit.floor_plan || 'Floor plan')}" loading="lazy"><span>${escapeHtml(floorPlan.caption || 'Open floor plan')}</span></a>` : `<div class="emptyDataBox"><strong>Floor plan not available yet</strong><span>This unit does not have a verified floor plan image in the current data.</span></div>`}</section>${unitPhotos.length ? `<section><div class="sectionTitle">Unit photos</div><div class="unitPhotoGrid">${unitPhotos.map(photo => `<a href="${escapeHtml(photo.photo_url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(photo.photo_url)}" alt="${escapeHtml(photo.caption || 'Unit photo')}" loading="lazy"></a>`).join('')}</div></section>` : ''}<section><div class="sectionTitle">Unit rent and fee details</div><div class="factGrid"><div class="factBox"><span>Gross rent</span><strong>${fullMoney(gross)}</strong></div><div class="factBox"><span>Net effective rent</span><strong>${fullMoney(net)}</strong></div><div class="factBox"><span>Move-in date</span><strong>${escapeHtml(unit.available_date || 'Ask agent')}</strong></div><div class="factBox"><span>Lease term</span><strong>${escapeHtml(unit.lease_term || building.lease_term_default || 'Ask agent')}</strong></div><div class="factBox"><span>Concession</span><strong>${escapeHtml(unit.concession || 'Ask agent')}</strong></div><div class="factBox"><span>Listed fees</span><strong>${escapeHtml(complianceFeeText(unit))}</strong></div></div></section><section><div class="sectionTitle">Rent calculator and roommate split</div><div class="calcBox" data-calc-unit="${escapeHtml(unit.unit_id)}"><div class="calcGrid"><label>Lease months<input type="number" min="1" value="${toNumber(unit.lease_term, toNumber(building.lease_term_default, 12)) || 12}" data-calc="lease"></label><label>Free months<input type="number" min="0" step="0.5" value="0" data-calc="free"></label><label>People<input type="number" min="1" max="${maxPeople}" value="${people}" data-calc="people"></label><label>Utilities / month<input type="number" min="0" value="${Math.round(utilities)}" data-calc="utilities"></label><label>Security deposit<input type="number" min="0" value="${Math.round(deposit)}" data-calc="deposit"></label><label>Broker / agent fee<input type="number" min="0" value="${Math.round(broker)}" data-calc="broker"></label><label>Amenity / application fee<input type="number" min="0" value="${Math.round(amenity)}" data-calc="amenity"></label></div><div class="calcResults" data-calc-results>${calculatorResultsHtml(unit, gross, 12, 0, people, utilities, deposit, broker, amenity)}</div></div></section><section class="complianceBox"><div class="sectionTitle">Flex wall, fees, and compliance reminder</div><p>Living-room occupancy, flex walls, pressurized walls, bookshelf partitions, curtains, or temporary partitions may require written approval from building management and may not be allowed. All fees must be verified in writing before applying. This calculator is only an estimate.</p></section><section><div class="sectionTitle">Ask about this unit</div><form class="leadForm" data-lead-form><label>Name<input name="name" placeholder="Your name"></label><label>WeChat / Phone / Email<input name="contact" placeholder="Best contact"></label><label>Move-in date<input name="movein" placeholder="e.g. Aug 15"></label><label>Message<textarea name="message" placeholder="I am interested in this unit. Please confirm price, fees, and availability."></textarea></label><label class="consentLine"><input type="checkbox" required> I understand this inquiry may be shared with the listing contact for rental communication. I will confirm all fees and terms in writing before applying.</label><button class="ctaButton" type="submit">Prepare inquiry message</button></form></section></div>`;
}
function calculatorResultsHtml(unit, gross, lease, free, people, utilities, deposit, broker, amenity) {
  const leaseMonths = Math.max(1, toNumber(lease, 12));
  const freeMonths = Math.min(leaseMonths, Math.max(0, toNumber(free, 0)));
  const count = Math.max(1, Math.floor(toNumber(people, 1)));
  const net = gross * (leaseMonths - freeMonths) / leaseMonths;
  const monthlyTotal = net + Math.max(0, toNumber(utilities, 0));
  const oneTimeTotal = Math.max(0, toNumber(deposit, 0)) + Math.max(0, toNumber(broker, 0)) + Math.max(0, toNumber(amenity, 0));
  const oneTimePerPerson = oneTimeTotal / count;
  const split = splitRentByRoom(monthlyTotal, count, unit);
  return `<div class="calcSummary"><div><span>Net effective rent</span><strong>${fullMoney(net)}/mo</strong></div><div><span>Whole-unit monthly total</span><strong>${fullMoney(monthlyTotal)}/mo</strong></div><div><span>One-time fees / person</span><strong>${fullMoney(oneTimePerPerson)}</strong></div></div><div class="splitRows">${split.map(row => `<div><span>${escapeHtml(row.label)}</span><strong>${fullMoney(row.amount)}/mo</strong><em>Estimated move-in: ${fullMoney(row.amount + oneTimePerPerson)}</em></div>`).join('')}</div>`;
}
function nearbyListHtml(items) { if (!items.length) return '<div class="nearbyItem"><strong>No nearby data in CSV</strong><span>Ask agent</span></div>'; return items.map(item => `<div class="nearbyItem"><strong>${escapeHtml(item.name)}</strong><span>${walkingLabel(item.distance)}</span></div>`).join(''); }
function showNearbyToolbar(building) { els.nearbyToolbar.classList.remove('hidden'); els.nearbyBuildingName.textContent = building.building_name; }
function nearbyItemsFor(building, type, radiusMeters) { return state.pois.filter(poi => poi.type === type).map(poi => ({ ...poi, distance: haversineMeters(building.lat, building.lng, poi.lat, poi.lng) })).filter(poi => poi.distance <= radiusMeters).sort((a, b) => a.distance - b.distance).slice(0, CONFIG.maxNearbyResults); }
function handleNearby(type) {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  if (!building) return;
  if (type === 'clear') { clearNearby(true); return; }
  state.activeNearbyType = type;
  document.querySelectorAll('[data-nearby]').forEach(button => button.classList.toggle('active', button.dataset.nearby === type));
  nearbyLayer.clearLayers(); radiusLayer.clearLayers();
  const radius = CONFIG.poiRadius[type] || 1000;
  L.circle([building.lat, building.lng], { radius, color: '#1769e0', weight: 2, fillColor: '#1769e0', fillOpacity: 0.055, dashArray: '6 6' }).addTo(radiusLayer);
  let items = nearbyItemsFor(building, type, radius);
  if (type === 'subway') {
    // Local CSV hides subway from default layer; nearby subway requires local POI data.
    items = state.photos ? items : [];
  }
  items.forEach(item => { L.marker([item.lat, item.lng], { icon: poiIcon(item.type), zIndexOffset: 1000 }).bindPopup(`<div class="popupTitle">${escapeHtml(item.name)}</div><div class="popupSub">${walkingLabel(item.distance)}<br>${escapeHtml(item.address || item.category || '')}</div>`).addTo(nearbyLayer); });
  const layers = [...nearbyLayer.getLayers(), state.buildingMarkers.get(building.id)].filter(Boolean);
  if (layers.length > 1) map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [72, 72], maxZoom: type === 'subway' ? 14 : 16 });
}
function clearNearby(resetButtons = true) { nearbyLayer.clearLayers(); radiusLayer.clearLayers(); state.activeNearbyType = null; if (resetButtons) document.querySelectorAll('[data-nearby]').forEach(button => button.classList.remove('active')); }

function openUnitDetail(building, unit) { state.selectedUnitId = unit.unit_id; els.detailContent.innerHTML = unitDetailHtml(building, unit); els.detailDrawer.scrollTop = 0; const url = new URL(location.href); url.searchParams.set('building', building.id); url.searchParams.set('unit', unit.unit_id); history.replaceState({}, '', url); }
function updateCalculatorFromInputs(box) { const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null; const unit = building?.units.find(item => item.unit_id === state.selectedUnitId); if (!unit) return; const value = key => toNumber(box.querySelector(`[data-calc="${key}"]`)?.value, 0); const results = box.querySelector('[data-calc-results]'); if (results) results.innerHTML = calculatorResultsHtml(unit, unit.priceNum, value('lease') || 12, value('free'), value('people') || 1, value('utilities'), value('deposit'), value('broker'), value('amenity')); }
async function copyCurrentLink(type = 'building') { try { await navigator.clipboard.writeText(location.href); alert(`${type === 'unit' ? 'Unit' : 'Building'} link copied.`); } catch (_) { prompt('Copy this link:', location.href); } }
function prepareLeadMessage(form) {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  const unit = building?.units.find(item => item.unit_id === state.selectedUnitId);
  if (!building || !unit) return;
  const data = new FormData(form);
  const body = [`Inquiry for ${building.building_name}`, `Unit: ${unit.floor_plan || ''} #${unit.unit_number || unit.unit_id}`, `Rent: ${fullMoney(unit.priceNum)}`, `Link: ${location.href}`, '', `Name: ${data.get('name') || ''}`, `Contact: ${data.get('contact') || ''}`, `Move-in date: ${data.get('movein') || ''}`, '', `Message: ${data.get('message') || ''}`, '', 'Please confirm current availability, all required fees, lease terms, and any flex wall / living-room occupancy policy in writing.'].join('\n');
  location.href = `mailto:?subject=${encodeURIComponent('Rental inquiry: ' + building.building_name)}&body=${encodeURIComponent(body)}`;
}

function bindEvents() {
  els.searchForm.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  [els.areaFilter, els.bedFilter, els.rentFilter, els.sortFilter].forEach(element => element.addEventListener('change', () => applyFilters()));
  els.searchInput.addEventListener('input', debounce(() => applyFilters({ fitMap: false }), 180));
  els.resetFilters.addEventListener('click', () => { els.searchInput.value = ''; els.areaFilter.value = ''; els.bedFilter.value = ''; els.rentFilter.value = ''; els.sortFilter.value = 'recommended'; state.activeSchool = ''; document.querySelectorAll('[data-school]').forEach(button => button.classList.remove('active')); applyFilters(); });
  els.listingList.addEventListener('click', event => { const card = event.target.closest('[data-building-id]'); if (card) selectBuilding(card.dataset.buildingId); });
  els.closeDrawer.addEventListener('click', closeDrawer);
  document.querySelectorAll('[data-school]').forEach(button => { button.addEventListener('click', () => { const school = button.dataset.school; state.activeSchool = school === 'clear' ? '' : school; document.querySelectorAll('[data-school]').forEach(btn => btn.classList.toggle('active', btn === button && school !== 'clear')); applyFilters(); }); });
  document.querySelectorAll('[data-map-mode]').forEach(button => { button.addEventListener('click', () => { document.querySelectorAll('[data-map-mode]').forEach(btn => btn.classList.toggle('active', btn === button)); renderDefaultPoiLayer(button.dataset.mapMode); }); });
  document.querySelectorAll('[data-nearby]').forEach(button => button.addEventListener('click', () => handleNearby(button.dataset.nearby)));
  els.detailContent.addEventListener('click', event => { const unitButton = event.target.closest('[data-unit-id]'); if (unitButton && state.selectedId) { const building = state.buildingMap.get(state.selectedId); const unit = building?.units.find(item => item.unit_id === unitButton.dataset.unitId); if (building && unit) openUnitDetail(building, unit); return; } if (event.target.closest('[data-back-building]') && state.selectedId) { const building = state.buildingMap.get(state.selectedId); if (building) openDrawer(building); return; } if (event.target.closest('[data-scroll-units]')) { document.getElementById('unitSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } if (event.target.closest('[data-share-building]')) { copyCurrentLink('building'); return; } if (event.target.closest('[data-share-unit]')) { copyCurrentLink('unit'); return; } });
  els.detailContent.addEventListener('input', event => { const box = event.target.closest('.calcBox'); if (box) updateCalculatorFromInputs(box); });
  els.detailContent.addEventListener('submit', event => { const form = event.target.closest('[data-lead-form]'); if (!form) return; event.preventDefault(); prepareLeadMessage(form); });
  window.addEventListener('resize', debounce(() => map.invalidateSize(), 120));
}
function debounce(fn, wait) { let timer = null; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
function openInitialRoute() { const params = new URLSearchParams(location.search); const buildingId = params.get('building'); const unitId = params.get('unit'); if (buildingId && state.buildingMap.has(buildingId)) { selectBuilding(buildingId, { fly: false }); const building = state.buildingMap.get(buildingId); map.setView([building.lat, building.lng], 15); if (unitId) { const unit = building.units.find(item => item.unit_id === unitId); if (unit) openUnitDetail(building, unit); } } }

async function init() {
  try {
    const [buildingRows, unitRows, photoRows, poiRows] = await Promise.all([loadCSV('buildings.csv'), loadCSV('units.csv'), loadCSV('photos.csv'), loadCSV('community_pois.csv')]);
    buildData(buildingRows, unitRows, photoRows, poiRows);
    populateFilters();
    bindEvents();
    renderDefaultPoiLayer('rent');
    applyFilters();
    openInitialRoute();
    console.info('NYC Student Rental Map loaded', { buildings: state.buildings.length, units: state.units.length, pois: state.pois.length });
  } catch (error) {
    console.error(error);
    els.resultCount.textContent = 'Load failed';
    els.dataSummary.textContent = 'Check console';
    els.listingList.innerHTML = `<div class="listingCard"><strong>Could not load CSV files</strong><div class="cardFooter"><span>${escapeHtml(error.message || String(error))}</span></div></div>`;
    alert(`Could not load CSV files. Run this folder with:\npython -m http.server 5500\n\nError: ${error.message || error}`);
  }
}
init();

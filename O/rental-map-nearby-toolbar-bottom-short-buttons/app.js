const state = {
  rows: [],
  buildings: [],
  selectedId: null,
  markers: new Map(),
  nearbyItems: [],
  nearbyMode: null,
};

const els = {
  layout: document.getElementById('layout'),
  detailPanel: document.getElementById('detailPanel'),
  detailContent: document.getElementById('detailContent'),
  closeDetail: document.getElementById('closeDetail'),
  nearbyToolbar: document.getElementById('nearbyToolbar'),
  toolbarBuilding: document.getElementById('toolbarBuilding'),
};

const map = L.map('map', {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView([40.806, -73.945], 12);

// Free/open map tiles for demo. Do not directly use Google map tiles without Google Maps API/license.
const baseLayers = {
  'Clean light': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
  }),
  'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }),
  'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  }),
};
baseLayers['Clean light'].addTo(map);
L.control.layers(baseLayers, null, { position: 'topright', collapsed: false }).addTo(map);

const nearbyLayer = L.layerGroup().addTo(map);
const radiusLayer = L.layerGroup().addTo(map);
const subwayLineLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenRailwayMap contributors',
  maxZoom: 19,
  opacity: 0.72,
});

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '"' && inQuotes && n === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { row.push(cur); cur = ''; continue; }
    if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && n === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const headers = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}

function money(n) {
  const num = Number(String(n).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : n;
}

function groupBuildings(rows) {
  const mapById = new Map();
  for (const row of rows) {
    const id = row.building_id || row.address;
    if (!mapById.has(id)) {
      mapById.set(id, {
        id,
        building_name: row.building_name || row.address,
        address: row.address,
        city_area: row.city_area,
        lat: Number(row.lat),
        lng: Number(row.lng),
        link: row.link,
        utilities: row.utilities || 'Contact agent',
        amenities: row.amenities || 'Contact agent',
        nearby: row.nearby || 'Contact agent',
        units: [],
      });
    }
    mapById.get(id).units.push(row);
  }
  return [...mapById.values()].filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng));
}

function minRent(building) {
  return Math.min(...building.units.map(u => Number(u.price)).filter(Number.isFinite));
}

function floorPlans(building) {
  return [...new Set(building.units.map(u => u['Floor Plan']).filter(Boolean))].join(' / ');
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function markerIcon(active = false, building = null) {
  const unitCount = building ? building.units.length : 1;
  const rent = building ? money(minRent(building)).replace('.00', '') : '';
  const height = Math.min(76, 42 + unitCount * 8);
  return L.divIcon({
    className: '',
    html: `
      <div class="buildingMarker ${active ? 'active' : ''}" style="--building-height:${height}px">
        <div class="buildingShadow"></div>
        <div class="buildingBody">
          <div class="buildingWindows"></div>
          <div class="buildingLetter">R</div>
        </div>
        <div class="buildingRoof"></div>
        <div class="buildingPrice">${rent}</div>
      </div>`,
    iconSize: [72, 96],
    iconAnchor: [36, 82],
    popupAnchor: [0, -76],
  });
}

function poiIcon(type) {
  const label = type === 'restaurant' ? '🍽' : type === 'store' ? '🛒' : 'Ⓜ';
  return L.divIcon({
    className: '',
    html: `<div class="poiMarker ${type}">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function renderMarkers() {
  for (const marker of state.markers.values()) marker.remove();
  state.markers.clear();

  const bounds = [];
  state.buildings.forEach(b => {
    const marker = L.marker([b.lat, b.lng], { icon: markerIcon(state.selectedId === b.id, b), zIndexOffset: 500 }).addTo(map);
    marker.bindPopup(`<div class="popupTitle">${escapeHtml(b.building_name)}</div><div class="popupSub">From ${money(minRent(b))} · ${b.units.length} ${b.units.length === 1 ? 'unit' : 'units'}</div>`);
    marker.on('mouseover', () => {
      marker.setIcon(markerIcon(true, b));
      marker.openPopup();
    });
    marker.on('mouseout', () => {
      if (state.selectedId !== b.id) marker.setIcon(markerIcon(false, b));
    });
    marker.on('click', () => selectBuilding(b.id));
    state.markers.set(b.id, marker);
    bounds.push([b.lat, b.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [90, 90], maxZoom: 13 });
  }
}

function renderDetail(building) {
  els.detailPanel.classList.remove('hidden');
  els.layout.classList.add('panelOpen');
  const nearbyHtml = state.nearbyMode ? renderNearbyResults() : '';
  els.detailContent.innerHTML = `
    <div class="hero"><h2>${escapeHtml(building.building_name)}</h2></div>
    <p class="meta">${escapeHtml(building.address)}<br>${escapeHtml(building.city_area)}</p>
    <div class="priceRow"><span>Starting rent</span><strong>${money(minRent(building))}/mo</strong></div>

    <div class="sectionTitle">Nearby results</div>
    <div class="nearbyHint">Use the floating toolbar at the bottom of the map to show restaurants, stores, or subway lines near this building.</div>
    <div id="nearbyStatus" class="nearbyStatus">${nearbyHtml || '<div class="emptyNearby">No nearby layer selected yet.</div>'}</div>

    <div class="sectionTitle">Available units</div>
    ${building.units.map(u => `
      <div class="unit">
        <div class="unitTop"><span>#${escapeHtml(u.room_num || 'Unit')}</span><span>${money(u.price)}/mo</span></div>
        <p>${escapeHtml(u['Floor Plan'] || '')} · ${escapeHtml(u.lease_term || 'Contact agent')} · ${escapeHtml(u.available_date || 'Contact agent')}<br>${u.concession ? `Concession: ${escapeHtml(u.concession)}` : ''}</p>
      </div>
    `).join('')}
    <div class="infoGrid">
      <div class="infoBox"><span>Utilities</span><strong>${escapeHtml(building.utilities)}</strong></div>
      <div class="infoBox"><span>Amenities</span><strong>${escapeHtml(building.amenities)}</strong></div>
      <div class="infoBox"><span>Nearby</span><strong>${escapeHtml(building.nearby)}</strong></div>
      <div class="infoBox"><span>Floor plans</span><strong>${escapeHtml(floorPlans(building))}</strong></div>
    </div>
    ${building.link ? `<a class="openLink" href="${escapeHtml(building.link)}" target="_blank" rel="noreferrer">Open official listing</a>` : ''}
  `;

  setTimeout(() => map.invalidateSize(), 120);
}

function renderNearbyResults() {
  const labels = {
    restaurant: 'Restaurants within 200m',
    store: 'Stores within 500m',
    subway: 'Subway stations within 1 mile',
  };
  if (state.nearbyItems.length === 0) {
    return `<div class="emptyNearby">No ${labels[state.nearbyMode]?.toLowerCase() || 'nearby results'} found from OpenStreetMap data.</div>`;
  }
  return `
    <div class="nearbyResultTitle">${labels[state.nearbyMode]} · ${state.nearbyItems.length} found</div>
    <ol class="nearbyList">
      ${state.nearbyItems.slice(0, 12).map(item => `
        <li>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${Math.round(item.distance)}m away${item.extra ? ` · ${escapeHtml(item.extra)}` : ''}</span>
        </li>
      `).join('')}
    </ol>
  `;
}

function selectBuilding(id) {
  const building = state.buildings.find(b => b.id === id);
  if (!building) return;
  state.selectedId = id;
  clearNearby(false);
  renderMarkers();
  renderDetail(building);
  showNearbyToolbar(building);

  const marker = state.markers.get(id);
  if (marker) marker.openPopup();
  setTimeout(() => {
    map.flyTo([building.lat, building.lng], 16, { duration: 0.85 });
  }, 150);
}

function clearDetail() {
  state.selectedId = null;
  clearNearby(false);
  els.detailPanel.classList.add('hidden');
  els.layout.classList.remove('panelOpen');
  hideNearbyToolbar();
  renderMarkers();
  setTimeout(() => map.invalidateSize(), 120);
}

function selectedBuilding() {
  return state.buildings.find(b => b.id === state.selectedId);
}

function setNearbyStatus(message, isLoading = false) {
  const status = document.getElementById('nearbyStatus');
  if (!status) return;
  status.innerHTML = `<div class="nearbyLoading ${isLoading ? 'spinning' : ''}">${message}</div>`;
}

function clearNearby(updateDetail = true) {
  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  state.nearbyItems = [];
  state.nearbyMode = null;
  if (updateDetail) {
    const b = selectedBuilding();
    if (b) renderDetail(b);
  }
}

function overpassQueryFor(type, building) {
  if (type === 'restaurant') {
    return `
      [out:json][timeout:25];
      (
        node["amenity"~"restaurant|cafe|fast_food"](around:200,${building.lat},${building.lng});
        way["amenity"~"restaurant|cafe|fast_food"](around:200,${building.lat},${building.lng});
        relation["amenity"~"restaurant|cafe|fast_food"](around:200,${building.lat},${building.lng});
      );
      out center tags;
    `;
  }
  if (type === 'store') {
    return `
      [out:json][timeout:25];
      (
        node["shop"](around:500,${building.lat},${building.lng});
        way["shop"](around:500,${building.lat},${building.lng});
        relation["shop"](around:500,${building.lat},${building.lng});
        node["amenity"="pharmacy"](around:500,${building.lat},${building.lng});
        way["amenity"="pharmacy"](around:500,${building.lat},${building.lng});
        relation["amenity"="pharmacy"](around:500,${building.lat},${building.lng});
      );
      out center tags;
    `;
  }
  if (type === 'subway') {
    return `
      [out:json][timeout:25];
      (
        node["railway"="station"]["station"="subway"](around:1609,${building.lat},${building.lng});
        node["railway"="station"]["subway"="yes"](around:1609,${building.lat},${building.lng});
        node["public_transport"="station"]["subway"="yes"](around:1609,${building.lat},${building.lng});
        way["railway"="station"]["station"="subway"](around:1609,${building.lat},${building.lng});
        way["railway"="station"]["subway"="yes"](around:1609,${building.lat},${building.lng});
        relation["railway"="station"]["station"="subway"](around:1609,${building.lat},${building.lng});
      );
      out center tags;
    `;
  }
  return '';
}

async function fetchOverpass(type, building) {
  const query = overpassQueryFor(type, building);
  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Overpass request failed: ${res.status}`);
  const data = await res.json();
  const seen = new Set();

  return (data.elements || [])
    .map(el => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const tags = el.tags || {};
      const name = tags.name || tags.brand || tags.operator || (type === 'subway' ? 'Subway station' : type === 'store' ? 'Store' : 'Restaurant');
      const key = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const distance = haversineMeters(building.lat, building.lng, lat, lng);
      let extra = '';
      if (type === 'restaurant') extra = tags.cuisine || tags.amenity || '';
      if (type === 'store') extra = tags.shop || tags.amenity || '';
      if (type === 'subway') extra = tags.route_ref || tags.ref || tags.line || tags.operator || '';
      return { lat, lng, name, distance, extra, raw: el };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}

function drawRadius(building, meters, color) {
  radiusLayer.clearLayers();
  L.circle([building.lat, building.lng], {
    radius: meters,
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.05,
    dashArray: '6 6',
  }).addTo(radiusLayer);
}

function renderNearbyMarkers(type, building, items) {
  nearbyLayer.clearLayers();
  items.forEach(item => {
    L.marker([item.lat, item.lng], { icon: poiIcon(type), zIndexOffset: 300 })
      .bindPopup(`<div class="popupTitle">${escapeHtml(item.name)}</div><div class="popupSub">${Math.round(item.distance)}m away${item.extra ? ` · ${escapeHtml(item.extra)}` : ''}</div>`)
      .addTo(nearbyLayer);
  });

  const bMarker = state.markers.get(building.id);
  const group = L.featureGroup([
    ...nearbyLayer.getLayers(),
    ...(bMarker ? [bMarker] : []),
  ]);
  if (group.getLayers().length > 1) {
    map.fitBounds(group.getBounds(), { padding: [80, 80], maxZoom: type === 'subway' ? 14 : 17 });
  }
}

async function handleNearbyClick(type) {
  const building = selectedBuilding();
  if (!building) return;

  if (type === 'clear') {
    clearNearby(true);
    return;
  }

  const radius = type === 'restaurant' ? 200 : type === 'store' ? 500 : 1609;
  const color = type === 'restaurant' ? '#f97316' : type === 'store' ? '#2563eb' : '#6d3fe3';
  state.nearbyMode = type;
  state.nearbyItems = [];
  nearbyLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  if (type === 'subway') subwayLineLayer.addTo(map);
  drawRadius(building, radius, color);
  setNearbyStatus(`Loading ${type === 'restaurant' ? 'restaurants within 200m' : type === 'store' ? 'stores within 500m' : 'subway stations within 1 mile'}...`, true);

  try {
    const items = await fetchOverpass(type, building);
    state.nearbyItems = items;
    renderNearbyMarkers(type, building, items);
    renderDetail(building);
  } catch (err) {
    console.error(err);
    const status = document.getElementById('nearbyStatus');
    if (status) {
      status.innerHTML = `<div class="nearbyError">Could not load nearby data. Overpass may be busy. Try again later.</div>`;
    }
  }
}


function showNearbyToolbar(building) {
  els.nearbyToolbar.classList.remove('hidden');
  els.toolbarBuilding.textContent = building.building_name;
}

function hideNearbyToolbar() {
  els.nearbyToolbar.classList.add('hidden');
  els.toolbarBuilding.textContent = 'Select a building';
}

els.nearbyToolbar.querySelectorAll('[data-nearby-toolbar]').forEach(btn => {
  btn.addEventListener('click', () => handleNearbyClick(btn.dataset.nearbyToolbar));
});

els.closeDetail.addEventListener('click', clearDetail);

async function init() {
  const res = await fetch('listings.csv');
  const text = await res.text();
  state.rows = parseCSV(text);
  state.buildings = groupBuildings(state.rows);
  renderMarkers();
}

init().catch(err => {
  console.error(err);
  alert('Could not load listings.csv. Please run with a local server.');
});

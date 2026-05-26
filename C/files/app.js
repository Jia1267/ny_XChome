/* ─────────────────────────────────────────────────────────
   NY Rental Map — app.js
   Fixes & upgrades over original:
   - Building letter on marker uses actual building name initial
   - Floor Plan field normalised (handles "Floor Plan" and "floor_plan")
   - Map style toggle wired to custom topbar buttons (replaces Leaflet control)
   - Panel slide animation via CSS grid transition
   - Better unit card rendering with coloured tags
   - Nearby results with richer list UI
   - Loading overlay while CSV loads
   - Unit count badge in topbar
   - Active toolbar button state
   - Error handling improvements
──────────────────────────────────────────────────────────── */

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
  mapOverlay: document.getElementById('mapOverlay'),
  unitCount: document.getElementById('unitCount'),
};

/* ─── Map Setup ─────────────────────────────────────────── */
const map = L.map('map', {
  zoomControl: true,
  scrollWheelZoom: true,
  zoomAnimation: true,
}).setView([40.74, -73.98], 12);

// Remove default Leaflet layer control — we use our own topbar buttons
const tileLayers = {
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
  }),
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  }),
};
tileLayers.light.addTo(map);

// Wire custom topbar map-style buttons
document.querySelectorAll('.style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const style = btn.dataset.style;
    Object.values(tileLayers).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    tileLayers[style].addTo(map);
    document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

const nearbyLayer = L.layerGroup().addTo(map);
const radiusLayer = L.layerGroup().addTo(map);
const subwayLineLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenRailwayMap contributors',
  maxZoom: 19,
  opacity: 0.68,
});

/* ─── CSV Parser ────────────────────────────────────────── */
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && inQ && n === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { row.push(cur); cur = ''; continue; }
    if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = []; continue;
    }
    cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const headers = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}

/* ─── Utilities ─────────────────────────────────────────── */
function money(n) {
  const num = Number(String(n).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0
    ? num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;
}

// Normalise floor plan field — CSV uses "Floor Plan" (with capital + space)
function getFloorPlan(unit) {
  return unit['Floor Plan'] || unit['floor_plan'] || unit['floorplan'] || '';
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = v => v * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Data Grouping ─────────────────────────────────────── */
function groupBuildings(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = row.building_id || row.address;
    if (!map.has(id)) {
      map.set(id, {
        id,
        building_name: row.building_name || row.address,
        address: row.address,
        city_area: row.city_area,
        lat: Number(row.lat),
        lng: Number(row.lng),
        link: row.link,
        utilities: row.utilities || '',
        amenities: row.amenities || '',
        nearby: row.nearby || '',
        units: [],
      });
    }
    map.get(id).units.push(row);
  }
  return [...map.values()].filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng));
}

function minRent(building) {
  const prices = building.units.map(u => Number(u.price)).filter(n => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}

/* ─── Building Markers ──────────────────────────────────── */
function buildingInitial(name) {
  // Use first alpha character of the building name (not a number)
  const match = name.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : name[0]?.toUpperCase() || 'B';
}

function markerIcon(active = false, building = null) {
  const unitCount = building ? building.units.length : 1;
  const bh = Math.min(72, 38 + unitCount * 7);
  const priceStr = building && minRent(building)
    ? money(minRent(building))
    : '';
  const initial = building ? buildingInitial(building.building_name) : 'B';

  return L.divIcon({
    className: '',
    html: `
      <div class="bMarker ${active ? 'active' : ''}" style="--bh:${bh}px">
        <div class="bShadow"></div>
        <div class="bBody">
          <div class="bWindows"></div>
          <div class="bLabel">${escapeHtml(initial)}</div>
        </div>
        <div class="bRoof"></div>
        ${priceStr ? `<div class="bPrice">${escapeHtml(priceStr)}</div>` : ''}
      </div>`,
    iconSize: [70, 90],
    iconAnchor: [35, 78],
    popupAnchor: [0, -72],
  });
}

function poiIcon(type) {
  const label = type === 'restaurant' ? '🍽' : type === 'store' ? '🛒' : 'M';
  return L.divIcon({
    className: '',
    html: `<div class="poiDot ${type}">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14],
  });
}

/* ─── Render Markers ────────────────────────────────────── */
function renderMarkers() {
  for (const marker of state.markers.values()) marker.remove();
  state.markers.clear();
  const bounds = [];

  state.buildings.forEach(b => {
    const marker = L.marker([b.lat, b.lng], {
      icon: markerIcon(state.selectedId === b.id, b),
      zIndexOffset: state.selectedId === b.id ? 1000 : 500,
    }).addTo(map);

    const popupContent = () => {
      const price = minRent(b);
      return `
        <div class="popupName">${escapeHtml(b.building_name)}</div>
        <div class="popupSub">
          ${escapeHtml(b.city_area)}
          ${price ? `· <span class="popupPrice">${money(price)}/mo</span>` : ''}
          · ${b.units.length} ${b.units.length === 1 ? 'unit' : 'units'}
        </div>`;
    };

    marker.bindPopup(popupContent, { maxWidth: 220, closeButton: false });
    marker.on('mouseover', () => {
      marker.setIcon(markerIcon(true, b));
      marker.openPopup();
    });
    marker.on('mouseout', () => {
      if (state.selectedId !== b.id) marker.setIcon(markerIcon(false, b));
      marker.closePopup();
    });
    marker.on('click', () => selectBuilding(b.id));
    state.markers.set(b.id, marker);
    bounds.push([b.lat, b.lng]);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13 });
}

/* ─── Detail Panel ──────────────────────────────────────── */
function tagHtml(text, color = '') {
  if (!text || text.toLowerCase() === 'contact agent') return '';
  return `<span class="tag ${color}">${escapeHtml(text)}</span>`;
}

function renderAmenitiesTags(str) {
  if (!str || str.toLowerCase() === 'contact agent') return '<span class="tag">Contact agent</span>';
  return str.split(/[;,]/).map(a => a.trim()).filter(Boolean)
    .map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('');
}

function renderDetail(building) {
  els.detailPanel.classList.remove('hidden');
  els.layout.classList.add('panelOpen');

  const price = minRent(building);
  const uniquePlans = [...new Set(building.units.map(u => getFloorPlan(u)).filter(Boolean))];

  els.detailContent.innerHTML = `
    <div class="panelContent">

      <!-- Hero -->
      <div class="buildingHero">
        <div class="heroArea">${escapeHtml(building.city_area)}</div>
        <h2 class="heroName">${escapeHtml(building.building_name)}</h2>
        <p class="heroAddress">${escapeHtml(building.address)}</p>
      </div>

      <!-- Price strip -->
      <div class="priceStrip">
        <div>
          <div class="priceFrom">Starting from</div>
          <div>
            <span class="priceAmount">${price ? money(price) : 'Contact agent'}</span>
            ${price ? '<span class="priceUnit">/month</span>' : ''}
          </div>
        </div>
        <div class="unitBadge">${building.units.length} ${building.units.length === 1 ? 'unit' : 'units'}</div>
      </div>

      <!-- Nearby section -->
      <div class="sectionTitle">🗺 Nearby</div>
      <div class="nearbyHint" style="font-size:12.5px;color:var(--text-3);margin-bottom:10px;">
        Use the toolbar at the bottom of the map to explore restaurants, stores, and subway stations.
      </div>
      <div id="nearbyStatus" class="nearbyStatus">
        ${state.nearbyMode ? renderNearbyResults() : '<div class="nearbyEmpty">No nearby layer selected yet.</div>'}
      </div>

      <!-- Units -->
      <div class="sectionTitle">🏠 Available units</div>
      ${building.units.map(u => {
        const fp = getFloorPlan(u);
        const p = money(u.price);
        const available = u.available_date || '';
        const lease = u.lease_term || '';
        const concession = u.concession && u.concession.toLowerCase() !== 'contact agent' ? u.concession : '';
        return `
          <div class="unitCard">
            <div class="unitCardTop">
              <div>
                <div class="unitPlan">${escapeHtml(fp || 'Unit')}</div>
                ${u.room_num ? `<div class="unitRoom">#${escapeHtml(u.room_num)}</div>` : ''}
              </div>
              <div style="text-align:right">
                <div class="unitPrice">${p || '—'}<span class="unitMo">/mo</span></div>
              </div>
            </div>
            <div class="unitMeta">
              ${available ? tagHtml(available, available.toLowerCase().includes('now') ? 'green' : 'blue') : ''}
              ${lease ? tagHtml(lease) : ''}
              ${concession ? tagHtml(concession, 'amber') : ''}
            </div>
          </div>`;
      }).join('')}

      <!-- Info grid -->
      <div class="sectionTitle">ℹ Details</div>
      <div class="infoGrid">
        <div class="infoBox">
          <div class="infoBoxLabel">Utilities</div>
          <div class="infoBoxVal">${escapeHtml(building.utilities || 'Contact agent')}</div>
        </div>
        <div class="infoBox">
          <div class="infoBoxLabel">Floor plans</div>
          <div class="infoBoxVal">${escapeHtml(uniquePlans.join(' · ') || 'Contact agent')}</div>
        </div>
        <div class="infoBox" style="grid-column:1/-1">
          <div class="infoBoxLabel">Amenities</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${renderAmenitiesTags(building.amenities)}</div>
        </div>
      </div>

      <!-- CTA -->
      ${building.link ? `
        <a class="ctaBtn" href="${escapeHtml(building.link)}" target="_blank" rel="noreferrer">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          View official listing
        </a>` : ''}

    </div>
  `;

  setTimeout(() => map.invalidateSize(), 150);
}

/* ─── Nearby Results HTML ───────────────────────────────── */
function renderNearbyResults() {
  if (!state.nearbyMode) return '';
  const modeLabels = {
    restaurant: { label: 'Restaurants within 200m', icon: '🍽', cls: 'restaurant' },
    store:      { label: 'Stores within 500m',      icon: '🛒', cls: 'store'      },
    subway:     { label: 'Subway stations within 1 mile', icon: 'M', cls: 'subway' },
  };
  const m = modeLabels[state.nearbyMode];
  if (!m) return '';

  if (state.nearbyItems.length === 0) {
    return `<div class="nearbyEmpty">No ${m.label.toLowerCase()} found in OpenStreetMap data.</div>`;
  }

  return `
    <div class="nearbyCount">${m.label} · ${state.nearbyItems.length} found</div>
    <ul class="nearbyList">
      ${state.nearbyItems.slice(0, 14).map(item => `
        <li class="nearbyItem">
          <div class="nearbyIcon ${m.cls}">${m.icon}</div>
          <div>
            <div class="nearbyName">${escapeHtml(item.name)}</div>
            <div class="nearbyMeta">${Math.round(item.distance)}m away${item.extra ? ' · ' + escapeHtml(item.extra) : ''}</div>
          </div>
        </li>`).join('')}
    </ul>`;
}

/* ─── Building Selection ────────────────────────────────── */
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
  setTimeout(() => map.flyTo([building.lat, building.lng], 16, { duration: 0.9 }), 120);
}

function clearDetail() {
  state.selectedId = null;
  clearNearby(false);
  els.detailPanel.classList.add('hidden');
  els.layout.classList.remove('panelOpen');
  hideNearbyToolbar();
  renderMarkers();
  setTimeout(() => map.invalidateSize(), 150);
}

function selectedBuilding() {
  return state.buildings.find(b => b.id === state.selectedId);
}

/* ─── Nearby Toolbar ────────────────────────────────────── */
function showNearbyToolbar(building) {
  els.nearbyToolbar.classList.remove('hidden');
  els.toolbarBuilding.textContent = building.building_name;
}

function hideNearbyToolbar() {
  els.nearbyToolbar.classList.add('hidden');
  els.toolbarBuilding.textContent = 'Select a building';
}

function setNearbyStatus(html) {
  const el = document.getElementById('nearbyStatus');
  if (el) el.innerHTML = html;
}

function clearNearby(updateDetail = true) {
  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  state.nearbyItems = [];
  state.nearbyMode = null;
  // Reset active state on toolbar buttons
  document.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
  if (updateDetail) {
    const b = selectedBuilding();
    if (b) renderDetail(b);
  }
}

/* ─── Overpass Queries ──────────────────────────────────── */
function overpassQuery(type, building) {
  const at = `around:${type === 'restaurant' ? 200 : type === 'store' ? 500 : 1609},${building.lat},${building.lng}`;
  const filter =
    type === 'restaurant' ? `["amenity"~"restaurant|cafe|fast_food"]` :
    type === 'store'      ? `["shop"], (node["amenity"="pharmacy"](${at}); way["amenity"="pharmacy"](${at}); relation["amenity"="pharmacy"](${at});)` :
    `["railway"="station"]["station"="subway"], (node["railway"="station"]["subway"="yes"](${at}); way["railway"="station"]["subway"="yes"](${at});)`;

  if (type === 'restaurant' || type === 'subway') {
    return `[out:json][timeout:25];
(node${type === 'restaurant' ? '["amenity"~"restaurant|cafe|fast_food"]' : '["railway"="station"]["station"="subway"]'}(${at});
 way${type === 'restaurant' ? '["amenity"~"restaurant|cafe|fast_food"]' : '["railway"="station"]["station"="subway"]'}(${at});
 relation${type === 'restaurant' ? '["amenity"~"restaurant|cafe|fast_food"]' : '["railway"="station"]["station"="subway"]'}(${at});
 node["railway"="station"]["subway"="yes"](${at});
 node["public_transport"="station"]["subway"="yes"](${at});
);out center tags;`;
  }
  // store
  return `[out:json][timeout:25];
(node["shop"](${at});
 way["shop"](${at});
 node["amenity"="pharmacy"](${at});
 way["amenity"="pharmacy"](${at});
);out center tags;`;
}

async function fetchOverpass(type, building) {
  const query = overpassQuery(type, building);
  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  const seen = new Set();

  return (data.elements || []).map(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const tags = el.tags || {};
    const name = tags.name || tags.brand || tags.operator ||
      (type === 'subway' ? 'Subway station' : type === 'store' ? 'Store' : 'Restaurant');
    const key = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const distance = haversineMeters(building.lat, building.lng, lat, lng);
    const extra =
      type === 'restaurant' ? (tags.cuisine || tags.amenity || '') :
      type === 'store'      ? (tags.shop || tags.amenity || '') :
      (tags.route_ref || tags.ref || tags.line || '');
    return { lat, lng, name, distance, extra };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
}

function drawRadius(building, meters, color) {
  radiusLayer.clearLayers();
  L.circle([building.lat, building.lng], {
    radius: meters,
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.04,
    dashArray: '5 5',
    className: 'radius-circle',
  }).addTo(radiusLayer);
}

function renderNearbyMarkers(type, building, items) {
  nearbyLayer.clearLayers();
  items.forEach(item => {
    L.marker([item.lat, item.lng], { icon: poiIcon(type), zIndexOffset: 300 })
      .bindPopup(`<div class="popupName">${escapeHtml(item.name)}</div><div class="popupSub">${Math.round(item.distance)}m away${item.extra ? ' · ' + escapeHtml(item.extra) : ''}</div>`)
      .addTo(nearbyLayer);
  });
  const bMarker = state.markers.get(building.id);
  const group = L.featureGroup([...nearbyLayer.getLayers(), ...(bMarker ? [bMarker] : [])]);
  if (group.getLayers().length > 1) {
    map.fitBounds(group.getBounds(), { padding: [80, 80], maxZoom: type === 'subway' ? 14 : 17 });
  }
}

async function handleNearbyClick(type) {
  const building = selectedBuilding();
  if (!building) return;
  if (type === 'clear') { clearNearby(true); return; }

  // Toggle: clicking same type again clears
  if (state.nearbyMode === type) { clearNearby(true); return; }

  const radius = type === 'restaurant' ? 200 : type === 'store' ? 500 : 1609;
  const colors  = { restaurant: '#f97316', store: '#2563eb', subway: '#1a56e8' };

  state.nearbyMode = type;
  state.nearbyItems = [];
  nearbyLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  if (type === 'subway') subwayLineLayer.addTo(map);
  drawRadius(building, radius, colors[type]);

  // Mark button active
  document.querySelectorAll('.toolbar-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.nearbyToolbar === type);
  });

  setNearbyStatus(`
    <div class="nearbyLoading">
      <div class="loadingSpinner"></div>
      Loading ${type === 'restaurant' ? 'restaurants' : type === 'store' ? 'stores' : 'subway stations'}…
    </div>`);

  try {
    const items = await fetchOverpass(type, building);
    state.nearbyItems = items;
    renderNearbyMarkers(type, building, items);
    renderDetail(building);
  } catch (err) {
    console.error(err);
    setNearbyStatus(`<div class="nearbyError">⚠ Could not load nearby data — Overpass may be busy. Try again in a moment.</div>`);
  }
}

/* ─── Event Listeners ───────────────────────────────────── */
els.closeDetail.addEventListener('click', clearDetail);

els.nearbyToolbar.querySelectorAll('[data-nearby-toolbar]').forEach(btn => {
  btn.addEventListener('click', () => handleNearbyClick(btn.dataset.nearbyToolbar));
});

// Click on empty map to deselect
map.on('click', e => {
  if (e.originalEvent.target.closest('.bMarker')) return;
  if (state.selectedId) clearDetail();
});

/* ─── Init ──────────────────────────────────────────────── */
async function init() {
  els.mapOverlay.classList.remove('hidden');
  try {
    const res = await fetch('listings.csv');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    state.rows = parseCSV(text);
    state.buildings = groupBuildings(state.rows);
    renderMarkers();

    // Update unit count badge
    const totalUnits = state.buildings.reduce((s, b) => s + b.units.length, 0);
    els.unitCount.textContent = `${state.buildings.length} buildings · ${totalUnits} listings`;
  } catch (err) {
    console.error(err);
    alert('Could not load listings.csv. Please run with a local server:\n  python -m http.server 5500');
  } finally {
    els.mapOverlay.classList.add('hidden');
  }
}

init();

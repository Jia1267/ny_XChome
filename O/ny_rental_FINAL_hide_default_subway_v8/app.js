const state = {
  buildings: [],
  buildingMap: new Map(),
  units: [],
  photos: [],
  pois: [],
  markers: new Map(),
  communityMarkers: [],
  selectedId: null,
  selectedUnitId: null,
  detailView: 'building',
  nearbyItems: [],
  nearbyMode: null,
  panelExpanded: false,
  legendAdded: false,
};

const els = {
  layout: document.getElementById('layout'),
  detailPanel: document.getElementById('detailPanel'),
  detailContent: document.getElementById('detailContent'),
  closeDetail: document.getElementById('closeDetail'),
  nearbyToolbar: document.getElementById('nearbyToolbar'),
  toolbarBuilding: document.getElementById('toolbarBuilding'),
};

const map = L.map('map', { zoomControl: true, scrollWheelZoom: true }).setView([40.776, -73.965], 11);

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
const communityLayer = L.layerGroup().addTo(map);
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
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim().replace(/^\uFEFF/, ''));
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}

async function loadCSV(filename) {
  const res = await fetch(filename + '?v=' + Date.now());
  if (!res.ok) throw new Error(`${filename} HTTP ${res.status}`);
  return parseCSV(await res.text());
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : fallback;
}

function money(value) {
  const num = toNumber(value, NaN);
  return Number.isFinite(num)
    ? num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : 'N/A';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function splitList(text) {
  return String(text || '').split(/[;|]/).map(v => v.trim()).filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
}

function normalizedKey(value) {
  return String(value || '').trim();
}

function bedroomLabel(beds) {
  const n = toNumber(beds, 0);
  return n <= 0 ? 'Studio' : `${n} bed`;
}

function bathLabel(baths) {
  const n = toNumber(baths, 1);
  return `${Number.isInteger(n) ? n : n.toFixed(1)} bath`;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCategory(category, name = '') {
  const c = String(category || '').toLowerCase();
  const n = String(name || '').toLowerCase();

  // Important: classify restaurants / transit first.
  // Some POIs contain words like "Columbia University" in their name, for example
  // "Xi'an Famous Foods - Columbia University" or "116 St-Columbia University Station".
  // Those should NOT become big school badges.
  if (c.includes('restaurant') || c.includes('chinese_food')) return 'chineseFood';
  if (c.includes('grocery') || c.includes('facility') || c.includes('supermarket')) return 'chineseStore';
  if (c.includes('mall') || c.includes('shopping')) return 'mall';
  if (c.includes('transit') || c.includes('subway') || c.includes('station') || n.includes('station')) return 'subway';

  const isK12 =
    n.includes('public school') ||
    n.includes('high school') ||
    n.includes('middle school') ||
    n.includes('elementary') ||
    n.includes('montessori') ||
    n.includes('pre-k') ||
    n.includes('daycare');

  const isCollegeLike =
    n === 'columbia university' ||
    n === 'new york university' ||
    n === 'nyu' ||
    n.includes('pace university') ||
    n.includes('city college') ||
    n.includes('baruch college') ||
    n.includes('laguardia community college') ||
    (c.includes('school') && (n.includes('university') || n.includes('college')));

  if (isCollegeLike && !isK12) return 'university';
  if (c.includes('school') || c.includes('university') || c.includes('college')) return 'community';
  if (c.includes('community')) return 'community';
  return 'community';
}

function buildData(buildingsRows, unitsRows, photosRows, poiRows) {
  const photosByBuilding = new Map();
  const photosByUnit = new Map();
  for (const p of photosRows) {
    if (!p.photo_url) continue;
    const photo = { ...p, photo_type: p.photo_type || 'photo' };
    if (p.unit_id) {
      const list = photosByUnit.get(p.unit_id) || [];
      list.push(photo);
      photosByUnit.set(p.unit_id, list);
    } else if (p.building_id) {
      const list = photosByBuilding.get(p.building_id) || [];
      list.push(photo);
      photosByBuilding.set(p.building_id, list);
    }
  }

  const unitsByBuilding = new Map();
  const units = unitsRows.map(u => ({
    ...u,
    unit_id: normalizedKey(u.unit_id),
    building_id: normalizedKey(u.building_id),
    priceNum: toNumber(u.gross_rent || u.net_effective_rent, 0),
    netRentNum: toNumber(u.net_effective_rent, NaN),
    bedsNum: toNumber(u.beds, 0),
    bathsNum: toNumber(u.baths, 1),
    sqftNum: toNumber(u.sqft, NaN),
    defaultPeopleNum: toNumber(u.default_people, NaN),
    maxPeopleNum: toNumber(u.max_people, NaN),
    rentStepNum: toNumber(u.rent_step_difference, 200),
    photos: photosByUnit.get(normalizedKey(u.unit_id)) || [],
  })).filter(u => u.building_id && u.unit_id && u.priceNum > 0);

  for (const u of units) {
    const list = unitsByBuilding.get(u.building_id) || [];
    list.push(u);
    unitsByBuilding.set(u.building_id, list);
  }

  const buildings = buildingsRows.map(b => {
    const id = normalizedKey(b.building_id);
    const buildingUnits = (unitsByBuilding.get(id) || []).sort((a, b) => a.priceNum - b.priceNum);
    const lat = toNumber(b.lat, NaN);
    const lng = toNumber(b.lng, NaN);
    return {
      ...b,
      id,
      building_name: b.building_name || id,
      lat,
      lng,
      units: buildingUnits,
      photos: photosByBuilding.get(id) || [],
    };
  }).filter(b => b.id && Number.isFinite(b.lat) && Number.isFinite(b.lng) && b.units.length > 0);

  const poiMap = new Map();
  for (const p of poiRows) {
    const lat = toNumber(p.lat, NaN);
    const lng = toNumber(p.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !p.name) continue;
    const type = normalizeCategory(p.category || p.type, p.name);
    const normalizedName = String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const key = type === 'university'
      ? `${type}|${normalizedName}`
      : `${type}|${normalizedName}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (!poiMap.has(key)) {
      poiMap.set(key, {
        ...p,
        id: p.poi_id || key,
        type,
        lat,
        lng,
        note: p.notes || p.note || '',
      });
    }
  }

  state.buildings = buildings;
  state.units = units;
  state.photos = photosRows;
  state.pois = [...poiMap.values()];
  state.buildingMap = new Map(buildings.map(b => [b.id, b]));
}

function minRent(building) {
  const rents = building.units.map(u => u.priceNum).filter(n => Number.isFinite(n) && n > 0);
  return rents.length ? Math.min(...rents) : 0;
}

function maxRent(building) {
  const rents = building.units.map(u => u.priceNum).filter(n => Number.isFinite(n) && n > 0);
  return rents.length ? Math.max(...rents) : 0;
}

function floorPlans(building) {
  return uniqueValues(building.units.map(u => u.floor_plan)).join(' / ');
}

function bestBuildingPhotos(building) {
  const photos = [...building.photos];
  if (building.primary_photo_url) {
    photos.unshift({ photo_url: building.primary_photo_url, caption: `${building.building_name} primary photo`, photo_type: 'building_primary' });
  }
  const seen = new Set();
  return photos.filter(p => {
    if (!p.photo_url || seen.has(p.photo_url)) return false;
    seen.add(p.photo_url);
    return true;
  });
}

function bestUnitFloorPlan(unit) {
  const floor = unit.photos.find(p => String(p.photo_type).toLowerCase().includes('floor')) || unit.photos[0];
  return floor || null;
}

function markerIcon(active = false, building = null) {
  const unitCount = building ? building.units.length : 1;
  const rent = building ? money(minRent(building)) : '';
  const height = Math.min(78, 40 + Math.min(unitCount, 8) * 7);
  return L.divIcon({
    className: '',
    html: `
      <div class="buildingMarker ${active ? 'active' : ''}" style="--building-height:${height}px">
        <div class="buildingShadow"></div>
        <div class="buildingBody"><div class="buildingWindows"></div><div class="buildingLetter">R</div></div>
        <div class="buildingRoof"></div>
        <div class="buildingPrice">${rent}</div>
      </div>`,
    iconSize: [72, 96],
    iconAnchor: [36, 82],
    popupAnchor: [0, -76],
  });
}

function svgDataUri(svg) {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function getSchoolBadge(name) {
  const lowerName = String(name || '').toLowerCase();

  const badgeFor = (variant, label, shortText, bottomText, colors) => ({
    variant,
    label,
    img: svgDataUri([
      '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">',
      `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="55%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="${colors[2]}"/></linearGradient></defs>`,
      variant === 'nyu'
        ? '<rect x="8" y="8" width="72" height="72" rx="20" fill="url(#bg)"/>'
        : '<circle cx="44" cy="44" r="40" fill="url(#bg)"/>',
      '<circle cx="44" cy="44" r="30" fill="none" stroke="rgba(255,255,255,.46)" stroke-width="2.5"/>',
      '<path d="M20 36 44 25 68 36 44 47z" fill="#fff" opacity=".96"/>',
      '<path d="M29 43v9c0 7 8 12 15 14c7-2 15-7 15-14v-9" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="2.2"/>',
      `<text x="44" y="55" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${shortText.length > 3 ? 11 : 14}" font-weight="800" fill="#fff">${shortText}</text>`,
      `<text x="44" y="73" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${bottomText.length > 8 ? 7.5 : 8.5}" font-weight="700" fill="#fff">${bottomText}</text>`,
      '</svg>'
    ].join('')),
  });

  if (lowerName.includes('columbia')) {
    return badgeFor('columbia', 'Columbia', 'CU', 'COLUMBIA', ['#7dd3fc', '#2563eb', '#172554']);
  }
  if (lowerName.includes('new york university') || lowerName.includes('nyu')) {
    return badgeFor('nyu', 'NYU', 'NYU', 'NYU', ['#67e8f9', '#0284c7', '#0f172a']);
  }
  if (lowerName.includes('pace university')) {
    return badgeFor('pace', 'Pace', 'PACE', 'PACE', ['#93c5fd', '#2563eb', '#1e3a8a']);
  }
  if (lowerName.includes('city college')) {
    return badgeFor('citycollege', 'City College', 'CCNY', 'CITY COL', ['#60a5fa', '#1d4ed8', '#172554']);
  }
  if (lowerName.includes('baruch')) {
    return badgeFor('baruch', 'Baruch', 'BC', 'BARUCH', ['#7dd3fc', '#0ea5e9', '#075985']);
  }
  if (lowerName.includes('laguardia')) {
    return badgeFor('laguardia', 'LaGuardia', 'LAG', 'LAGUARDIA', ['#93c5fd', '#0284c7', '#0f172a']);
  }

  const cleaned = String(name || 'School').replace(/(University|College|Community College)/ig, '').trim();
  const label = cleaned.split(/\s+/).slice(0, 2).join(' ') || 'School';
  const shortText = label.split(/\s+/).map(w => w[0]).join('').slice(0, 4).toUpperCase() || 'UNI';
  return badgeFor('generic', label, shortText, label.toUpperCase().slice(0, 9), ['#7dd3fc', '#2563eb', '#0f172a']);
}

function poiIcon(input) {
  const type = typeof input === 'string' ? input : input?.type;
  const name = typeof input === 'string' ? '' : String(input?.name || '');

  if (type === 'university') {
    const badge = getSchoolBadge(name);
    return L.divIcon({
      className: '',
      html: `
        <div class="poiMarkerWrap prioritySchool typeUniversity school-${badge.variant}">
          <div class="schoolMarker school-${badge.variant}">
            <img class="schoolCrest" src="${badge.img}" alt="${badge.label}" />
            <div class="schoolMarkerLabel">${badge.label}</div>
          </div>
        </div>`,
      iconSize: [92, 96],
      iconAnchor: [46, 72],
      popupAnchor: [0, -60],
    });
  }

  const spec = {
    restaurant: { glyph: '🍽', label: 'Food', w: 44, h: 44, y: 22, cls: 'typeRestaurant' },
    store: { glyph: '🛒', label: 'Store', w: 44, h: 44, y: 22, cls: 'typeStore' },
    subway: { glyph: 'M', label: 'Subway', w: 46, h: 46, y: 23, cls: 'typeSubway' },
    chineseStore: { glyph: '🛒', label: '中超', w: 50, h: 50, y: 25, cls: 'typeChineseStore' },
    chineseFood: { glyph: '🍜', label: '中餐', w: 50, h: 50, y: 25, cls: 'typeChineseFood' },
    mall: { glyph: '🛍', label: 'Mall', w: 52, h: 52, y: 26, cls: 'typeMall' },
    community: { glyph: '华', label: '社区', w: 50, h: 50, y: 25, cls: 'typeCommunity' },
  };
  const cfg = spec[type] || { glyph: '•', label: '', w: 42, h: 42, y: 21, cls: '' };
  return L.divIcon({
    className: '',
    html: `
      <div class="poiMarkerWrap ${cfg.cls || ''}">
        <div class="poiMarker ${type} ${cfg.cls || ''}">
          <span class="poiGlyph" aria-hidden="true">${cfg.glyph}</span>
          ${cfg.label ? `<span class="poiLabel">${cfg.label}</span>` : ''}
        </div>
      </div>`,
    iconSize: [cfg.w, cfg.h],
    iconAnchor: [Math.round(cfg.w / 2), cfg.y],
    popupAnchor: [0, -18],
  });
}


function renderMarkers() {
  for (const m of state.markers.values()) m.remove();
  state.markers.clear();
  const bounds = [];
  state.buildings.forEach(b => {
    const marker = L.marker([b.lat, b.lng], {
      icon: markerIcon(state.selectedId === b.id, b),
      zIndexOffset: 700,
    }).addTo(map);
    marker.bindPopup(`<div class="popupTitle">${escapeHtml(b.building_name)}</div><div class="popupSub">From ${money(minRent(b))} · ${b.units.length} units</div>`);
    marker.on('mouseover', () => { marker.setIcon(markerIcon(true, b)); marker.openPopup(); });
    marker.on('mouseout', () => { if (state.selectedId !== b.id) marker.setIcon(markerIcon(false, b)); });
    marker.on('click', () => selectBuilding(b.id));
    state.markers.set(b.id, marker);
    bounds.push([b.lat, b.lng]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12 });
}

function updatePoiPriorityByZoom() {
  const zoom = map.getZoom();
  const mapEl = map.getContainer();
  mapEl.classList.toggle('zoomedOutPOI', zoom <= 12);
  mapEl.classList.toggle('poiSchoolsOnly', zoom <= 11);
  (state.communityMarkers || []).forEach(entry => {
    if (!entry?.marker) return;
    const isSchool = entry.type === 'university';
    entry.marker.setZIndexOffset(isSchool ? (zoom <= 11 ? 3200 : 2200) : (zoom <= 11 ? 40 : 260));
  });
}

function renderCommunityLayer() {
  communityLayer.clearLayers();
  state.communityMarkers = [];

  // Default lifestyle POIs should stay clean.
  // Subway / transit stations are not shown by default.
  // Users can still click the Subway button to show nearby subway stations.
  const defaultPois = state.pois.filter(item => item.type !== 'subway');

  defaultPois.forEach(item => {
    const marker = L.marker([item.lat, item.lng], {
      icon: poiIcon(item),
      zIndexOffset: item.type === 'university' ? 2200 : 260,
    }).bindPopup(`
      <div class="popupTitle">${escapeHtml(item.name)}</div>
      <div class="popupSub">${escapeHtml(item.address || '')}<br>${escapeHtml(item.note || item.category || '')}</div>
    `).addTo(communityLayer);
    state.communityMarkers.push({ marker, type: item.type });
  });
  updatePoiPriorityByZoom();
}

function renderPhotoGallery(building) {
  const photos = bestBuildingPhotos(building).slice(0, 4);
  if (!photos.length) {
    return `<div class="photoGrid emptyPhotos">${['Exterior','Lobby','Unit','Amenity'].map((label, idx) => `
      <div class="photoCard photo${idx + 1}"><span>${label}</span><strong>${escapeHtml(building.building_name)}</strong></div>
    `).join('')}</div><div class="photoNote">No real building photo URL yet. Add image URLs in photos.csv or primary_photo_url in buildings.csv.</div>`;
  }
  const cards = photos.map((p, idx) => `
    <button class="photoCard realPhoto photo${idx + 1}" type="button" data-photo-url="${escapeHtml(p.photo_url)}" style="background-image: linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.55)), url('${escapeHtml(p.photo_url)}')">
      <span>${escapeHtml(p.photo_type || 'Photo')}</span>
      <strong>${escapeHtml(p.caption || building.building_name)}</strong>
    </button>
  `).join('');
  return `<div class="photoGrid">${cards}</div>`;
}

function buildingBadges(building) {
  const amenities = splitList(building.amenities);
  const security = splitList(building.security_features);
  const utilities = building.utilities_policy || '';
  return `
    <div class="pillList compactPills">
      ${amenities.slice(0, 6).map(a => `<span>${escapeHtml(a)}</span>`).join('')}
      ${security.slice(0, 3).map(s => `<span>${escapeHtml(s)}</span>`).join('')}
      ${utilities ? `<span>${escapeHtml(utilities)}</span>` : ''}
    </div>`;
}

function renderBuildingIntro(building) {
  return `
    <div class="buildingIntroCard">
      <div class="sectionTitle">Building introduction</div>
      <p>${escapeHtml(building.description || `${building.building_name} is a rental building in ${building.neighborhood || building.city_area || 'New York City'}.`)}</p>
      ${buildingBadges(building)}
      <div class="buildingFacts">
        <div><span>Area</span><strong>${escapeHtml([building.city_area, building.neighborhood].filter(Boolean).join(' · ') || 'New York')}</strong></div>
        <div><span>Lease</span><strong>${escapeHtml(building.lease_term_default || 'Ask agent')}</strong></div>
        <div><span>Nearby</span><strong>${escapeHtml(building.nearby_summary || building.transit_summary || 'Check map')}</strong></div>
      </div>
    </div>`;
}

function unitKey(unit) {
  return unit.unit_id;
}

function peopleForUnit(unit) {
  if (Number.isFinite(unit.defaultPeopleNum) && unit.defaultPeopleNum > 0) return unit.defaultPeopleNum;
  if (unit.bedsNum <= 0) return 1;
  if (unit.bedsNum === 1) return 2;
  return 3;
}

function splitByPeople(totalMonthly, people, step = 200, unit = null) {
  const n = Math.max(1, Math.floor(toNumber(people, 1)));
  if (n === 1) return [{ label: unit?.space_1_name || 'Whole unit', amount: totalMonthly }];
  const labelsFromUnit = [unit?.space_1_name, unit?.space_2_name, unit?.space_3_name].filter(Boolean);
  const defaultLabels = {
    2: ['Living room', 'Bedroom'],
    3: ['Living room', 'Second bedroom', 'Primary bedroom'],
    4: ['Living room', 'Flex room', 'Second bedroom', 'Primary bedroom'],
  };
  const labels = labelsFromUnit.length >= n ? labelsFromUnit : (defaultLabels[n] || Array.from({ length: n }, (_, i) => `Space ${i + 1}`));
  const offsetTotal = step * (n * (n - 1) / 2);
  const base = Math.max(0, (totalMonthly - offsetTotal) / n);
  return Array.from({ length: n }, (_, i) => ({ label: labels[i] || `Space ${i + 1}`, amount: base + i * step }));
}

function renderSimpleUnitList(building) {
  return building.units.map(u => {
    const sqft = Number.isFinite(u.sqftNum) ? `${u.sqftNum} sqft` : 'sqft N/A';
    const people = peopleForUnit(u);
    return `
      <button class="unitPreview" type="button" data-unit-id="${escapeHtml(u.unit_id)}">
        <div class="unitPreviewTop">
          <span>${escapeHtml(u.floor_plan || 'Floor plan')} · #${escapeHtml(u.unit_number || u.unit_id)}</span>
          <strong>${money(u.priceNum)}/mo</strong>
        </div>
        <div class="unitPreviewMeta">
          <span>${bedroomLabel(u.bedsNum)}</span>
          <span>${bathLabel(u.bathsNum)}</span>
          <span>${escapeHtml(sqft)}</span>
          <span>${people > 1 ? `Can split: ${people} people` : 'Private unit'}</span>
        </div>
        <p>Start: ${escapeHtml(u.available_date || 'Ask agent')} · Lease: ${escapeHtml(u.lease_term || building.lease_term_default || 'Ask agent')} · Offer: ${escapeHtml(u.concession || 'Ask agent')}</p>
      </button>`;
  }).join('');
}

function renderFloorPlanVisual(unit) {
  const p = bestUnitFloorPlan(unit);
  if (p?.photo_url) {
    return `<a class="floorPlanImageLink" href="${escapeHtml(p.photo_url)}" target="_blank" rel="noreferrer"><img class="floorPlanImage" src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.caption || unit.floor_plan || 'Floor plan')}" loading="lazy" /><span>${escapeHtml(p.caption || 'Open floor plan')}</span></a>`;
  }
  if (unit.bedsNum <= 0) {
    return `<div class="floorPlanBox detailed studioPlan"><div class="floorRoom large">Studio / Sleeping Area</div><div class="floorRoom small">Kitchen</div><div class="floorRoom bath">Bath</div></div>`;
  }
  if (unit.bedsNum === 1) {
    return `<div class="floorPlanBox detailed oneBedPlan"><div class="floorRoom bedroom">Bedroom<br><small>+$200 vs living</small></div><div class="floorRoom large">Living Room<br><small>possible shared room</small></div><div class="floorRoom small">Kitchen</div><div class="floorRoom bath">Bath</div></div>`;
  }
  return `<div class="floorPlanBox detailed twoBedPlan"><div class="floorRoom bedroom">Primary Bedroom<br><small>highest share</small></div><div class="floorRoom bedroom2">Second Bedroom<br><small>$200 less than primary</small></div><div class="floorRoom large">Living Room<br><small>$200 less than bedroom</small></div><div class="floorRoom small">Kitchen</div><div class="floorRoom bath">Bath</div>${unit.bathsNum >= 2 ? '<div class="floorRoom bath">Bath 2</div>' : ''}</div>`;
}

function roomDescription(unit) {
  if (unit.verification_notes) return unit.verification_notes;
  if (unit.bedsNum <= 0) return 'This studio is best treated as one private living and sleeping space.';
  if (unit.bedsNum === 1) return 'This 1-bedroom unit may work for two people if the lease allows living-room occupancy or a flex-wall setup.';
  return 'This larger unit may work for roommates using bedroom and living-room split rules. Always confirm roommate and partition rules in writing.';
}

function renderPriceCalculator(building, unit) {
  const baseRent = unit.priceNum;
  const people = peopleForUnit(unit);
  const deposit = toNumber(unit.security_deposit_amount, baseRent);
  const broker = toNumber(unit.broker_fee_amount, 0);
  const fees = toNumber(unit.amenity_fee_amount, 520);
  const utilities = toNumber(unit.utilities_estimate_monthly, 180);
  return `
    <div class="calculator" id="rentCalculator" data-unit-id="${escapeHtml(unit.unit_id)}">
      <div class="calcGrid">
        <label>Monthly gross rent<input id="calcRent" class="readonlyInput" type="number" value="${Math.round(baseRent)}" readonly /></label>
        <label>Lease months<input id="calcLease" type="number" min="1" value="${toNumber(unit.lease_term, toNumber(building.lease_term_default, 12)) || 12}" /></label>
        <label>Free months / concession<input id="calcFree" type="number" min="0" step="0.5" value="0" /></label>
        <label>People sharing this unit<input id="calcPeople" type="number" min="1" value="${people}" /></label>
        <label>Security deposit<input id="calcDeposit" type="number" min="0" value="${Math.round(deposit)}" /></label>
        <label>Broker fee<input id="calcBroker" type="number" min="0" value="${Math.round(broker)}" /></label>
        <label>Amenity / application fees<input id="calcFees" type="number" min="0" value="${Math.round(fees)}" /></label>
        <label>Utilities estimate / month<input id="calcUtilities" type="number" min="0" value="${Math.round(utilities)}" /></label>
      </div>
      <button class="calcBtn" id="calcBtn" type="button">Calculate rent cost</button>
      <div class="calcResults" id="calcResults"></div>
      <div id="shareCalcResults"></div>
    </div>`;
}

function renderDynamicSplit(totalMonthly, people, moveInParts, unit) {
  const step = unit?.rentStepNum || 200;
  const shares = splitByPeople(totalMonthly, people, step, unit);
  const n = shares.length;
  const oneTimeTotal = moveInParts.deposit + moveInParts.broker + moveInParts.fees;
  const oneTimePerPerson = oneTimeTotal / n;
  return `<div class="shareBox calculatorShareBox">
    <div class="shareHeader"><strong>${n === 1 ? 'One-person plan' : `${n}-person shared plan`}</strong><span>${n} ${n === 1 ? 'person' : 'people'}</span></div>
    <div class="shareRows shareRowsDetailed">${shares.map(s => `<div><span>${escapeHtml(s.label)}</span><strong>${money(s.amount)}/mo</strong><em>Estimated move-in: ${money(s.amount + oneTimePerPerson)}</em></div>`).join('')}</div>
    <div class="moveInSplitBox">
      <div><span>Deposit split</span><strong>${money(moveInParts.deposit / n)}</strong></div>
      <div><span>Broker fee split</span><strong>${money(moveInParts.broker / n)}</strong></div>
      <div><span>Amenity/application split</span><strong>${money(moveInParts.fees / n)}</strong></div>
      <div><span>One-time fees per person</span><strong>${money(oneTimePerPerson)}</strong></div>
    </div>
    <p>Monthly rent uses the room-price difference rule. Move-in one-time fees are split equally by headcount.</p>
  </div>`;
}

function calculateRent() {
  const unit = findSelectedUnit(selectedBuilding());
  const gross = toNumber(document.getElementById('calcRent')?.value, 0);
  const lease = Math.max(1, toNumber(document.getElementById('calcLease')?.value, 12));
  const free = Math.min(lease, Math.max(0, toNumber(document.getElementById('calcFree')?.value, 0)));
  const people = Math.max(1, Math.floor(toNumber(document.getElementById('calcPeople')?.value, 1)));
  const deposit = Math.max(0, toNumber(document.getElementById('calcDeposit')?.value, 0));
  const broker = Math.max(0, toNumber(document.getElementById('calcBroker')?.value, 0));
  const fees = Math.max(0, toNumber(document.getElementById('calcFees')?.value, 0));
  const utilities = Math.max(0, toNumber(document.getElementById('calcUtilities')?.value, 0));
  const netEffective = gross * Math.max(0, lease - free) / lease;
  const monthlyTotal = netEffective + utilities;
  const oneTimeFees = deposit + broker + fees;
  const moveIn = monthlyTotal + oneTimeFees;
  const result = document.getElementById('calcResults');
  if (result) result.innerHTML = `
    <div><span>Net effective rent</span><strong>${money(netEffective)}/mo</strong></div>
    <div><span>Whole-unit monthly total</span><strong>${money(monthlyTotal)}/mo</strong></div>
    <div><span>Whole-unit move-in cost</span><strong>${money(moveIn)}</strong></div>
    <div><span>One-time fees / person</span><strong>${money(oneTimeFees / people)}</strong></div>
    <p>Formula: gross rent × paid months ÷ lease months, then utilities are added. Deposit, broker fee, and amenity/application fees are split by people below.</p>`;
  const share = document.getElementById('shareCalcResults');
  if (share) share.innerHTML = renderDynamicSplit(monthlyTotal, people, { deposit, broker, fees }, unit);
}

function selectedBuilding() { return state.selectedId ? state.buildingMap.get(state.selectedId) : null; }
function findSelectedUnit(building) {
  if (!building) return null;
  return building.units.find(u => u.unit_id === state.selectedUnitId) || building.units[0] || null;
}

function renderBuildingOverview(building) {
  state.detailView = 'building';
  state.selectedUnitId = null;
  els.detailPanel.classList.remove('hidden');
  els.layout.classList.add('panelOpen');
  const rentMin = minRent(building), rentMax = maxRent(building);
  els.detailContent.innerHTML = `
    <div class="panelActions">${expandButtonHtml()}</div>
    <div class="compactHero"><div><h2>${escapeHtml(building.building_name)}</h2><p>${escapeHtml(building.address)}<br>${escapeHtml([building.city_area, building.neighborhood].filter(Boolean).join(' · '))}</p></div><strong>${money(rentMin)}+</strong></div>
    ${renderPhotoGallery(building)}
    ${renderBuildingIntro(building)}
    <div class="compactStats">
      <div><span>Available</span><strong>${building.units.length} units</strong></div>
      <div><span>Rent range</span><strong>${money(rentMin)} - ${money(rentMax)}</strong></div>
      <div><span>Floor plans</span><strong>${escapeHtml(floorPlans(building)) || 'Ask agent'}</strong></div>
    </div>
    <div class="sectionTitle">Available rooms / units</div>
    <div class="simpleHelp">Click one unit to see room details, the real floor plan image from photos.csv, roommate split, and rent calculator.</div>
    <div class="unitPreviewList">${renderSimpleUnitList(building)}</div>
    <div class="sectionTitle">Building links</div>
    <div class="buttonGrid">
      ${building.availability_url ? `<a class="openLink smallLink" href="${escapeHtml(building.availability_url)}" target="_blank" rel="noreferrer">Availability</a>` : ''}
      ${building.official_website ? `<a class="openLink smallLink" href="${escapeHtml(building.official_website)}" target="_blank" rel="noreferrer">Official website</a>` : ''}
    </div>`;
  resetDetailPanelScroll();
  setTimeout(() => map.invalidateSize(), 120);
}

function renderUnitDetail(building, unit) {
  state.detailView = 'unit';
  els.detailPanel.classList.remove('hidden');
  els.layout.classList.add('panelOpen');
  els.detailContent.innerHTML = `
    <div class="roomTopActions"><button class="backBtn" type="button" id="backToUnits">← Back to building overview</button><div class="roomActionGroup">${expandButtonHtml()}${shareButtonHtml()}</div></div>
    <div class="unitDetailHeader roomOnlyHeader"><span>${escapeHtml(building.building_name)}</span><h2>${escapeHtml(unit.floor_plan || 'Floor plan')} · #${escapeHtml(unit.unit_number || unit.unit_id)}</h2><p>${escapeHtml(building.address)}</p><strong>${money(unit.priceNum)}/mo</strong></div>
    <div class="sectionTitle">Room introduction</div><div class="roomIntroCard"><p>${escapeHtml(roomDescription(unit))}</p><div class="unitMeta bigMeta"><span>${bedroomLabel(unit.bedsNum)}</span><span>${bathLabel(unit.bathsNum)}</span><span>${Number.isFinite(unit.sqftNum) ? `${unit.sqftNum} sqft` : 'sqft N/A'}</span><span>Available: ${escapeHtml(unit.available_date || 'Ask agent')}</span></div></div>
    <div class="sectionTitle">This unit floor plan</div>${renderFloorPlanVisual(unit)}
    <div class="warningBox"><strong>隔断 / flex wall 注意：</strong> 客厅住人、临时墙、帘子隔断、书柜隔断不一定被允许。签约前一定要问 management 要 written approval。</div>
    <div class="sectionTitle">Rent calculator and roommate split for this room</div>${renderPriceCalculator(building, unit)}
    <div class="sectionTitle">This room's lease and price details</div><div class="infoGrid wide">
      <div class="infoBox"><span>Gross rent</span><strong>${money(unit.priceNum)} / month</strong></div>
      <div class="infoBox"><span>Net effective rent</span><strong>${Number.isFinite(unit.netRentNum) ? `${money(unit.netRentNum)} / month` : 'Not listed'}</strong></div>
      <div class="infoBox"><span>Lease term</span><strong>${escapeHtml(unit.lease_term || building.lease_term_default || 'Ask agent')}</strong></div>
      <div class="infoBox"><span>Start date</span><strong>${escapeHtml(unit.available_date || 'Ask agent')}</strong></div>
      <div class="infoBox"><span>Concession / offer</span><strong>${escapeHtml(unit.concession || 'Ask agent')}</strong></div>
      <div class="infoBox"><span>Source checked</span><strong>${escapeHtml(unit.source_last_checked || building.source_last_checked || 'N/A')}</strong></div>
    </div>
    <div class="sectionTitle">Room-level risks to check</div><ul class="riskList"><li>Ask whether this exact unit allows roommates, living-room occupancy, or flex wall.</li><li>Ask whether the listed price is gross rent or net effective rent.</li><li>Ask whether each roommate can be listed on the lease.</li><li>Ask whether discounts apply only to the first lease term.</li></ul>
    <div class="sectionTitle">Building support for this unit</div>${buildingBadges(building)}
    ${unit.source_url ? `<a class="openLink" href="${escapeHtml(unit.source_url)}" target="_blank" rel="noreferrer">Open this unit source</a>` : ''}`;
  calculateRent();
  resetDetailPanelScroll();
  setTimeout(() => map.invalidateSize(), 120);
}

function renderDetail(building) {
  if (!building) return;
  if (state.detailView === 'unit') return renderUnitDetail(building, findSelectedUnit(building));
  return renderBuildingOverview(building);
}

function expandButtonHtml() {
  return `<button class="iconActionBtn" type="button" data-panel-expand title="${state.panelExpanded ? 'Shrink panel' : 'Expand panel'}" aria-label="${state.panelExpanded ? 'Shrink panel' : 'Expand panel'}"><span class="expandIcon">⤢</span></button>`;
}

function shareButtonHtml() {
  return `<button class="iconActionBtn primary shareIconBtn" type="button" data-share-room title="Share this room" aria-label="Share this room"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.7 10.7 15.3 6.3M8.7 13.3l6.6 4.4"></path></svg></button>`;
}

function shareUrlFor(building, unit = null) {
  const url = new URL(window.location.href);
  url.searchParams.set('building', building.id);
  if (unit) url.searchParams.set('unit', unit.unit_id); else url.searchParams.delete('unit');
  return url.toString();
}

function setShareRoute(building, unit = null, replace = false) {
  const url = shareUrlFor(building, unit);
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

function clearShareRoute() {
  const url = new URL(window.location.href);
  url.searchParams.delete('building');
  url.searchParams.delete('unit');
  window.history.pushState({}, '', url);
}

async function copyShareLink(button, building, unit) {
  const link = shareUrlFor(building, unit);
  try {
    await navigator.clipboard.writeText(link);
    button.classList.add('copied');
    setTimeout(() => button.classList.remove('copied'), 1400);
  } catch (_) {
    window.prompt('Copy this share link:', link);
  }
}

function togglePanelExpanded(force = null) {
  state.panelExpanded = force === null ? !state.panelExpanded : Boolean(force);
  els.layout.classList.toggle('panelExpanded', state.panelExpanded);
  setTimeout(() => map.invalidateSize(), 120);
}

function selectBuilding(id) {
  if (state.selectedId === id && !els.detailPanel.classList.contains('hidden') && state.detailView === 'building') {
    clearDetail();
    return;
  }
  const building = state.buildingMap.get(id);
  if (!building) return;
  state.selectedId = id;
  state.detailView = 'building';
  state.selectedUnitId = null;
  setShareRoute(building, null);
  clearNearby(false);
  renderMarkers();
  renderBuildingOverview(building);
  showNearbyToolbar(building);
  const marker = state.markers.get(id);
  if (marker) marker.openPopup();
  setTimeout(() => map.flyTo([building.lat, building.lng], Math.max(map.getZoom(), 15), { duration: 0.8 }), 100);
}

function clearDetail() {
  state.selectedId = null;
  state.selectedUnitId = null;
  state.detailView = 'building';
  clearNearby(false);
  els.detailPanel.classList.add('hidden');
  els.layout.classList.remove('panelOpen');
  togglePanelExpanded(false);
  hideNearbyToolbar();
  clearShareRoute();
  renderMarkers();
}

function resetDetailPanelScroll() {
  requestAnimationFrame(() => { els.detailPanel.scrollTop = 0; els.detailContent.scrollTop = 0; });
}

function showNearbyToolbar(building) {
  els.nearbyToolbar.classList.remove('hidden');
  els.toolbarBuilding.textContent = building.building_name;
}

function hideNearbyToolbar() {
  els.nearbyToolbar.classList.add('hidden');
  els.toolbarBuilding.textContent = 'Select a building';
}

function clearNearby(updateDetail = true) {
  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  state.nearbyItems = [];
  state.nearbyMode = null;
  if (updateDetail && selectedBuilding()) renderDetail(selectedBuilding());
}

function overpassQueryFor(type, building) {
  if (type === 'restaurant') return `[out:json][timeout:25];(node["amenity"~"restaurant|cafe|fast_food"](around:200,${building.lat},${building.lng});way["amenity"~"restaurant|cafe|fast_food"](around:200,${building.lat},${building.lng}););out center tags;`;
  if (type === 'store') return `[out:json][timeout:25];(node["shop"](around:500,${building.lat},${building.lng});way["shop"](around:500,${building.lat},${building.lng});node["amenity"="pharmacy"](around:500,${building.lat},${building.lng}););out center tags;`;
  if (type === 'subway') return `[out:json][timeout:25];(node["railway"="station"]["station"="subway"](around:1609,${building.lat},${building.lng});node["railway"="station"]["subway"="yes"](around:1609,${building.lat},${building.lng});node["public_transport"="station"]["subway"="yes"](around:1609,${building.lat},${building.lng}););out center tags;`;
  return '';
}

async function fetchOverpass(type, building) {
  const res = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(overpassQueryFor(type, building)));
  if (!res.ok) throw new Error('Overpass failed');
  const data = await res.json();
  const seen = new Set();
  return (data.elements || []).map(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const tags = el.tags || {};
    const name = tags.name || tags.brand || tags.operator || (type === 'subway' ? 'Subway station' : type === 'store' ? 'Store' : 'Restaurant');
    const key = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { lat, lng, name, distance: haversineMeters(building.lat, building.lng, lat, lng), extra: tags.cuisine || tags.shop || tags.ref || '' };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
}

function setNearbyStatus(message, isLoading = false) {
  const existing = document.getElementById('nearbyStatus');
  if (existing) existing.innerHTML = `<div class="nearbyLoading ${isLoading ? 'spinning' : ''}">${message}</div>`;
}

function renderNearbyResults() {
  if (!state.nearbyItems.length) return '<div class="emptyNearby">No nearby results found.</div>';
  return `<ol class="nearbyList">${state.nearbyItems.slice(0, 12).map(i => `<li><strong>${escapeHtml(i.name)}</strong><span>${Math.round(i.distance)}m away${i.extra ? ` · ${escapeHtml(i.extra)}` : ''}</span></li>`).join('')}</ol>`;
}

function drawRadius(building, meters, color) {
  radiusLayer.clearLayers();
  L.circle([building.lat, building.lng], { radius: meters, color, weight: 2, fillColor: color, fillOpacity: 0.06, dashArray: '6 6' }).addTo(radiusLayer);
}

async function handleNearbyClick(type) {
  const building = selectedBuilding();
  if (type === 'clear') { clearNearby(true); return; }
  if (!building) return;
  const radius = type === 'restaurant' ? 200 : type === 'store' ? 500 : 1609;
  const color = type === 'restaurant' ? '#f97316' : type === 'store' ? '#2563eb' : '#111827';
  state.nearbyMode = type;
  nearbyLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  if (type === 'subway') subwayLineLayer.addTo(map);
  drawRadius(building, radius, color);
  setNearbyStatus('Loading nearby results...', true);
  try {
    const items = await fetchOverpass(type, building);
    state.nearbyItems = items;
    items.forEach(item => L.marker([item.lat, item.lng], { icon: poiIcon(type), zIndexOffset: 620 }).bindPopup(`<div class="popupTitle">${escapeHtml(item.name)}</div><div class="popupSub">${Math.round(item.distance)}m away</div>`).addTo(nearbyLayer));
    const group = L.featureGroup([...nearbyLayer.getLayers(), state.markers.get(building.id)].filter(Boolean));
    if (group.getLayers().length > 1) map.fitBounds(group.getBounds(), { padding: [80, 80], maxZoom: type === 'subway' ? 14 : 17 });
    const status = document.getElementById('nearbyStatus');
    if (status) status.innerHTML = renderNearbyResults();
  } catch (e) {
    const status = document.getElementById('nearbyStatus');
    if (status) status.innerHTML = '<div class="nearbyError">Could not load live nearby data. Try again later.</div>';
  }
}

function addLegendControl() {
  if (state.legendAdded) return;
  state.legendAdded = true;
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'mapLegend');
    div.innerHTML = `<div class="legendTitle">Map legend</div><div class="legendGrid">
      <div class="legendItem"><span class="legendSwatch buildingLegend">R</span><span>Building</span></div>
      <div class="legendItem"><span class="legendSwatch schoolLegend columbiaLegend">CU</span><span>Columbia</span></div>
      <div class="legendItem"><span class="legendSwatch schoolLegend nyuLegend">NYU</span><span>NYU</span></div>
      <div class="legendItem"><span class="legendSwatch foodLegend">🍽</span><span>Restaurant</span></div>
      <div class="legendItem"><span class="legendSwatch storeLegend">🛒</span><span>Chinese grocery</span></div>
      <div class="legendItem"><span class="legendSwatch chineseFoodLegend">🍜</span><span>Chinese food</span></div>
      <div class="legendItem"><span class="legendSwatch mallLegend">🛍</span><span>Mall</span></div>
      <div class="legendItem"><span class="legendSwatch subwayLegend">M</span><span>Subway</span></div>
    </div><div class="legendHint">Zoom out: Columbia / NYU + buildings stay prominent.</div>`;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  legend.addTo(map);
}

function openSharedRoute() {
  const params = new URLSearchParams(window.location.search);
  const buildingId = params.get('building');
  const unitId = params.get('unit');
  if (!buildingId) return false;
  const building = state.buildingMap.get(buildingId);
  if (!building) return false;
  state.selectedId = buildingId;
  state.selectedUnitId = unitId || null;
  state.detailView = unitId ? 'unit' : 'building';
  renderMarkers();
  renderDetail(building);
  showNearbyToolbar(building);
  const marker = state.markers.get(building.id);
  if (marker) marker.openPopup();
  setTimeout(() => map.flyTo([building.lat, building.lng], 15, { duration: 0.85 }), 150);
  return true;
}

function updateLoadedCount() {
  const brandText = document.querySelector('.brand p');
  if (brandText) {
    const visiblePoiCount = state.pois.filter(p => p.type !== 'subway').length;
    brandText.textContent = `${state.buildings.length} buildings · ${state.units.length} units · ${visiblePoiCount} lifestyle POIs loaded`;
  }
}

els.nearbyToolbar.querySelectorAll('[data-nearby-toolbar]').forEach(btn => btn.addEventListener('click', () => handleNearbyClick(btn.dataset.nearbyToolbar)));
els.closeDetail.addEventListener('click', clearDetail);
map.on('zoomend', updatePoiPriorityByZoom);

els.detailContent.addEventListener('click', event => {
  const unitBtn = event.target.closest('[data-unit-id]');
  if (unitBtn) {
    const building = selectedBuilding();
    if (!building) return;
    const unit = building.units.find(u => u.unit_id === unitBtn.dataset.unitId);
    if (!unit) return;
    state.selectedUnitId = unit.unit_id;
    state.detailView = 'unit';
    setShareRoute(building, unit);
    renderUnitDetail(building, unit);
    return;
  }
  const expandBtn = event.target.closest('[data-panel-expand]');
  if (expandBtn) { togglePanelExpanded(); renderDetail(selectedBuilding()); return; }
  const shareBtn = event.target.closest('[data-share-room]');
  if (shareBtn) { const b = selectedBuilding(); const u = findSelectedUnit(b); if (b && u) copyShareLink(shareBtn, b, u); return; }
  if (event.target.id === 'backToUnits') { const b = selectedBuilding(); if (b) { state.detailView = 'building'; state.selectedUnitId = null; setShareRoute(b, null); renderBuildingOverview(b); } return; }
  if (event.target.id === 'calcBtn') calculateRent();
});
els.detailContent.addEventListener('input', event => { if (event.target.closest('#rentCalculator')) calculateRent(); });
window.addEventListener('popstate', () => { if (!openSharedRoute()) clearDetail(); });

async function init() {
  const [buildingsRows, unitsRows, photosRows, poiRows] = await Promise.all([
    loadCSV('buildings.csv'),
    loadCSV('units.csv'),
    loadCSV('photos.csv'),
    loadCSV('community_pois.csv'),
  ]);
  buildData(buildingsRows, unitsRows, photosRows, poiRows);
  renderMarkers();
  renderCommunityLayer();
  addLegendControl();
  updatePoiPriorityByZoom();
  updateLoadedCount();
  console.log('NY Rental Map loaded:', state.buildings.length, 'buildings,', state.units.length, 'units,', state.pois.length, 'POIs');
  console.log('POI type counts:', state.pois.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {}));
  openSharedRoute();
}

init().catch(err => {
  console.error(err);
  const message = err && err.message ? err.message : String(err);
  alert(`Could not load CSV data. Exact error: ${message}

Make sure app.js, index.html, styles.css, buildings.csv, units.csv, photos.csv, and community_pois.csv are in the same folder, then run:
python -m http.server 5500`);
});

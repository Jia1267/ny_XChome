import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './styles.css';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  streets: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
};

const NYC_CENTER = [-73.97, 40.76];
const OVERVIEW_ZOOM = 9.6;
const BUILDING_ZOOM = 17.2;
const BUILDING_FOCUS_ZOOM = 18;
const MAX_BUILDING_HIGHLIGHT_DISTANCE_METERS = 65;
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCSVLine(lines.shift());
  return lines.filter(Boolean).map(line => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim(); });
    return row;
  });
}

function groupListings(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = String(r.building_id || r.address || r.building_name || Math.random());
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: r.building_name || 'Unnamed Building',
        address: r.address || '',
        area: r.city_area || 'Unknown',
        lat: Number(r.lat),
        lng: Number(r.lng),
        link: r.link || '',
        utilities: r.utilities || 'Ask leasing office',
        amenities: r.amenities || 'Ask leasing office',
        nearby: r.nearby || '',
        height: Number(r.height) || 110,
        highlight_lat: Number(r.highlight_lat),
        highlight_lng: Number(r.highlight_lng),
        units: []
      });
    }
    map.get(id).units.push({
      room: r.room_num || 'TBD',
      floorPlan: r.floor_plan || r['Floor Plan'] || 'None',
      price: r.price || 'None',
      leaseTerm: r.lease_term || 'None',
      available: r.available_date || 'None',
      concession: r.concession || 'None',
      status: r.status || 'available'
    });
  }
  return [...map.values()].filter(b => b.address || (Number.isFinite(b.lat) && Number.isFinite(b.lng)));
}

function minPriceText(units) {
  const nums = units.map(u => Number(String(u.price).replace(/[^0-9.]/g, ''))).filter(Boolean);
  if (!nums.length) return 'Price TBD';
  return `From $${Math.min(...nums).toLocaleString()}`;
}

function priceDisplay(price) {
  const num = Number(String(price).replace(/[^0-9.]/g, ''));
  return num ? `$${num.toLocaleString()}` : 'Price TBD';
}

function distanceMeters(a, b) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function geocodeAddress(address, token) {
  const cacheKey = `geocode:v2:${address}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { localStorage.removeItem(cacheKey); }
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set('country', 'us');
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const center = data.features?.[0]?.center;
  if (!center) return null;
  const result = { lng: center[0], lat: center[1] };
  localStorage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

async function geocodeBuildings(buildings, token) {
  const output = [];
  for (const b of buildings) {
    // Important: if the CSV already has lat/lng, trust the CSV.
    // This keeps the building marker from jumping to a Mapbox geocoded street point.
    if (Number.isFinite(b.lat) && Number.isFinite(b.lng)) {
      output.push(b);
      continue;
    }

    // Only geocode when lat/lng are missing. Result is cached in browser localStorage.
    if (b.address && token && !token.includes('your_mapbox')) {
      try {
        const geo = await geocodeAddress(b.address, token);
        if (geo) output.push({ ...b, lat: geo.lat, lng: geo.lng });
        else output.push(b);
      } catch (e) {
        console.warn('Geocode fallback for', b.address, e);
        output.push(b);
      }
    } else {
      output.push(b);
    }
  }
  return output.filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng));
}

function overpassElementToPlace(el, selected) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const tags = el.tags || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${el.type}-${el.id}`,
    name: tags.name || tags.operator || 'Unnamed place',
    address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    lat,
    lng,
    distance: distanceMeters({ lat: selected.lat, lng: selected.lng }, { lat, lng }),
    category: tags.amenity || tags.shop || tags.railway || tags.public_transport || ''
  };
}

async function fetchOverpassNearby(kind, selected) {
  const cfg = {
    restaurant: {
      radius: 200,
      title: 'Restaurants within 200m',
      query: `
        [out:json][timeout:25];
        (
          node["amenity"~"restaurant|cafe|fast_food|food_court"](around:200,${selected.lat},${selected.lng});
          way["amenity"~"restaurant|cafe|fast_food|food_court"](around:200,${selected.lat},${selected.lng});
          relation["amenity"~"restaurant|cafe|fast_food|food_court"](around:200,${selected.lat},${selected.lng});
        );
        out center tags 30;
      `
    },
    store: {
      radius: 500,
      title: 'Stores within 500m',
      query: `
        [out:json][timeout:25];
        (
          node["shop"](around:500,${selected.lat},${selected.lng});
          way["shop"](around:500,${selected.lat},${selected.lng});
          relation["shop"](around:500,${selected.lat},${selected.lng});
          node["amenity"~"pharmacy|marketplace"](around:500,${selected.lat},${selected.lng});
          way["amenity"~"pharmacy|marketplace"](around:500,${selected.lat},${selected.lng});
        );
        out center tags 50;
      `
    },
    subway: {
      radius: 1609,
      title: 'Subway stations within 1 mile',
      query: `
        [out:json][timeout:25];
        (
          node["railway"="station"]["station"="subway"](around:1609,${selected.lat},${selected.lng});
          node["railway"="station"]["subway"="yes"](around:1609,${selected.lat},${selected.lng});
          node["public_transport"="station"]["subway"="yes"](around:1609,${selected.lat},${selected.lng});
          node["railway"="subway_entrance"](around:1609,${selected.lat},${selected.lng});
        );
        out center tags 50;
      `
    }
  }[kind];

  const cacheKey = `overpass:v3:${kind}:${selected.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < 1000 * 60 * 60 * 24) return { ...cfg, items: parsed.items };
    } catch { localStorage.removeItem(cacheKey); }
  }

  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: cfg.query })
  });
  if (!res.ok) throw new Error(`Nearby search failed: ${res.status}`);
  const data = await res.json();
  const seen = new Set();
  const items = (data.elements || [])
    .map(el => overpassElementToPlace(el, selected))
    .filter(Boolean)
    .filter(p => {
      const key = `${p.name}-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return p.distance <= cfg.radius;
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 30);
  localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items }));
  return { ...cfg, items };
}

function App() {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const clusterPopupRef = useRef(null);
  const poiMarkersRef = useRef([]);
  const selectedRef = useRef(null);
  const buildingsRef = useRef([]);
  const selectedBuildingFeatureRef = useRef(null);

  const [buildings, setBuildings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mapStyle, setMapStyle] = useState('light');
  const [nearby, setNearby] = useState({ title: '', items: [], loading: false, error: '' });
  const [ready, setReady] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading listings...');

  const buildingById = useMemo(() => new Map(buildings.map(b => [String(b.id), b])), [buildings]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);

  useEffect(() => {
    if (!TOKEN || TOKEN.includes('your_mapbox')) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: MAP_STYLES[mapStyle],
      center: NYC_CENTER,
      zoom: OVERVIEW_ZOOM,
      pitch: 8,
      bearing: 0,
      antialias: true,
      cooperativeGestures: false,
      fadeDuration: 0
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-left');

    map.on('load', () => {
      setReady(true);
      map.resize();
      applyZillow3DLook(map);
      addMapbox3DBuildings(map);
    });

    map.on('style.load', () => {
      setReady(true);
      setTimeout(() => {
        map.resize();
        applyZillow3DLook(map);
        addMapbox3DBuildings(map);
        addOpenRailwayLayer(false);
      }, 80);
    });

    const onResize = () => map.resize();
    const onZoom = () => updateMarkerVisibilityByZoom();
    window.addEventListener('resize', onResize);
    map.on('zoom', onZoom);
    setTimeout(() => map.resize(), 250);
    return () => {
      window.removeEventListener('resize', onResize);
      map.off('zoom', onZoom);
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!TOKEN || TOKEN.includes('your_mapbox')) return;
    fetch('/listings.csv')
      .then(r => r.text())
      .then(async text => {
        const grouped = groupListings(parseCSV(text));
        setLoadingText('Checking building locations...');
        const geocoded = await geocodeBuildings(grouped, TOKEN);
        setBuildings(geocoded);
        setLoadingText('');
      })
      .catch(err => {
        console.error('Failed to load CSV:', err);
        setLoadingText('Could not load listings.csv');
      });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !buildings.length) return;
    clearBuildingMarkers();
    addBuildingMarkers(buildings);
    fitAllBuildings(map, buildings);
  }, [buildings, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(MAP_STYLES[mapStyle]);
    setTimeout(() => {
      clearBuildingMarkers();
      addBuildingMarkers(buildingsRef.current);
      if (selectedRef.current) flyToBuilding(selectedRef.current);
      else fitAllBuildings(map, buildingsRef.current, 0);
    }, 260);
  }, [mapStyle]);


  function applyZillow3DLook(map) {
    if (!map) return;
    try {
      map.setFog({
        color: 'rgb(244,247,252)',
        'high-color': 'rgb(225,235,250)',
        'horizon-blend': 0.06,
        'space-color': 'rgb(240,245,255)',
        'star-intensity': 0
      });
      map.setLight({
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.42,
        position: [1.2, 180, 28]
      });
    } catch (e) {
      console.warn('Could not set 3D atmosphere', e);
    }
  }

  function addMapbox3DBuildings(map) {
    if (!map || map.getLayer('mapbox-grey-3d-buildings')) return;
    const style = map.getStyle();
    const hasComposite = !!style.sources?.composite;
    if (!hasComposite) return;
    const labelLayerId = (style.layers || []).find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;
    map.addLayer({
      id: 'mapbox-grey-3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], 'true'],
      type: 'fill-extrusion',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#b8bcc4',
        'fill-extrusion-opacity': 0.06,
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          15, 0,
          17, ['*', 0.15, ['coalesce', ['get', 'height'], 18]],
          18.5, ['*', 0.25, ['coalesce', ['get', 'height'], 18]]
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          15, 0,
          17, ['*', 0.15, ['coalesce', ['get', 'min_height'], 0]],
          18.5, ['*', 0.25, ['coalesce', ['get', 'min_height'], 0]]
        ]
      }
    }, labelLayerId);
  }



  function clearSelectedBuildingHighlight() {
    const map = mapRef.current;
    selectedBuildingFeatureRef.current = null;
    if (!map) return;
    if (map.getLayer('selected-building-highlight')) map.removeLayer('selected-building-highlight');
    if (map.getSource('selected-building-source')) map.removeSource('selected-building-source');
  }

  function centroidOfGeometry(geometry) {
    if (!geometry) return null;
    const coords = [];
    const walk = (arr) => {
      if (!Array.isArray(arr)) return;
      if (typeof arr[0] === 'number' && typeof arr[1] === 'number') coords.push(arr);
      else arr.forEach(walk);
    };
    walk(geometry.coordinates);
    if (!coords.length) return null;
    const sum = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
    return [sum[0] / coords.length, sum[1] / coords.length];
  }

  function addSelectedBuildingHighlight(feature) {
    const map = mapRef.current;
    if (!map || !feature?.geometry) return;
    clearSelectedBuildingHighlight();
    const height = Number(feature.properties?.height) || Number(selectedRef.current?.height) || 90;
    const minHeight = Number(feature.properties?.min_height) || 0;
    const data = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: feature.geometry,
        properties: { height, min_height: minHeight }
      }]
    };
    map.addSource('selected-building-source', { type: 'geojson', data });
    map.addLayer({
      id: 'selected-building-highlight',
      type: 'fill-extrusion',
      source: 'selected-building-source',
      paint: {
        'fill-extrusion-color': '#f59e0b',
        'fill-extrusion-opacity': 0.88,
        'fill-extrusion-height': ['coalesce', ['get', 'height'], 90],
        'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0]
      }
    });
    selectedBuildingFeatureRef.current = feature;
  }

  function createFallbackTowerFeature(anchor, b) {
    const meters = 18;
    const dLat = meters / 111320;
    const dLng = meters / (111320 * Math.cos(anchor.lat * Math.PI / 180));
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [anchor.lng - dLng, anchor.lat - dLat],
          [anchor.lng + dLng, anchor.lat - dLat],
          [anchor.lng + dLng, anchor.lat + dLat],
          [anchor.lng - dLng, anchor.lat + dLat],
          [anchor.lng - dLng, anchor.lat - dLat]
        ]]
      },
      properties: { height: Number(b?.height) || 120, min_height: 0 }
    };
  }

  function getHighlightAnchor(b) {
    const hlLat = Number(b.highlight_lat);
    const hlLng = Number(b.highlight_lng);
    if (Number.isFinite(hlLat) && Number.isFinite(hlLng)) return { lat: hlLat, lng: hlLng };
    return { lat: b.lat, lng: b.lng };
  }

  function highlightNearestMapboxBuilding(b) {
    const map = mapRef.current;
    if (!map || !b || !map.getLayer('mapbox-grey-3d-buildings')) return;

    // Keep the marker at the exact CSV coordinate. Do NOT snap it to a random
    // Mapbox building center, because nearby buildings can be ambiguous and can
    // move NJ/LIC buildings to the wrong place.
    const anchor = getHighlightAnchor(b);
    const centerPoint = map.project([anchor.lng, anchor.lat]);
    const radii = [18, 30, 44, 58];
    let candidates = [];

    for (const r of radii) {
      candidates = map.queryRenderedFeatures([
        [centerPoint.x - r, centerPoint.y - r],
        [centerPoint.x + r, centerPoint.y + r]
      ], { layers: ['mapbox-grey-3d-buildings'] }) || [];
      if (candidates.length) break;
    }

    if (!candidates.length) {
      addSelectedBuildingHighlight(createFallbackTowerFeature(anchor, b));
      return;
    }

    let best = null;
    let bestMeters = Infinity;
    for (const f of candidates) {
      const c = centroidOfGeometry(f.geometry);
      if (!c) continue;
      const meters = distanceMeters(
        { lat: anchor.lat, lng: anchor.lng },
        { lat: c[1], lng: c[0] }
      );
      if (meters < bestMeters) {
        bestMeters = meters;
        best = f;
      }
    }

    // Safety guard: if the nearest building footprint is too far away, do not
    // highlight it. This prevents the selected NJ building from jumping/highlighting
    // a wrong building in Long Island or another area.
    if (!best || bestMeters > MAX_BUILDING_HIGHLIGHT_DISTANCE_METERS) {
      addSelectedBuildingHighlight(createFallbackTowerFeature(anchor, b));
      console.warn(`Fallback 3D tower for ${b.name}. Nearest base building was ${Math.round(bestMeters)}m away.`);
      return;
    }

    addSelectedBuildingHighlight(best);
  }

  function addBuildingMarkers(data) {
    const map = mapRef.current;
    if (!map) return;
    data.forEach(b => {
      const el = document.createElement('button');
      el.className = 'building-marker';
      el.title = b.name;
      el.setAttribute('data-price', minPriceText(b.units));
      el.innerHTML = `<span class="bldg-top"></span><span class="bldg-body"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="bldg-price">${minPriceText(b.units)}</span>`;
      el.addEventListener('mouseenter', () => el.classList.add('hover'));
      el.addEventListener('mouseleave', () => el.classList.remove('hover'));
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (selectedRef.current && String(selectedRef.current.id) === String(b.id)) {
          resetToOverview();
        } else {
          selectBuilding(b);
        }
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([b.lng, b.lat])
        .addTo(map);
      markersRef.current.push({ marker, el, building: b });
    });
    updateMarkerVisibilityByZoom();
  }

  function clearBuildingMarkers() {
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];
    const map = mapRef.current;
    if (!map) return;
    if (clusterPopupRef.current) {
      clusterPopupRef.current.remove();
      clusterPopupRef.current = null;
    }
  }

  function updateMarkerVisibilityByZoom() {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const showPrice = z >= 13;
    const clusterThreshold = 10.8;
    const miniMarkerThreshold = 13;

    if (clusterPopupRef.current) {
      clusterPopupRef.current.remove();
      clusterPopupRef.current = null;
    }

    if (z < clusterThreshold && markersRef.current.length) {
      let sumLng = 0;
      let sumLat = 0;
      markersRef.current.forEach(({ el, building }) => {
        el.style.display = 'none';
        sumLng += building.lng;
        sumLat += building.lat;
      });
      const center = [sumLng / markersRef.current.length, sumLat / markersRef.current.length];
      clusterPopupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
        className: 'cluster-popup'
      })
        .setLngLat(center)
        .setHTML(`<button class="cluster-chip" title="Zoom in to expand">${markersRef.current.length} buildings</button>`)
        .addTo(map);

      const node = clusterPopupRef.current.getElement()?.querySelector('.cluster-chip');
      if (node) node.addEventListener('click', () => map.easeTo({ zoom: 12.8, duration: 700 }));
      return;
    }

    markersRef.current.forEach(({ el }) => {
      el.style.display = '';
      el.classList.toggle('mini', z < miniMarkerThreshold);
      const price = el.querySelector('.bldg-price');
      if (price) price.style.display = showPrice ? '' : 'none';
    });
  }

  function clearPoiMarkers() {
    poiMarkersRef.current.forEach(m => m.remove());
    poiMarkersRef.current = [];
  }

  function addPoiMarkers(items, type) {
    clearPoiMarkers();
    const map = mapRef.current;
    if (!map) return;
    items.forEach(item => {
      const el = document.createElement('button');
      el.className = `poi-marker ${type}`;
      el.title = item.name;
      el.textContent = type === 'restaurant' ? 'R' : type === 'store' ? 'S' : 'T';
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([item.lng, item.lat])
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(`<strong>${item.name}</strong><br/>${Math.round(item.distance)} m away`))
        .addTo(map);
      poiMarkersRef.current.push(marker);
    });
  }

  function fitNearbyResults(selectedBuilding, items) {
    const map = mapRef.current;
    if (!map || !selectedBuilding) return;
    const bounds = new mapboxgl.LngLatBounds([selectedBuilding.lng, selectedBuilding.lat], [selectedBuilding.lng, selectedBuilding.lat]);
    items.forEach(item => bounds.extend([item.lng, item.lat]));
    map.fitBounds(bounds, {
      padding: { top: 110, bottom: 130, left: 90, right: selectedRef.current ? 500 : 90 },
      maxZoom: 16.2,
      pitch: 0,
      bearing: 0,
      duration: 700,
      essential: true
    });
  }

  function returnToSelectedBuilding() {
    clearPoiMarkers();
    addOpenRailwayLayer(false);
    setNearby({ title: '', items: [], loading: false, error: '' });
    if (selectedRef.current) flyToBuilding(selectedRef.current);
  }

  function fitAllBuildings(map, data, duration = 650) {
    if (!map || !data.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    data.forEach(b => bounds.extend([b.lng, b.lat]));
    map.fitBounds(bounds, {
      padding: { top: 110, bottom: 110, left: 110, right: 110 },
      maxZoom: 10.8,
      pitch: 8,
      bearing: 0,
      duration
    });
  }

  function flyToBuilding(b) {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [b.lng, b.lat],
      zoom: BUILDING_ZOOM,
      pitch: 52,
      bearing: -16,
      padding: { top: 80, bottom: 90, left: 70, right: 420 },
      duration: 900,
      easing: t => 1 - Math.pow(1 - t, 3),
      essential: true
    });

    setTimeout(() => {
      map.easeTo({
        center: [b.lng, b.lat],
        zoom: BUILDING_FOCUS_ZOOM,
        pitch: 60,
        bearing: -18,
        padding: { top: 80, bottom: 90, left: 70, right: 420 },
        duration: 760,
        easing: t => 1 - Math.pow(1 - t, 4),
        essential: true
      });
      highlightNearestMapboxBuilding(b);
    }, 520);
  }

  function selectBuilding(b) {
    clearSelectedBuildingHighlight();
    setSelected(b);
    selectedRef.current = b;
    setNearby({ title: '', items: [], loading: false, error: '' });
    clearPoiMarkers();
    markersRef.current.forEach(({ el, building }) => el.classList.toggle('active', String(building.id) === String(b.id)));
    flyToBuilding(b);
  }

  function resetToOverview() {
    clearSelectedBuildingHighlight();
    setSelected(null);
    selectedRef.current = null;
    setNearby({ title: '', items: [], loading: false, error: '' });
    clearPoiMarkers();
    addOpenRailwayLayer(false);
    markersRef.current.forEach(({ el }) => el.classList.remove('active'));
    fitAllBuildings(mapRef.current, buildingsRef.current);
  }

  function addOpenRailwayLayer(show) {
    const map = mapRef.current;
    if (!map) return;
    const layerId = 'openrailway-overlay';
    const sourceId = 'openrailway-source';
    if (!show) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }
    if (map.getLayer(layerId)) return;
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [
        'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
        'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
        'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: 'OpenRailwayMap'
    });
    map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': 0.75 } });
  }

  async function loadNearby(kind) {
    if (!selected) return;
    setNearby({ title: '', items: [], loading: true, error: '' });
    try {
      if (kind === 'subway') addOpenRailwayLayer(true);
      else addOpenRailwayLayer(false);
      const result = await fetchOverpassNearby(kind, selected);
      setNearby({
        title: result.title,
        items: result.items,
        loading: false,
        error: result.items.length ? '' : 'No nearby results found. Try another building or use a larger radius later.'
      });
      addPoiMarkers(result.items, kind === 'restaurant' ? 'restaurant' : kind === 'store' ? 'store' : 'subway');

      // Nearby tools are easier to read from a top-down map.
      // Clear/Back returns to the selected 3D building view.
      if (result.items.length) fitNearbyResults(selected, result.items);
      else {
        mapRef.current?.easeTo({ center: [selected.lng, selected.lat], zoom: 16, pitch: 0, bearing: 0, duration: 650 });
      }
    } catch (e) {
      setNearby({ title: '', items: [], loading: false, error: e.message || 'Nearby search failed.' });
    }
  }

  if (!TOKEN || TOKEN.includes('your_mapbox')) return <TokenScreen />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">NY</div>
          <div>
            <strong>NY Rental Map</strong>
            <span>3D building-first rental discovery</span>
          </div>
        </div>
        <div className="style-switcher">
          <button className={mapStyle === 'light' ? 'active' : ''} onClick={() => setMapStyle('light')}>Clean light</button>
          <button className={mapStyle === 'streets' ? 'active' : ''} onClick={() => setMapStyle('streets')}>Streets</button>
          <button className={mapStyle === 'satellite' ? 'active' : ''} onClick={() => setMapStyle('satellite')}>Satellite</button>
        </div>
      </header>

      <main className="map-wrap">
        <div ref={mapNode} className="map" />
        <div className="hint-card">
          <strong>{buildings.length}</strong> buildings loaded<br />
          {loadingText || (selected ? 'Click the same building again to return.' : 'Click a building to zoom in.')}
        </div>
        {selected && (
          <div className="nearby-toolbar">
            <span>{selected.name}</span>
            <button onClick={() => loadNearby('restaurant')}>Restaurants</button>
            <button onClick={() => loadNearby('store')}>Stores</button>
            <button onClick={() => loadNearby('subway')}>Subway</button>
            <button onClick={returnToSelectedBuilding}>Clear</button>
            <button className="return-btn" onClick={resetToOverview}>Back</button>
          </div>
        )}
      </main>

      {selected && (
        <aside className="details-panel">
          <button className="close-btn" onClick={resetToOverview}>×</button>
          <p className="eyebrow">{selected.area}</p>
          <h1>{selected.name}</h1>
          <p className="address">{selected.address}</p>
          <div className="price-card">
            <span>{minPriceText(selected.units)}</span>
            {selected.link && <a href={selected.link} target="_blank" rel="noreferrer">Official site</a>}
          </div>
          <section>
            <h2>Available units</h2>
            <div className="units-list">
              {selected.units.map((u, idx) => (
                <div className="unit-card" key={`${u.room}-${idx}`}>
                  <div>
                    <strong>{u.floorPlan}</strong>
                    <span>Unit {u.room}</span>
                  </div>
                  <div className="unit-price">{priceDisplay(u.price)}</div>
                  <small>{u.available} · {u.leaseTerm} · {u.concession}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="info-grid">
            <div><strong>Utilities</strong><p>{selected.utilities}</p></div>
            <div><strong>Amenities</strong><p>{selected.amenities}</p></div>
            <div><strong>Nearby</strong><p>{selected.nearby || 'Use the buttons below to search nearby places.'}</p></div>
          </section>
          {(nearby.title || nearby.loading || nearby.error) && (
            <section>
              <h2>{nearby.title || 'Nearby'}</h2>
              {nearby.loading && <p className="muted">Searching nearby places...</p>}
              {nearby.error && <p className="error-text">{nearby.error}</p>}
              <div className="nearby-list">
                {nearby.items.map(item => (
                  <div className="nearby-row" key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{Math.round(item.distance)} m</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function TokenScreen() {
  return (
    <div className="token-screen">
      <div className="token-card">
        <h1>Mapbox token required</h1>
        <p>Create a <code>.env</code> file in the project root and add your public token:</p>
        <pre>VITE_MAPBOX_TOKEN=pk.your_mapbox_public_token_here</pre>
        <p>Then restart the dev server with <code>npm run dev</code>.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

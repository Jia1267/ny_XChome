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
const BUILDING_ZOOM = 14.5;
const CLUSTER_ZOOM = 10.8;

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

function groupListings(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = r.building_id || r.address || r.building_name;
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
        height: Number(r.height) || 90,
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
  return [...map.values()].filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng));
}

function buildingPointGeoJSON(buildings) {
  return {
    type: 'FeatureCollection',
    features: buildings.map(b => ({
      type: 'Feature',
      id: b.id,
      properties: {
        id: b.id,
        name: b.name,
        area: b.area,
        minPrice: minPriceText(b.units),
        height: b.height
      },
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] }
    }))
  };
}

function buildingFootprintGeoJSON(buildings) {
  return {
    type: 'FeatureCollection',
    features: buildings.map(b => {
      const size = 0.00028;
      const ratio = Math.cos((b.lat * Math.PI) / 180);
      const dx = size / Math.max(ratio, 0.2);
      const dy = size;
      return {
        type: 'Feature',
        id: b.id,
        properties: {
          id: b.id,
          name: b.name,
          height: b.height
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [b.lng - dx, b.lat - dy],
            [b.lng + dx, b.lat - dy],
            [b.lng + dx, b.lat + dy],
            [b.lng - dx, b.lat + dy],
            [b.lng - dx, b.lat - dy]
          ]]
        }
      };
    })
  };
}

function minPriceText(units) {
  const nums = units.map(u => Number(String(u.price).replace(/[^0-9.]/g, ''))).filter(Boolean);
  if (!nums.length) return 'Price TBD';
  return `From $${Math.min(...nums).toLocaleString()}`;
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

async function mapboxPoiSearch(query, building, radiusMeters, token) {
  const cacheKey = `poi:${query}:${building.id}:${radiusMeters}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.ts < 1000 * 60 * 60 * 24 * 7) return parsed.data;
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set('proximity', `${building.lng},${building.lat}`);
  url.searchParams.set('types', 'poi');
  url.searchParams.set('limit', '10');
  url.searchParams.set('language', 'en');
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Mapbox POI search failed: ${res.status}`);
  const data = await res.json();
  const center = { lat: building.lat, lng: building.lng };
  const features = (data.features || []).map(f => ({
    id: f.id,
    name: f.text || f.place_name || 'Unnamed place',
    address: f.place_name || '',
    lng: f.center?.[0],
    lat: f.center?.[1],
    distance: distanceMeters(center, { lat: f.center?.[1], lng: f.center?.[0] }),
    category: f.properties?.category || ''
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);

  localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: features }));
  return features;
}

function App() {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const clusterMarkersRef = useRef([]);
  const poiMarkersRef = useRef([]);
  const selectedRef = useRef(null);

  const [buildings, setBuildings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mapStyle, setMapStyle] = useState('light');
  const [nearby, setNearby] = useState({ title: '', items: [], loading: false, error: '' });
  const [ready, setReady] = useState(false);

  const buildingById = useMemo(() => new Map(buildings.map(b => [String(b.id), b])), [buildings]);

  useEffect(() => {
    fetch('/listings.csv')
      .then(r => r.text())
      .then(text => setBuildings(groupListings(parseCSV(text))))
      .catch(err => console.error('Failed to load CSV:', err));
  }, []);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    if (!TOKEN || TOKEN.includes('your_mapbox')) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: mapNode.current,
      style: MAP_STYLES[mapStyle],
      center: NYC_CENTER,
      zoom: 9.6,
      pitch: 0,
      bearing: 0,
      antialias: true,
      cooperativeGestures: false
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    map.on('load', () => {
      setReady(true);
      map.resize();
      if (buildings.length) setupMapLayers(map, buildings);
    });

    map.on('style.load', () => {
      setReady(true);
      if (buildings.length) setupMapLayers(map, buildings);
    });

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[mapStyle]);
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !buildings.length) return;
    setupMapLayers(map, buildings);
    fitAllBuildings(map, buildings);
  }, [buildings, ready]);

  function setupMapLayers(map, data) {
    clearHtmlMarkers();
    clearClusterMarkers();
    addMapbox3DBuildings(map);

    if (map.getSource('rental-points')) {
      map.getSource('rental-points').setData(buildingPointGeoJSON(data));
    } else {
      map.addSource('rental-points', {
        type: 'geojson',
        data: buildingPointGeoJSON(data),
        cluster: true,
        clusterMaxZoom: 10.8,
        clusterRadius: 52
      });
      map.addLayer({
        id: 'rental-clusters',
        type: 'circle',
        source: 'rental-points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#ffffff',
          'circle-stroke-color': '#222222',
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 19, 10, 24, 30, 30]
        }
      });
      map.addLayer({
        id: 'rental-cluster-count',
        type: 'symbol',
        source: 'rental-points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['concat', ['to-string', ['get', 'point_count']], ' buildings'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: { 'text-color': '#111111' }
      });
      map.on('click', 'rental-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['rental-clusters'] });
        const clusterId = features[0].properties.cluster_id;
        map.getSource('rental-points').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom, duration: 500 });
        });
      });
    }

    if (map.getSource('rental-footprints')) {
      map.getSource('rental-footprints').setData(buildingFootprintGeoJSON(data));
    } else {
      map.addSource('rental-footprints', { type: 'geojson', data: buildingFootprintGeoJSON(data) });
      map.addLayer({
        id: 'rental-3d-buildings',
        type: 'fill-extrusion',
        source: 'rental-footprints',
        minzoom: 13.2,
        paint: {
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'id'], ['literal', selectedRef.current?.id || '']], '#2563eb',
            '#6b7280'
          ],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0
        }
      });

      map.on('mousemove', 'rental-3d-buildings', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'rental-3d-buildings', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'rental-3d-buildings', (e) => {
        const id = String(e.features?.[0]?.properties?.id || '');
        const b = buildingById.get(id) || data.find(x => String(x.id) === id);
        if (b) selectBuilding(b);
      });
    }

    addBuildingHtmlMarkers(data);
    map.off('zoomend', updateMarkerVisibility);
    map.on('zoomend', updateMarkerVisibility);
    updateMarkerVisibility();
  }

  function addMapbox3DBuildings(map) {
    if (map.getLayer('mapbox-grey-3d-buildings')) return;
    const layers = map.getStyle().layers || [];
    const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout && l.layout['text-field'])?.id;
    const hasComposite = map.getSource('composite');
    if (!hasComposite) return;
    map.addLayer({
      id: 'mapbox-grey-3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], 'true'],
      type: 'fill-extrusion',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#d1d5db',
        'fill-extrusion-opacity': 0.52,
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          15, 0,
          15.05, ['get', 'height']
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          15, 0,
          15.05, ['get', 'min_height']
        ]
      }
    }, labelLayerId);
  }

  function addBuildingHtmlMarkers(data) {
    data.forEach(b => {
      const el = document.createElement('button');
      el.className = 'building-marker';
      el.title = b.name;
      el.innerHTML = `<span class="bldg-top"></span><span class="bldg-body"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="bldg-price">${minPriceText(b.units)}</span>`;
      el.addEventListener('mouseenter', () => el.classList.add('hover'));
      el.addEventListener('mouseleave', () => el.classList.remove('hover'));
      el.addEventListener('click', (ev) => { ev.stopPropagation(); selectBuilding(b); });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([b.lng, b.lat])
        .addTo(mapRef.current);
      markersRef.current.push({ marker, el, building: b });
    });
  }

  function updateMarkerVisibility() {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    markersRef.current.forEach(({ el }) => {
      el.style.display = zoom < CLUSTER_ZOOM ? 'none' : 'block';
    });
    if (map.getLayer('rental-clusters')) {
      map.setLayoutProperty('rental-clusters', 'visibility', zoom < CLUSTER_ZOOM ? 'visible' : 'none');
      map.setLayoutProperty('rental-cluster-count', 'visibility', zoom < CLUSTER_ZOOM ? 'visible' : 'none');
    }
  }

  function clearHtmlMarkers() {
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];
  }

  function clearClusterMarkers() {
    clusterMarkersRef.current.forEach(m => m.remove());
    clusterMarkersRef.current = [];
  }

  function fitAllBuildings(map, data) {
    if (!data.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    data.forEach(b => bounds.extend([b.lng, b.lat]));
    map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 80, right: 420 }, maxZoom: 11.2, duration: 600 });
  }

  function selectBuilding(b) {
    setSelected(b);
    setNearby({ title: '', items: [], loading: false, error: '' });
    clearPoiMarkers();
    markersRef.current.forEach(({ el, building }) => el.classList.toggle('active', building.id === b.id));
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [b.lng, b.lat], zoom: 16.4, pitch: 57, bearing: -18, duration: 900, essential: true });
      setTimeout(() => updateRentalExtrusionColor(b.id), 50);
    }
  }

  function updateRentalExtrusionColor(selectedId) {
    const map = mapRef.current;
    if (!map || !map.getLayer('rental-3d-buildings')) return;
    map.setPaintProperty('rental-3d-buildings', 'fill-extrusion-color', [
      'case', ['==', ['get', 'id'], String(selectedId)], '#2563eb', '#6b7280'
    ]);
  }

  function closePanel() {
    setSelected(null);
    selectedRef.current = null;
    setNearby({ title: '', items: [], loading: false, error: '' });
    clearPoiMarkers();
    markersRef.current.forEach(({ el }) => el.classList.remove('active'));
    updateRentalExtrusionColor('');
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
      const el = document.createElement('div');
      el.className = `poi-marker ${type}`;
      el.textContent = type === 'restaurant' ? 'R' : type === 'store' ? 'S' : 'T';
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([item.lng, item.lat])
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(`<strong>${item.name}</strong><br/>${Math.round(item.distance)} m away`))
        .addTo(map);
      poiMarkersRef.current.push(marker);
    });
  }

  async function loadNearby(kind) {
    if (!selected) return;
    if (!TOKEN || TOKEN.includes('your_mapbox')) return;
    const config = {
      restaurant: { query: 'restaurant cafe food', radius: 200, label: 'Restaurants within 200m', marker: 'restaurant' },
      store: { query: 'grocery supermarket pharmacy store', radius: 500, label: 'Stores within 500m', marker: 'store' },
      subway: { query: 'subway station transit station', radius: 1609, label: 'Subway stations within 1 mile', marker: 'subway' }
    }[kind];
    setNearby({ title: config.label, items: [], loading: true, error: '' });
    try {
      const items = await mapboxPoiSearch(config.query, selected, config.radius, TOKEN);
      setNearby({ title: config.label, items, loading: false, error: items.length ? '' : 'No nearby results found.' });
      addPoiMarkers(items, config.marker);
    } catch (e) {
      setNearby({ title: config.label, items: [], loading: false, error: e.message || 'Nearby search failed.' });
    }
  }

  if (!TOKEN || TOKEN.includes('your_mapbox')) {
    return <TokenScreen />;
  }

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
          Zoom in to see grey 3D buildings.
        </div>
        {selected && (
          <div className="nearby-toolbar">
            <span>{selected.name}</span>
            <button onClick={() => loadNearby('restaurant')}>Restaurants</button>
            <button onClick={() => loadNearby('store')}>Stores</button>
            <button onClick={() => loadNearby('subway')}>Subway</button>
            <button onClick={() => { clearPoiMarkers(); setNearby({ title: '', items: [], loading: false, error: '' }); }}>Clear</button>
          </div>
        )}
      </main>

      {selected && (
        <aside className="details-panel">
          <button className="close-btn" onClick={closePanel}>×</button>
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
                  <div className="unit-price">{u.price === 'None' ? 'Price TBD' : `$${Number(String(u.price).replace(/[^0-9.]/g, '')).toLocaleString()}`}</div>
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
              {nearby.loading && <p className="muted">Searching Mapbox nearby places...</p>}
              {nearby.error && <p className="error-text">{nearby.error}</p>}
              <div className="nearby-list">
                {nearby.items.map(item => (
                  <div className="nearby-row" key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{Math.round(item.distance)} m away</span>
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

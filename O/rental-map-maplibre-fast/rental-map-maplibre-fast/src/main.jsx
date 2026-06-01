import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import Papa from 'papaparse';
import { Building2, Coffee, Store, TrainFront, X, Layers, Search, MapPin } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const NYC_CENTER = [-73.9654, 40.7589];
const FAST_MODE = true;
const MILE_IN_METERS = 1609;

const baseStyles = {
  clean: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }]
  },
  osm: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  },
  satellite: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      esri: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri'
      }
    },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }]
  }
};

function parseNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function groupListings(rows) {
  const map = new Map();
  rows.forEach((row, idx) => {
    const id = String(row.building_id || row.building_name || idx).trim();
    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (!map.has(id)) {
      const price = parseNumber(row.price, 0);
      map.set(id, {
        id,
        name: row.building_name || 'Unnamed Building',
        address: row.address || '',
        area: row.city_area || '',
        lat,
        lng,
        minPrice: price || null,
        height: 60 + (price ? Math.min(160, price / 45) : 90),
        link: row.link || '',
        utilities: row.utilities || 'None',
        amenities: row.amenities || 'None',
        nearby: row.nearby || 'None',
        units: []
      });
    }
    const b = map.get(id);
    const p = parseNumber(row.price, null);
    if (p && (!b.minPrice || p < b.minPrice)) b.minPrice = p;
    b.units.push({
      room: row.room_num || 'None',
      floorPlan: row['Floor Plan'] || row.floor_plan || 'None',
      price: row.price || 'None',
      leaseTerm: row.lease_term || 'None',
      available: row.available_date || 'None',
      concession: row.concession || 'None',
      link: row.link || ''
    });
  });
  return Array.from(map.values());
}

function squarePolygon(lng, lat, sizeMeters = 55) {
  const latOffset = sizeMeters / 111320;
  const lngOffset = sizeMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[
    [lng - lngOffset, lat - latOffset],
    [lng + lngOffset, lat - latOffset],
    [lng + lngOffset, lat + latOffset],
    [lng - lngOffset, lat + latOffset],
    [lng - lngOffset, lat - latOffset]
  ]];
}

function makePointFeatures(buildings) {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      id: b.id,
      properties: {
        id: b.id,
        name: b.name,
        price: b.minPrice || 0,
        area: b.area
      },
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] }
    }))
  };
}

function makeBuildingPolygons(buildings, selectedId, hoveredId) {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      id: b.id,
      properties: {
        id: b.id,
        name: b.name,
        height: b.height,
        price: b.minPrice || 0,
        active: b.id === selectedId ? 1 : 0,
        hovered: b.id === hoveredId ? 1 : 0
      },
      geometry: { type: 'Polygon', coordinates: squarePolygon(b.lng, b.lat, 55) }
    }))
  };
}

function buildOverpassQuery(type, lat, lng) {
  if (type === 'restaurants') {
    return `[out:json][timeout:25];(
      node["amenity"~"restaurant|cafe|fast_food|bar"](around:200,${lat},${lng});
      way["amenity"~"restaurant|cafe|fast_food|bar"](around:200,${lat},${lng});
    );out center 25;`;
  }
  if (type === 'stores') {
    return `[out:json][timeout:25];(
      node["shop"](around:500,${lat},${lng});
      way["shop"](around:500,${lat},${lng});
      node["amenity"="pharmacy"](around:500,${lat},${lng});
      way["amenity"="pharmacy"](around:500,${lat},${lng});
    );out center 40;`;
  }
  return `[out:json][timeout:25];(
    node["railway"="station"]["station"="subway"](around:${MILE_IN_METERS},${lat},${lng});
    node["public_transport"="station"]["subway"="yes"](around:${MILE_IN_METERS},${lat},${lng});
    node["railway"="subway_entrance"](around:${MILE_IN_METERS},${lat},${lng});
  );out center 40;`;
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function poiGeoJSON(items, type) {
  return {
    type: 'FeatureCollection',
    features: items.map((p, index) => ({
      type: 'Feature',
      id: `${type}-${index}`,
      properties: {
        name: p.name,
        type,
        distance: p.distance,
        detail: p.detail || ''
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
    }))
  };
}

function DetailPanel({ building, nearby, nearbyType, nearbyLoading, onClose }) {
  if (!building) return null;
  return (
    <aside className="detail-panel">
      <button className="close-btn" onClick={onClose} aria-label="Close detail panel"><X size={18} /></button>
      <div className="panel-header">
        <div className="building-icon"><Building2 size={26} /></div>
        <div>
          <h2>{building.name}</h2>
          <p>{building.address}</p>
        </div>
      </div>
      <div className="summary-grid">
        <div><span>From</span><b>{building.minPrice ? `$${building.minPrice.toLocaleString()}` : 'None'}</b></div>
        <div><span>Area</span><b>{building.area || 'None'}</b></div>
        <div><span>Units</span><b>{building.units.length}</b></div>
      </div>
      <section>
        <h3>Available Units</h3>
        <div className="unit-list">
          {building.units.map((u, i) => (
            <div className="unit-card" key={`${building.id}-${i}`}>
              <div><b>{u.floorPlan}</b><span>Unit {u.room}</span></div>
              <div className="unit-price">{u.price && u.price !== 'None' ? `$${u.price}` : 'None'}</div>
              <small>Lease: {u.leaseTerm} · {u.available}</small>
              <small>Special: {u.concession}</small>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Building Details</h3>
        <p><b>Utilities:</b> {building.utilities}</p>
        <p><b>Amenities:</b> {building.amenities}</p>
        <p><b>Nearby:</b> {building.nearby}</p>
        {building.link && <a className="visit-link" href={building.link} target="_blank" rel="noreferrer">Open official website</a>}
      </section>
      <section>
        <h3>Nearby Results</h3>
        {!nearbyType && <p className="muted">Choose Restaurants, Stores, or Subway from the bottom toolbar.</p>}
        {nearbyLoading && <p className="muted">Loading nearby places...</p>}
        {!nearbyLoading && nearbyType && nearby.length === 0 && <p className="muted">No nearby results found from OpenStreetMap.</p>}
        {!nearbyLoading && nearby.length > 0 && (
          <div className="nearby-list">
            {nearby.slice(0, 12).map((p, i) => (
              <div className="nearby-row" key={`${p.name}-${i}`}>
                <span>{i + 1}. {p.name}</span>
                <b>{Math.round(p.distance)}m</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function App() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const [buildings, setBuildings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [mapStyle, setMapStyle] = useState('clean');
  const [nearby, setNearby] = useState([]);
  const [nearbyType, setNearbyType] = useState('');
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [error, setError] = useState('');
  const [railLayerOn, setRailLayerOn] = useState(false);

  const selectedBuilding = useMemo(() => buildings.find((b) => b.id === selectedId), [buildings, selectedId]);

  useEffect(() => {
    Papa.parse('/listings.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const grouped = groupListings(data);
        setBuildings(grouped);
      },
      error: () => setError('Could not load listings.csv')
    });
  }, []);

  useEffect(() => {
    // Wait until listings.csv is loaded before creating the map.
    // This avoids a common React closure issue where the map loads with 0 buildings.
    if (mapRef.current || !containerRef.current || buildings.length === 0) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyles.clean,
      center: NYC_CENTER,
      zoom: 10.2,
      pitch: 0,
      bearing: 0,
      attributionControl: true,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      maxTileCacheSize: 96
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => {
      addDataLayers(map, buildings, selectedId, hoveredId);
      fitToBuildings(map, buildings, false);
    });

    return () => map.remove();
  }, [buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || buildings.length === 0) return;
    addDataLayers(map, buildings, selectedId, hoveredId);
    if (!selectedId) fitToBuildings(map, buildings, false);
  }, [buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(baseStyles[mapStyle]);
    map.once('styledata', () => {
      addDataLayers(map, buildings, selectedId, hoveredId);
      if (nearby.length) setPoiLayer(map, nearby, nearbyType);
      if (railLayerOn) addRailwayLayer(map);
    });
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('building-extrusions')) return;
    map.getSource('building-extrusions').setData(makeBuildingPolygons(buildings, selectedId, hoveredId));
  }, [selectedId, hoveredId, buildings]);

  function fitToBuildings(map, list, animate = true) {
    if (!list.length) return;
    const bounds = new maplibregl.LngLatBounds();
    list.forEach((b) => bounds.extend([b.lng, b.lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 11.2, duration: animate ? 350 : 0 });
  }

  function addDataLayers(map, currentBuildings, currentSelectedId, currentHoveredId) {
    if (!map.isStyleLoaded()) return;

    const pointData = makePointFeatures(currentBuildings);
    const polygonData = makeBuildingPolygons(currentBuildings, currentSelectedId, currentHoveredId);

    if (!map.getSource('rental-points')) {
      map.addSource('rental-points', {
        type: 'geojson',
        data: pointData,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 46
      });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'rental-points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#7c3aed',
          'circle-radius': ['step', ['get', 'point_count'], 20, 8, 26, 16, 32],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff'
        }
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'rental-points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 13,
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#ffffff' }
      });
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'rental-points',
        filter: ['!', ['has', 'point_count']],
        minzoom: 0,
        maxzoom: 14.2,
        paint: {
          'circle-color': '#ef4444',
          'circle-radius': 8,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff'
        }
      });
    } else {
      map.getSource('rental-points').setData(pointData);
    }

    if (!map.getSource('building-extrusions')) {
      map.addSource('building-extrusions', { type: 'geojson', data: polygonData });
      map.addLayer({
        id: 'building-extrusions-layer',
        type: 'fill-extrusion',
        source: 'building-extrusions',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'active'], 1], '#7c3aed',
            ['==', ['get', 'hovered'], 1], '#fb7185',
            '#ef4444'
          ],
          'fill-extrusion-height': ['case', ['==', ['get', 'active'], 1], ['+', ['get', 'height'], 45], ['get', 'height']],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.86
        }
      });
      map.addLayer({
        id: 'building-labels',
        type: 'symbol',
        source: 'building-extrusions',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2
        }
      });
    } else {
      map.getSource('building-extrusions').setData(polygonData);
    }

    bindMapEvents(map);
  }

  function bindMapEvents(map) {
    if (map.__rentalBound) return;
    map.__rentalBound = true;

    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      map.getSource('rental-points').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({ center: features[0].geometry.coordinates, zoom, duration: 350 });
      });
    });

    map.on('click', 'unclustered-point', (e) => chooseBuilding(e.features[0].properties.id));
    map.on('click', 'building-extrusions-layer', (e) => chooseBuilding(e.features[0].properties.id));

    map.on('mouseenter', 'building-extrusions-layer', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f) return;
      setHoveredId(f.properties.id);
      showHoverPopup(f, e.lngLat);
    });
    map.on('mouseleave', 'building-extrusions-layer', () => {
      map.getCanvas().style.cursor = '';
      setHoveredId(null);
      popupRef.current?.remove();
    });
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
  }

  function showHoverPopup(feature, lngLat) {
    popupRef.current?.remove();
    const price = Number(feature.properties.price || 0);
    const html = `<div class="hover-card"><b>${feature.properties.name}</b><span>${price ? 'From $' + price.toLocaleString() : 'Click for details'}</span></div>`;
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 18 }).setLngLat(lngLat).setHTML(html).addTo(mapRef.current);
  }

  function chooseBuilding(id) {
    const b = buildings.find((x) => x.id === String(id));
    if (!b) return;
    setSelectedId(b.id);
    setNearby([]);
    setNearbyType('');
    setRailLayerOn(false);
    const map = mapRef.current;
    map?.easeTo({ center: [b.lng, b.lat], zoom: 15.1, pitch: 45, bearing: -12, duration: 450 });
  }

  function clearSelection() {
    setSelectedId(null);
    setNearby([]);
    setNearbyType('');
    setRailLayerOn(false);
    const map = mapRef.current;
    if (map) {
      removePoiLayer(map);
      removeRailwayLayer(map);
      fitToBuildings(map, buildings, true);
      map.easeTo({ pitch: 0, bearing: 0, duration: 350 });
    }
  }

  async function loadNearby(type) {
    if (!selectedBuilding) return;
    setNearbyLoading(true);
    setNearbyType(type);
    setError('');
    const map = mapRef.current;
    if (type !== 'subway') {
      setRailLayerOn(false);
      removeRailwayLayer(map);
    }
    try {
      const q = buildOverpassQuery(type, selectedBuilding.lat, selectedBuilding.lng);
      const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Overpass request failed');
      const json = await res.json();
      const items = (json.elements || [])
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const tags = el.tags || {};
          const name = tags.name || tags.brand || (type === 'subway' ? 'Subway station' : 'Unnamed place');
          return {
            name,
            lat,
            lng,
            detail: tags.cuisine || tags.shop || tags.railway || tags.public_transport || '',
            distance: haversineMeters(selectedBuilding.lat, selectedBuilding.lng, lat, lng)
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);
      setNearby(items);
      setPoiLayer(map, items, type);
      if (type === 'subway') {
        addRailwayLayer(map);
        setRailLayerOn(true);
      }
    } catch (e) {
      setError('Nearby data failed to load. Overpass may be busy. Try again later.');
      setNearby([]);
      removePoiLayer(mapRef.current);
    } finally {
      setNearbyLoading(false);
    }
  }

  function clearNearby() {
    setNearby([]);
    setNearbyType('');
    setRailLayerOn(false);
    removePoiLayer(mapRef.current);
    removeRailwayLayer(mapRef.current);
  }

  function setPoiLayer(map, items, type) {
    if (!map || !map.isStyleLoaded()) return;
    removePoiLayer(map);
    map.addSource('nearby-poi', { type: 'geojson', data: poiGeoJSON(items, type) });
    map.addLayer({
      id: 'nearby-poi-layer',
      type: 'circle',
      source: 'nearby-poi',
      paint: {
        'circle-color': type === 'restaurants' ? '#f97316' : type === 'stores' ? '#2563eb' : '#111827',
        'circle-radius': type === 'subway' ? 7 : 6,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });
    map.addLayer({
      id: 'nearby-poi-labels',
      type: 'symbol',
      source: 'nearby-poi',
      minzoom: 14,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top'
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2
      }
    });
  }

  function removePoiLayer(map) {
    if (!map) return;
    ['nearby-poi-labels', 'nearby-poi-layer'].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource('nearby-poi')) map.removeSource('nearby-poi');
  }

  function addRailwayLayer(map) {
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource('openrailway')) {
      map.addSource('openrailway', {
        type: 'raster',
        tiles: ['https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenRailwayMap contributors'
      });
    }
    if (!map.getLayer('openrailway-layer')) {
      map.addLayer({ id: 'openrailway-layer', type: 'raster', source: 'openrailway', paint: { 'raster-opacity': 0.75 } });
    }
  }

  function removeRailwayLayer(map) {
    if (!map) return;
    if (map.getLayer('openrailway-layer')) map.removeLayer('openrailway-layer');
    if (map.getSource('openrailway')) map.removeSource('openrailway');
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="brand"><Building2 size={24} /><span>NY Rental Map</span></div>
        <div className="top-actions">
          <div className="hint"><Search size={15} /> Click a 3D building for details</div>
          <label className="style-picker"><Layers size={15} />
            <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value)}>
              <option value="clean">Clean light</option>
              <option value="osm">OpenStreetMap</option>
              <option value="satellite">Satellite</option>
            </select>
          </label>
        </div>
      </div>

      <main className="map-layout">
        <div ref={containerRef} className="map-container" />
        <div className="legend-card">
          <div><span className="dot red" /> Rental building</div>
          <div><span className="dot purple" /> Selected</div>
          <div><span className="dot orange" /> Restaurants</div>
          <div><span className="dot blue" /> Stores</div>
          <div><span className="dot black" /> Subway</div>
        </div>
        {selectedBuilding && (
          <div className="nearby-toolbar">
            <div className="toolbar-title"><MapPin size={16} /> {selectedBuilding.name}</div>
            <button onClick={() => loadNearby('restaurants')}><Coffee size={16} /> Restaurants</button>
            <button onClick={() => loadNearby('stores')}><Store size={16} /> Stores</button>
            <button onClick={() => loadNearby('subway')}><TrainFront size={16} /> Subway</button>
            <button onClick={clearNearby}>Clear</button>
          </div>
        )}
        {error && <div className="error-toast">{error}</div>}
        <DetailPanel
          building={selectedBuilding}
          nearby={nearby}
          nearbyType={nearbyType}
          nearbyLoading={nearbyLoading}
          onClose={clearSelection}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

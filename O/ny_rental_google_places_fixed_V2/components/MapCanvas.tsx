'use client';

import { useEffect, useRef, useState } from 'react';
import type { Circle, Layer, Map as LeafletMap, TileLayer } from 'leaflet';
import type { Building, CommuteMode, NearbyPoi, School, SchoolId } from '@/lib/types';
import { compactMoney } from '@/lib/format';

type MapCanvasProps = {
  buildings: Building[];
  selectedBuildingId: string;
  selectedSchoolId: SchoolId;
  commuteMode: CommuteMode;
  schools: School[];
  pois: NearbyPoi[];
  showSchoolMarkers: boolean;
  showNearbyRadius: boolean;
  showRailLayer: boolean;
  onSelectBuilding: (buildingId: string) => void;
};

const commuteRadiusMeters: Record<CommuteMode, number> = {
  none: 0,
  walk5: 400,
  walk15: 1200,
  subway20: 6000,
  subway40: 13000,
  subway60: 20000
};

function schoolColor(id: string) {
  if (id === 'columbia') return '#4169e1';
  if (id === 'nyu') return '#7c3aed';
  if (id === 'baruch') return '#0f8b8d';
  if (id === 'pratt') return '#d97706';
  return '#2563eb';
}

function poiIcon(type: NearbyPoi['type']) {
  if (type === 'restaurant') return 'R';
  if (type === 'grocery') return 'G';
  if (type === 'coffee') return 'C';
  return 'M';
}

function schoolInitials(id: string) {
  if (id === 'columbia') return 'CU';
  if (id === 'baruch') return 'BC';
  if (id === 'pratt') return 'PR';
  return 'NYU';
}

export function MapCanvas({
  buildings,
  selectedBuildingId,
  selectedSchoolId,
  commuteMode,
  schools,
  pois,
  showSchoolMarkers,
  showNearbyRadius,
  showRailLayer,
  onSelectBuilding
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayersRef = useRef<Layer[]>([]);
  const ringLayersRef = useRef<Circle[]>([]);
  const railLayerRef = useRef<TileLayer | null>(null);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);

  useEffect(() => {
    let mounted = true;
    import('leaflet').then(L => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [40.7484, -73.9857],
        zoom: 12,
        zoomControl: true,
        attributionControl: true
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }).addTo(map);
      mapRef.current = map;
      setLeaflet(L);
    });

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!leaflet || !mapRef.current) return;
    const map = mapRef.current;

    markerLayersRef.current.forEach(layer => map.removeLayer(layer));
    markerLayersRef.current = [];

    const rendered = buildings.slice(0, 500);
    const selected = buildings.find(building => building.id === selectedBuildingId);

    if (selected && showNearbyRadius) {
      const radius = leaflet.circle([selected.lat, selected.lng], {
        radius: 500,
        color: '#2563eb',
        weight: 2,
        opacity: 0.85,
        fillColor: '#2563eb',
        fillOpacity: 0.06,
        dashArray: '8 7'
      }).addTo(map);
      markerLayersRef.current.push(radius);
    }

    if (showSchoolMarkers) {
      const schoolsToShow = selectedSchoolId === 'all' ? schools : schools.filter(school => school.id === selectedSchoolId);
      schoolsToShow.forEach(school => {
        const marker = leaflet.marker([school.lat, school.lng], {
          icon: leaflet.divIcon({
            className: `schoolMarker ${school.id}`,
            html: `<span>${schoolInitials(school.id)}</span><strong>${school.shortName}</strong>`,
            iconSize: [62, 56],
            iconAnchor: [31, 50]
          }),
          zIndexOffset: 1600
        });
        marker.bindPopup(`<strong>${school.name}</strong>`);
        marker.addTo(map);
        markerLayersRef.current.push(marker);
      });
    }

    rendered.forEach(building => {
      const active = building.id === selectedBuildingId;
      const marker = leaflet.marker([building.lat, building.lng], {
        icon: leaflet.divIcon({
          className: `priceMarker ${active ? 'active' : ''}`,
          html: `<span>${compactMoney(building.startingRent)}</span>`,
          iconSize: [72, 34],
          iconAnchor: [36, 17]
        })
      });
      marker.on('click', () => onSelectBuilding(active ? '' : building.id));
      marker.addTo(map);
      markerLayersRef.current.push(marker);
    });

    pois.slice(0, 80).forEach(poi => {
      const marker = leaflet.marker([poi.lat, poi.lng], {
        icon: leaflet.divIcon({
          className: `poiMarker ${poi.type}`,
          html: `<span>${poiIcon(poi.type)}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      });
      marker.bindPopup(`<strong>${poi.name}</strong><br>${Math.round(poi.distanceMeters)}m`);
      marker.addTo(map);
      markerLayersRef.current.push(marker);
    });

    if (selected) map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 14), { animate: true });
  }, [leaflet, buildings, selectedBuildingId, selectedSchoolId, schools, pois, showSchoolMarkers, showNearbyRadius, onSelectBuilding]);

  useEffect(() => {
    if (!leaflet || !mapRef.current) return;
    const map = mapRef.current;

    if (showRailLayer && !railLayerRef.current) {
      railLayerRef.current = leaflet.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenRailwayMap contributors',
        opacity: 0.58,
        zIndex: 650
      }).addTo(map);
    }

    if (!showRailLayer && railLayerRef.current) {
      map.removeLayer(railLayerRef.current);
      railLayerRef.current = null;
    }
  }, [leaflet, showRailLayer]);

  useEffect(() => {
    if (!leaflet || !mapRef.current) return;
    const map = mapRef.current;
    ringLayersRef.current.forEach(layer => map.removeLayer(layer));
    ringLayersRef.current = [];

    if (commuteMode === 'none') return;
    const radius = commuteRadiusMeters[commuteMode];
    const activeSchools = selectedSchoolId === 'all' ? schools : schools.filter(school => school.id === selectedSchoolId);

    activeSchools.forEach(school => {
      const color = schoolColor(school.id);
      const circle = leaflet.circle([school.lat, school.lng], {
        radius,
        color,
        weight: 2,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.07,
        dashArray: commuteMode.startsWith('subway') ? '8 8' : undefined
      });
      circle.addTo(map);
      circle.bindTooltip(`${school.shortName} ${commuteMode.replace('walk', 'walk ').replace('subway', 'subway ')}`, {
        permanent: true,
        direction: 'center',
        className: 'ringLabel'
      });
      ringLayersRef.current.push(circle);
    });

    if (activeSchools.length) {
      const bounds = leaflet.latLngBounds(activeSchools.map(school => [school.lat, school.lng]));
      ringLayersRef.current.forEach(circle => bounds.extend(circle.getBounds()));
      map.fitBounds(bounds, { padding: [60, 60], animate: true });
    }
  }, [leaflet, schools, selectedSchoolId, commuteMode]);

  return <div ref={containerRef} className="mapCanvas" aria-label="NY rental map" />;
}

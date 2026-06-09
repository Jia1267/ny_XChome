import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getRentalDataset } from '@/lib/data';
import { distanceMeters } from '@/lib/format';
import { localFileStoreAllowed } from '@/lib/server-store';
import type { NearbyPoi, PoiType } from '@/lib/types';

const allowedTypes = new Set<PoiType>(['restaurant', 'grocery', 'coffee', 'subway']);
const googleTypes: Record<PoiType, string[]> = {
  restaurant: ['restaurant'],
  grocery: ['supermarket', 'grocery_store'],
  coffee: ['cafe', 'coffee_shop'],
  subway: ['subway_station']
};

// Per-instance cache so production (where local file writes are disabled) still
// benefits from a Places refresh. Best-effort on serverless; upgrade to Vercel KV
// for a shared, durable cache (see DEVELOPMENT_ROADMAP.md Phase 4.1).
type MemoryCacheEntry = { at: number; rows: NearbyPoi[] };
const memoryCache = new Map<string, MemoryCacheEntry>();
const MEMORY_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
};

async function readCachedJson(buildingId: string, type: PoiType): Promise<NearbyPoi[] | null> {
  if (!localFileStoreAllowed()) return null;
  const filePath = path.join(process.cwd(), '.places-cache', `${buildingId}_${type}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as NearbyPoi[] : null;
  } catch {
    return null;
  }
}

async function writeCachedJson(buildingId: string, type: PoiType, rows: NearbyPoi[]) {
  if (!localFileStoreAllowed()) return;
  const dir = path.join(process.cwd(), '.places-cache');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${buildingId}_${type}.json`), JSON.stringify(rows, null, 2), 'utf8');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('buildingId') || '';
  const type = (url.searchParams.get('type') || 'restaurant') as PoiType;
  const refresh = url.searchParams.get('refresh') === '1';
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!buildingId || !allowedTypes.has(type)) {
    return NextResponse.json({ error: 'Invalid buildingId or type' }, { status: 400 });
  }

  const dataset = await getRentalDataset();
  const building = dataset.buildings.find(item => item.id === buildingId);
  if (!building) return NextResponse.json({ error: 'Building not found' }, { status: 404 });

  const fileCached = building.pois.filter(poi => poi.type === type).slice(0, 12);
  const memKey = `${buildingId}_${type}`;
  const memHit = memoryCache.get(memKey);
  const memValid = memHit && (Date.now() - memHit.at) < MEMORY_TTL_MS;
  if (!refresh || !apiKey) {
    if (memValid && memHit) {
      return NextResponse.json({ source: 'memory_cache', apiKeyExposed: false, results: memHit.rows });
    }
    const jsonCached = await readCachedJson(buildingId, type);
    return NextResponse.json({
      source: jsonCached ? 'server_json_cache' : 'csv_cache',
      apiKeyExposed: false,
      results: jsonCached || fileCached
    });
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType'
    },
    body: JSON.stringify({
      includedTypes: googleTypes[type],
      maxResultCount: 12,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: building.lat, longitude: building.lng },
          radius: 500
        }
      }
    })
  });

  if (!response.ok) {
    return NextResponse.json({ source: 'csv_cache_after_google_error', results: fileCached }, { status: 200 });
  }

  const data = await response.json() as { places?: GooglePlace[] };
  const results: NearbyPoi[] = (data.places || []).map((place, index) => ({
    id: `${buildingId}_${type}_${place.id || index}`,
    buildingId,
    buildingName: building.name,
    type,
    name: place.displayName?.text || 'Nearby place',
    address: place.formattedAddress || '',
    distanceMeters: Math.round(distanceMeters(building, { lat: place.location?.latitude || 0, lng: place.location?.longitude || 0 })),
    lat: place.location?.latitude || 0,
    lng: place.location?.longitude || 0,
    rating: place.rating || null,
    userRatingCount: place.userRatingCount || null,
    source: 'Google Places API server refresh',
    sourceLastChecked: new Date().toISOString().slice(0, 10)
  }));

  memoryCache.set(memKey, { at: Date.now(), rows: results });
  await writeCachedJson(buildingId, type, results);
  return NextResponse.json({ source: 'google_places_server_refresh', apiKeyExposed: false, results });
}

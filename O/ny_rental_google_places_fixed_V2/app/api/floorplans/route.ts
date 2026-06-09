import { NextResponse } from 'next/server';
import { getPublicRentalDataset } from '@/lib/data';
import { toNumber } from '@/lib/format';
import type { BuildingInput } from '@/lib/filter-floorplans';

export const dynamic = 'force-dynamic';

// Returns every building + floor plan in the shape the advanced filter expects.
// The home page only ships building summaries, so the filter fetches this once
// when the user opens advanced search. Already public (no internal fields).
export async function GET() {
  const dataset = await getPublicRentalDataset();
  const buildings: BuildingInput[] = dataset.buildings
    .filter(building => Number.isFinite(building.lat) && Number.isFinite(building.lng))
    .map(building => ({
      id: building.id,
      name: building.name,
      address: building.address,
      lat: building.lat,
      lng: building.lng,
      floorPlans: building.units.map(unit => ({
        id: unit.id,
        buildingId: building.id,
        buildingName: building.name,
        bedrooms: unit.beds,
        bathrooms: toNumber(unit.baths) || undefined,
        price: unit.grossRent,
        sqft: toNumber(unit.sqft) || undefined,
        availableDate: unit.availableDate || undefined,
        unitName: unit.floorPlan || (unit.unitNumber ? `#${unit.unitNumber}` : undefined)
      }))
    }));

  return NextResponse.json({ buildings });
}

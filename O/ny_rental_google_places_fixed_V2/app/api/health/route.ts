import { NextResponse } from 'next/server';
import { getRentalDataset } from '@/lib/data';
import { getEnvStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

// Public liveness/readiness probe for uptime monitors and deploy checks.
// Returns only counts and boolean config flags — never secret values.
export async function GET() {
  const config = getEnvStatus();
  try {
    const dataset = await getRentalDataset();
    return NextResponse.json({
      status: 'ok',
      time: new Date().toISOString(),
      data: {
        buildings: dataset.summary.buildingCount,
        units: dataset.summary.unitCount,
        pois: dataset.summary.poiCount,
        source: dataset.summary.dataSourceMode ?? null,
        sheetLastSyncedAt: dataset.summary.sheetLastSyncedAt ?? null
      },
      config
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        time: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'dataset unavailable',
        config
      },
      { status: 503 }
    );
  }
}

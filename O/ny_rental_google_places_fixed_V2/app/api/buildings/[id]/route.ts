import { NextResponse } from 'next/server';
import { getPublicBuildingDetail } from '@/lib/data';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const building = await getPublicBuildingDetail(params.id);
  if (!building) return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  return NextResponse.json({ building });
}

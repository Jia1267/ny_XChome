import { RentalApp } from '@/components/RentalApp';
import { getInitialPublicRentalDataset } from '@/lib/data';

export default async function BuildingSharePage() {
  const dataset = await getInitialPublicRentalDataset();
  return <RentalApp dataset={dataset} />;
}

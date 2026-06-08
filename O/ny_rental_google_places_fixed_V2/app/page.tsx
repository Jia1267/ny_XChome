import { RentalApp } from '@/components/RentalApp';
import { getPublicRentalDataset } from '@/lib/data';

export default async function HomePage() {
  const dataset = await getPublicRentalDataset();
  return <RentalApp dataset={dataset} />;
}

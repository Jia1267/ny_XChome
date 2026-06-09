import { RentalApp } from '@/components/RentalApp';
import { getInitialPublicRentalDataset } from '@/lib/data';

export default async function HomePage() {
  const dataset = await getInitialPublicRentalDataset();
  return <RentalApp dataset={dataset} />;
}

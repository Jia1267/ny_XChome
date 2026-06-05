import { RentalApp } from '@/components/RentalApp';
import { getRentalDataset } from '@/lib/data';

export default async function HomePage() {
  const dataset = await getRentalDataset();
  return <RentalApp dataset={dataset} />;
}

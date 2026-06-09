import type { Metadata } from 'next';
import { ListingsView } from '@/components/ListingsView';
import { getInitialPublicRentalDataset } from '@/lib/data';

export const metadata: Metadata = {
  title: 'All Listings',
  description: 'Browse all NYC student rental buildings near Columbia, NYU, Baruch, and Pratt by price, neighborhood, and commute.'
};

export default async function ListingsPage() {
  const dataset = await getInitialPublicRentalDataset();
  return <ListingsView buildings={dataset.buildings} schools={dataset.schools} />;
}

import type { MetadataRoute } from 'next';
import { getInitialPublicRentalDataset } from '@/lib/data';
import { legalPages } from '@/lib/legal';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ny-rental-map.example.com';
  const dataset = await getInitialPublicRentalDataset();
  return [
    {
      url: siteUrl,
      lastModified: new Date()
    },
    {
      url: `${siteUrl}/listings`,
      lastModified: new Date()
    },
    {
      url: `${siteUrl}/legal`,
      lastModified: new Date()
    },
    ...legalPages.map(page => ({
      url: `${siteUrl}/legal/${page.slug}`,
      lastModified: new Date()
    })),
    ...dataset.buildings.map(building => ({
      url: `${siteUrl}/buildings/${encodeURIComponent(building.id)}`,
      lastModified: building.lastUpdatedAt ? new Date(building.lastUpdatedAt) : new Date()
    }))
  ];
}

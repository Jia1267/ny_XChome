import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ny-rental-map.example.com';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin']
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}

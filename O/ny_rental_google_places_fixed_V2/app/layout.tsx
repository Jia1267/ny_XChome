import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConsentBanner } from '@/components/ConsentBanner';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ny-rental-map.example.com'),
  title: {
    default: 'UniNest | Student Apartments Near NYC Campuses',
    template: '%s | UniNest'
  },
  description: 'Compare NYC student rentals near Columbia, NYU, Baruch, and Pratt with commute filters, verified listing context, nearby POIs, and direct inquiry capture.',
  icons: {
    icon: '/favicon.svg'
  },
  openGraph: {
    title: 'UniNest | Student Apartments Near NYC Campuses',
    description: 'Map-first NYC apartment discovery for students, with commute rings, listing confidence, unit comparison, and inquiry capture.',
    type: 'website',
    images: ['/og-image.png']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UniNest | Student Apartments Near NYC Campuses',
    description: 'Map-first NYC apartment discovery for students.',
    images: ['/og-image.png']
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f6f8fb'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/leaflet.css" />
      </head>
      <body>
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}

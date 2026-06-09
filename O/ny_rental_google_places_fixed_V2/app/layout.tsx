import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ny-rental-map.example.com'),
  title: {
    default: 'NY Rental Map | Student Apartments Near NYC Campuses',
    template: '%s | NY Rental Map'
  },
  description: 'Compare NYC student rentals near Columbia, NYU, Baruch, and Pratt with commute filters, verified listing context, nearby POIs, and direct inquiry capture.',
  icons: {
    icon: '/favicon.svg'
  },
  openGraph: {
    title: 'NY Rental Map | Student Apartments Near NYC Campuses',
    description: 'Map-first NYC apartment discovery for students, with commute rings, listing confidence, unit comparison, and inquiry capture.',
    type: 'website',
    images: ['/og-image.svg']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NY Rental Map | Student Apartments Near NYC Campuses',
    description: 'Map-first NYC apartment discovery for students.',
    images: ['/og-image.svg']
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
      <body>{children}</body>
    </html>
  );
}

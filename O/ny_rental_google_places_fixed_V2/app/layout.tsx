import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NY Rental Map',
  description: 'Student-friendly NYC rental discovery with verified listing context, commute filters, analytics, and lead capture.'
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

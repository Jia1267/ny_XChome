/** @type {import('next').NextConfig} */

// Applied to every response. CSP is intentionally omitted for now because the
// Leaflet map pulls tiles/inline styles from several CDNs; add it later in
// report-only mode first (see MAINTENANCE_PLAN.md 1.4).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
];

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.perchwell.com' },
      { protocol: 'https', hostname: 'rentmiramar.com' },
      { protocol: 'https', hostname: 'rockrose.com' },
      { protocol: 'https', hostname: 'sxxweb7cdn.cachefly.net' },
      { protocol: 'https', hostname: 'theorchardlic.com' },
      { protocol: 'https', hostname: 'verisresidential.com' },
      { protocol: 'https', hostname: 'www.udr.com' }
    ]
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

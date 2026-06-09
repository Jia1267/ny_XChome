/** @type {import('next').NextConfig} */
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
  poweredByHeader: false
};

export default nextConfig;

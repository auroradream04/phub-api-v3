import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  webpack: (config) => {
    // Ignore files in public/uploads directory during build
    config.module.rules.push({
      test: /public[\/\\]uploads[\/\\]/,
      loader: 'ignore-loader'
    });
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/watch/:id/stream.m3u8',
        destination: '/api/watch/:id/stream',
      },
      // MacCMS API rewrites
      {
        source: '/api.php/provide/vod/at/xml',
        destination: '/api/maccms/api.php/provide/vod/at/xml',
      },
      {
        source: '/api.php/provide/vod',
        destination: '/api/maccms/api.php/provide/vod',
      },
    ];
  },
};

export default nextConfig;

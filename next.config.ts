import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;

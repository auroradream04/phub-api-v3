import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore files in public/uploads directory during build
    config.module.rules.push({
      test: /public\/uploads\//,
      loader: 'ignore-loader'
    });
    return config;
  },
  // Also exclude from static file copying
  experimental: {
    outputFileTracingIgnores: ['public/uploads/**/*']
  }
};

export default nextConfig;

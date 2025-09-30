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
  // Exclude uploads from being copied to .next
  outputFileTracing: true
};

export default nextConfig;

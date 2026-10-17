import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack(config) {
    // The pinned ATK sources use ESM .js specifiers for TypeScript files.
    // Resolve them without changing the upstream runtime implementations.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
export default nextConfig;

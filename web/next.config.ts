import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === 'production';

// Centralized port configuration
const GATEWAY_PORT = Number(process.env.NEXT_PUBLIC_GATEWAY_PORT) || 3131;

const prodConfig: NextConfig = {
  reactStrictMode: false,
  output: 'export',
  distDir: '../static/react',
  trailingSlash: true,
  transpilePackages: ['react-remove-scroll'],
  // Exclude mock handlers from production bundle
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    // In production, redirect all mocks imports to the noop module
    // This ensures mock code and MSW dependency are not bundled
    config.resolve.alias['@/mocks/browser'] = path.resolve(projectRoot, 'mocks/noop.ts');
    config.resolve.alias['@/mocks/server'] = path.resolve(projectRoot, 'mocks/noop.ts');
    config.resolve.alias['@/mocks/handlers'] = path.resolve(projectRoot, 'mocks/noop.ts');

    return config;
  },
};

const devConfig: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ['react-remove-scroll'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://127.0.0.1:${GATEWAY_PORT}/api/:path*`,
      },
    ];
  },
};

export default isProd ? prodConfig : devConfig;

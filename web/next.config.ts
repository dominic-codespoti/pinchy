import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const prodConfig: NextConfig = {
  reactStrictMode: false,
  output: 'export',
  distDir: '../static/react',
  trailingSlash: true,
  turbopack: {
    root: __dirname,
  },
};

const devConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3131/api/:path*',
      },
    ];
  },
};

export default isProd ? prodConfig : devConfig;

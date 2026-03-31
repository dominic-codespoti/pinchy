/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const prodConfig = {
  output: 'export',
  distDir: '../static/react',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbo: false,
  },
};

/** @type {import('next').NextConfig} */
const devConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Proxy API calls to Rust backend in dev mode
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  async rewrites() {
    return [
      {
        source: '/mcp',
        destination: '/api/mcp',
      },
    ];
  },
};

export default nextConfig;

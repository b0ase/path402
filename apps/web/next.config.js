/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  // For Electron/Capacitor compatibility
  trailingSlash: true,
  // Disable server-side features for static export
  experimental: {
    // Enable if needed
  }
};

export default nextConfig;

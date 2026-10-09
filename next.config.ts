import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['unpdf', 'mammoth'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;

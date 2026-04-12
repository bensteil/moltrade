import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ioredis", "bcryptjs"],
  experimental: {
    workerThreads: true,
  },
};

export default nextConfig;

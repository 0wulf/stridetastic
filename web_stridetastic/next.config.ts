import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Environment variables are automatically passed from Docker Compose
  // No need to explicitly define them here since Docker will inject NEXT_PUBLIC_API_HOST_IP
};

export default nextConfig;

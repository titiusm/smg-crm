import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "coleslaw-ruse-broadly.ngrok-free.dev"],
  experimental: {
    // CSV imports can be multi-megabyte; lift the default 1 MB cap.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;

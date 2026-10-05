import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep RSC payloads in the client router cache so revisiting pages is instant.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;

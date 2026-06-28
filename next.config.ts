import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Real keyworded food photography for the landing page (loremflickr).
    // Swap these for brand-owned photos when available, then drop this host.
    remotePatterns: [{ protocol: "https", hostname: "loremflickr.com" }],
  },
};

export default nextConfig;

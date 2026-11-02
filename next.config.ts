import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ] }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const backendOrigin = process.env.APS_BACKEND_ORIGIN ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typedRoutes: true,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

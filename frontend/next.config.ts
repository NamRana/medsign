import type { NextConfig } from "next";

const isMobileBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isMobileBuild ? { output: "export" } : {}),
  ...(!isMobileBuild
    ? {
        async rewrites() {
          const backendUrl =
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          console.log("[next.config] Rewrite destination:", backendUrl);
          return [
            {
              source: "/api/:path*",
              destination: `${backendUrl}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;

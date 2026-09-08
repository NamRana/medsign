import type { MetadataRoute } from "next";
import { canonicalSiteUrl } from "@/lib/seo";

const PRIVATE_ROUTE_ROOTS = [
  "/admin",
  "/avatar",
  "/chat",
  "/dashboard",
  "/devices",
  "/face-scan",
  "/family",
  "/history",
  "/insights",
  "/medicines",
  "/pricing",
  "/reports",
  "/settings",
  "/auth",
  "/login",
  "/signup",
];

const PRIVATE_PATHS = PRIVATE_ROUTE_ROOTS.flatMap((path) => [path, `${path}/`]);

export default function robots(): MetadataRoute.Robots {
  const result: MetadataRoute.Robots = {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
  };

  if (canonicalSiteUrl) {
    result.sitemap = `${canonicalSiteUrl}/sitemap.xml`;
  }

  return result;
}

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const PUBLIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/ai-lab-report-analyzer", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/ai-symptom-checker", priority: 0.85, changeFrequency: "weekly" as const },
  { path: "/online-prescription", priority: 0.75, changeFrequency: "monthly" as const },
  { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/medical-safety", priority: 0.65, changeFrequency: "monthly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PAGES.flatMap(({ path, priority, changeFrequency }) => {
    const url = absoluteUrl(path);
    return url ? [{ url, lastModified, changeFrequency, priority }] : [];
  });
}

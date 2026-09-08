import type { Metadata } from "next";

export const SITE_NAME = "MedSign";
export const DEFAULT_SITE_DESCRIPTION =
  "Understand lab reports, AI-generated symptom assessments, and medication context before your next clinician visit. Review health decisions with a qualified professional.";

function normalizeSiteUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * The one public, production URL used for canonical tags, sitemaps, and shares.
 * Leave it unset locally; do not substitute a domain that is not serving this app.
 */
export const canonicalSiteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const metadataBase = canonicalSiteUrl ? new URL(canonicalSiteUrl) : undefined;

export function absoluteUrl(path: string): string | undefined {
  if (!canonicalSiteUrl) return undefined;
  return new URL(path, `${canonicalSiteUrl}/`).toString();
}

export function createPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const pageUrl = absoluteUrl(path);
  const imageUrl = absoluteUrl("/opengraph-image");

  return {
    title,
    description,
    alternates: pageUrl ? { canonical: path } : undefined,
    openGraph: {
      type: "website",
      title: `${title} | ${SITE_NAME}`,
      description,
      siteName: SITE_NAME,
      url: pageUrl,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: "MedSign — clear health context before your clinician visit",
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

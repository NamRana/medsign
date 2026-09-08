import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import {
  absoluteUrl,
  canonicalSiteUrl,
  DEFAULT_SITE_DESCRIPTION,
  metadataBase,
  SITE_NAME,
} from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const socialImageUrl = absoluteUrl("/opengraph-image");
const webSiteSchema = canonicalSiteUrl
  ? {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${canonicalSiteUrl}/#organization`,
          name: SITE_NAME,
          alternateName: ["MediSign", "Medisign"],
          url: `${canonicalSiteUrl}/`,
        },
        {
          "@type": "WebSite",
          "@id": `${canonicalSiteUrl}/#website`,
          name: SITE_NAME,
          alternateName: ["MediSign", "Medisign"],
          url: `${canonicalSiteUrl}/`,
          description: DEFAULT_SITE_DESCRIPTION,
          publisher: { "@id": `${canonicalSiteUrl}/#organization` },
        },
      ],
    }
  : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "MedSign | AI Lab Report Analyzer & Symptom Checker",
    template: "%s | MedSign",
  },
  description: DEFAULT_SITE_DESCRIPTION,
  alternates: metadataBase ? { canonical: "/" } : undefined,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    title: "MedSign | AI Lab Report Analyzer & Symptom Checker",
    description: DEFAULT_SITE_DESCRIPTION,
    siteName: SITE_NAME,
    url: metadataBase ? "/" : undefined,
    images: socialImageUrl
      ? [
          {
            url: socialImageUrl,
            width: 1200,
            height: 630,
            alt: "MedSign — clear health context before your clinician visit",
          },
        ]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: "MedSign | AI Lab Report Analyzer & Symptom Checker",
    description: DEFAULT_SITE_DESCRIPTION,
    images: socialImageUrl ? [socialImageUrl] : undefined,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MedSign",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="preconnect" href="https://ocqfwrkehtjaqhqycnjh.supabase.co" />
        <link rel="dns-prefetch" href="https://ocqfwrkehtjaqhqycnjh.supabase.co" />
        {webSiteSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(webSiteSchema).replace(/</g, "\\u003c"),
            }}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

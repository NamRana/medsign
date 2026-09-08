import Link from "next/link";
import type { ReactNode } from "react";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

type Section = {
  title: string;
  body: string[];
};

type Faq = {
  question: string;
  answer: string;
};

type RelatedLink = {
  href: string;
  label: string;
  description: string;
};

export type MarketingPageProps = {
  path: string;
  eyebrow: string;
  title: string;
  intro: string;
  highlights: string[];
  sections: Section[];
  faqs: Faq[];
  relatedLinks: RelatedLink[];
  safetyNote?: ReactNode;
};

const primaryNavigation = [
  { href: "/ai-lab-report-analyzer", label: "Lab reports" },
  { href: "/ai-symptom-checker", label: "Symptoms" },
  { href: "/online-prescription", label: "Prescription guidance" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/medical-safety", label: "Medical safety" },
];

export default function MarketingPage({
  path,
  eyebrow,
  title,
  intro,
  highlights,
  sections,
  faqs,
  relatedLinks,
  safetyNote,
}: MarketingPageProps) {
  const pageUrl = absoluteUrl(path);
  const webPageSchema = pageUrl
    ? {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        name: `${title} | ${SITE_NAME}`,
        description: intro,
        url: pageUrl,
        isPartOf: {
          "@type": "WebSite",
          "@id": `${absoluteUrl("/")}#website`,
          name: SITE_NAME,
        },
      }
    : undefined;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {webPageSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webPageSchema).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <header className="border-b border-teal-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-extrabold tracking-tight text-teal-800">
            MedSign
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-4 text-sm font-medium text-slate-600 md:flex">
            {primaryNavigation.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-teal-700">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/signup"
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Get started free
          </Link>
        </div>
      </header>

      <article>
        <section className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50 px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-6xl">
              {title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-700 sm:text-xl">{intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-3 font-semibold text-white transition hover:bg-teal-800"
              >
                Create your free account
              </Link>
              <Link
                href="/medical-safety"
                className="inline-flex items-center justify-center rounded-full border border-teal-200 bg-white px-6 py-3 font-semibold text-teal-800 transition hover:border-teal-400"
              >
                Read our safety approach
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {highlights.map((highlight) => (
              <div key={highlight} className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
                <span aria-hidden="true" className="text-xl text-teal-600">✓</span>
                <p className="mt-3 font-semibold leading-6 text-slate-800">{highlight}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-8 sm:pb-12">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-8">
              {sections.map((section) => (
                <section key={section.title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-950">{section.title}</h2>
                  <div className="mt-4 space-y-4 text-base leading-7 text-slate-700">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}

              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-7 sm:p-9">
                <h2 className="text-xl font-bold text-amber-950">Important medical safety note</h2>
                <div className="mt-3 space-y-3 text-sm leading-6 text-amber-950/85">
                  {safetyNote ?? (
                    <>
                      <p>MedSign may generate health assessments and medicine-related guidance from the information you share. It is not a substitute for a qualified healthcare professional&apos;s individual assessment.</p>
                      <p>For severe, sudden, or worsening symptoms, seek urgent in-person or emergency care.</p>
                    </>
                  )}
                </div>
              </section>
            </div>

            <aside className="h-fit rounded-3xl border border-teal-100 bg-teal-950 p-6 text-teal-50 lg:sticky lg:top-6">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-200">Explore MedSign</p>
              <ul className="mt-4 space-y-4">
                {primaryNavigation.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="font-semibold transition hover:text-teal-200">
                      {item.label} <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-7 inline-flex rounded-full bg-teal-200 px-4 py-2 text-sm font-bold text-teal-950 transition hover:bg-white"
              >
                Start free
              </Link>
            </aside>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700">Questions people ask</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">Useful answers, without overpromising</h2>
            <div className="mt-7 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white px-6">
              {faqs.map((faq) => (
                <details key={faq.question} className="py-5">
                  <summary className="cursor-pointer list-none pr-8 font-semibold text-slate-900 marker:hidden">
                    {faq.question}
                  </summary>
                  <p className="mt-3 leading-7 text-slate-700">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-teal-100 bg-teal-50 px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-950">Keep exploring</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {relatedLinks.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-2xl border border-teal-100 bg-white p-6 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                  <h3 className="font-bold text-teal-800">{link.label} <span aria-hidden="true">→</span></h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{link.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </article>

      <footer className="bg-slate-950 px-4 py-10 text-sm text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <p>MedSign helps organize health context for clearer care conversations.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/medical-safety" className="hover:text-white">Medical safety</Link>
            <Link href="/how-it-works" className="hover:text-white">How it works</Link>
            <Link href="/login" className="hover:text-white">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

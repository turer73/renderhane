import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });

  return {
    title: `${t("terms.title")} | Renderhane`,
    description: t("terms.intro").slice(0, 160),
    alternates: {
      canonical: `${BASE_URL}/${locale}/terms`,
      languages: { tr: `${BASE_URL}/tr/terms`, en: `${BASE_URL}/en/terms` },
    },
  };
}

export default async function TermsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });

  const sections = [
    { title: t("terms.section1Title"), content: t("terms.section1Content") },
    { title: t("terms.section2Title"), content: t("terms.section2Content") },
    { title: t("terms.section3Title"), content: t("terms.section3Content") },
    { title: t("terms.section4Title"), content: t("terms.section4Content") },
    { title: t("terms.section5Title"), content: t("terms.section5Content") },
    { title: t("terms.section6Title"), content: t("terms.section6Content") },
    { title: t("terms.section7Title"), content: t("terms.section7Content") },
    { title: t("terms.section8Title"), content: t("terms.section8Content") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <Button type="button" variant="ghost" size="sm" asChild className="mb-8 -ml-2">
            <Link href={`/${locale}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {t("backToHome")}
            </Link>
          </Button>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("terms.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("lastUpdated", { date: "2025-01-15" })}
          </p>

          <p className="mt-8 text-base leading-relaxed text-muted-foreground">
            {t("terms.intro")}
          </p>

          <div className="mt-10 space-y-10">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-xl font-semibold text-foreground">
                  {i + 1}. {section.title}
                </h2>
                <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

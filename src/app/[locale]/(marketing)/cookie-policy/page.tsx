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
    title: `${t("cookiePolicy.title")} | Renderhane`,
    description: t("cookiePolicy.intro").slice(0, 160),
    alternates: {
      canonical: `${BASE_URL}/${locale}/cookie-policy`,
      languages: { tr: `${BASE_URL}/tr/cookie-policy`, en: `${BASE_URL}/en/cookie-policy` },
    },
  };
}

export default async function CookiePolicyPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });

  const sections = [
    { title: t("cookiePolicy.section1Title"), content: t("cookiePolicy.section1Content") },
    { title: t("cookiePolicy.section2Title"), content: t("cookiePolicy.section2Content") },
    { title: t("cookiePolicy.section3Title"), content: t("cookiePolicy.section3Content") },
    { title: t("cookiePolicy.section4Title"), content: t("cookiePolicy.section4Content") },
    { title: t("cookiePolicy.section5Title"), content: t("cookiePolicy.section5Content") },
    { title: t("cookiePolicy.section6Title"), content: t("cookiePolicy.section6Content") },
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
            {t("cookiePolicy.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("lastUpdated", { date: "2026-03-16" })}
          </p>

          <p className="mt-8 text-base leading-relaxed text-muted-foreground">
            {t("cookiePolicy.intro")}
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

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
const CONTACT_EMAIL = "info@renderhane.com";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });

  return {
    title: `${t("metaTitle")} | Renderhane`,
    description: t("metaDescription"),
    alternates: {
      canonical: `${BASE_URL}/${locale}/iletisim`,
      languages: { tr: `${BASE_URL}/tr/iletisim`, en: `${BASE_URL}/en/iletisim` },
    },
  };
}

export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  const tLegal = await getTranslations({ locale, namespace: "legal" });

  const sections = [
    { title: t("supportTitle"), content: t("supportBody") },
    { title: t("businessTitle"), content: t("businessBody") },
    { title: t("hoursTitle"), content: t("hoursBody") },
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
              {tLegal("backToHome")}
            </Link>
          </Button>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>

          <p className="mt-8 text-base leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>

          <div className="mt-10 rounded-2xl border border-border bg-muted/40 p-8">
            <h2 className="text-xl font-semibold text-foreground">{t("emailTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("emailBody")}</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-4 inline-block text-lg font-medium text-primary hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          <div className="mt-10 space-y-10">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-xl font-semibold text-foreground">
                  {section.title}
                </h2>
                <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {section.content}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-14 text-center">
            <Button asChild>
              <a href={`mailto:${CONTACT_EMAIL}`}>{t("ctaButton")}</a>
            </Button>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

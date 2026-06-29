import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/landing/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAllArticles } from "@/lib/blog/articles";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });

  const title = `${t("title")} | Renderhane`;
  const description =
    locale === "tr"
      ? "E-ticaret, ürün fotoğrafçılığı, 3D modelleme ve yapay zeka hakkında rehberler ve ipuçları."
      : "Guides and tips on e-commerce, product photography, 3D modeling and AI.";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/blog`,
      languages: { tr: "/tr/blog", en: "/en/blog", "x-default": "/tr/blog" },
    },
    keywords:
      locale === "tr"
        ? ["e-ticaret blog", "ürün fotoğrafı", "3D model", "yapay zeka", "AI görsel"]
        : ["e-commerce blog", "product photography", "3D model", "AI", "AI visuals"],
    openGraph: {
      title,
      description,
      type: "website",
      url: `/${locale}/blog`,
    },
  };
}

export default async function BlogPage({
  params,
}: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  const articles = getAllArticles();

  // Blog + ItemList JSON-LD — signals a genuine content hub so Google is more
  // likely to index the locale variants (esp. /en/blog, previously "crawled,
  // currently not indexed") instead of treating them as thin duplicates.
  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${t("title")} | Renderhane`,
    url: `${BASE_URL}/${locale}/blog`,
    inLanguage: locale === "tr" ? "tr-TR" : "en-US",
    publisher: {
      "@type": "Organization",
      name: "Renderhane",
      logo: { "@type": "ImageObject", url: `${BASE_URL}/icon.png` },
    },
    blogPost: articles.map((article) => ({
      "@type": "BlogPosting",
      headline: article.title[locale] || article.title.tr,
      description: article.description[locale] || article.description.tr,
      datePublished: article.date,
      author: { "@type": "Organization", name: article.author },
      url: `${BASE_URL}/${locale}/blog/${article.slug}`,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <LandingHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>

          <div className="space-y-6">
            {articles.map((article) => (
              <Link
                key={article.slug}
                href={`/${locale}/blog/${article.slug}`}
                className="block"
              >
                <Card className="transition-all duration-300 hover:border-primary/50 hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {article.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {article.title[locale] || article.title.tr}
                    </h2>
                    <p className="mt-2 text-muted-foreground leading-relaxed">
                      {article.description[locale] || article.description.tr}
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{article.author}</span>
                      <span>&middot;</span>
                      <time dateTime={article.date}>
                        {new Date(article.date).toLocaleDateString(locale, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

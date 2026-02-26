import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/landing/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAllArticles } from "@/lib/blog/articles";

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  const articles = getAllArticles();

  return (
    <div className="flex min-h-screen flex-col">
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

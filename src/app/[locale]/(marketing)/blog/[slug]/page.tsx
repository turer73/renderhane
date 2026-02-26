import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/landing/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { CommentSection } from "@/components/blog/comment-section";
import { getArticleBySlug, getAllArticles } from "@/lib/blog/articles";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const article = getArticleBySlug(slug);

  if (!article) return {};

  const title = article.title[locale] || article.title.tr;
  const description = article.description[locale] || article.description.tr;

  return {
    title: `${title} | Renderhane Blog`,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: article.date,
      authors: [article.author],
    },
  };
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const title = article.title[locale] || article.title.tr;
  const description = article.description[locale] || article.description.tr;
  const content = article.content[locale] || article.content.tr;

  // Get other articles for "Related" section
  const otherArticles = getAllArticles().filter((a) => a.slug !== slug);

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          {/* Back to blog */}
          <Button type="button" variant="ghost" size="sm" asChild className="mb-8 -ml-2">
            <Link href={`/${locale}/blog`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {t("backToBlog")}
            </Link>
          </Button>

          {/* Article header */}
          <header className="mb-10">
            <div className="flex flex-wrap gap-2 mb-4">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl leading-tight">
              {title}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              {description}
            </p>
            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                R
              </div>
              <span className="font-medium text-foreground">{article.author}</span>
              <span>&middot;</span>
              <time dateTime={article.date}>
                {new Date(article.date).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </div>
          </header>

          <Separator className="mb-10" />

          {/* Article content */}
          <MarkdownRenderer content={content} />

          <Separator className="my-12" />

          {/* Comment / Q&A section */}
          <section id="comments">
            <h2 className="text-2xl font-bold mb-6">{t("commentsTitle")}</h2>
            <CommentSection slug={slug} locale={locale} />
          </section>

          {/* Related articles */}
          {otherArticles.length > 0 && (
            <>
              <Separator className="my-12" />
              <section>
                <h2 className="text-2xl font-bold mb-6">{t("relatedArticles")}</h2>
                <div className="space-y-4">
                  {otherArticles.slice(0, 3).map((a) => (
                    <Link
                      key={a.slug}
                      href={`/${locale}/blog/${a.slug}`}
                      className="block rounded-lg border p-4 transition-colors hover:border-primary/50"
                    >
                      <h3 className="font-semibold">
                        {a.title[locale] || a.title.tr}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {a.description[locale] || a.description.tr}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </article>
      </main>
      <Footer />
    </div>
  );
}

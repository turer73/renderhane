import Link from "next/link";
import { getToolConfig } from "@/lib/seo/tool-jsonld";
import { getAllArticles } from "@/lib/blog/articles";
import { HelpCircle, ListOrdered, ArrowRight, BookOpen } from "lucide-react";

interface ToolGuideSectionProps {
  slug: string;
  locale: string;
}

export function ToolGuideSection({ slug, locale }: ToolGuideSectionProps) {
  const tr = locale === "tr";
  const config = getToolConfig(slug);

  if (!config) return null;

  // Find relevant blog articles matching the tool context
  const articles = getAllArticles();
  const relevantArticles = articles
    .filter((a) => {
      const matchSlug =
        (slug.includes("3d") && a.slug.includes("3d")) ||
        (slug.includes("arka-plan") && a.slug.includes("arkaplan")) ||
        (slug.includes("sahne") && a.slug.includes("sahne")) ||
        (slug.includes("aplus") && a.slug.includes("a-plus")) ||
        (slug.includes("video") && a.slug.includes("video")) ||
        a.tags.some((t) => t.toLowerCase().includes(slug.replace("-", " ")));
      return matchSlug;
    })
    .slice(0, 3);

  // Fallback to top articles if none specific found
  const displayedArticles =
    relevantArticles.length > 0 ? relevantArticles : articles.slice(0, 3);

  return (
    <section className="tool-guide mt-12 space-y-10" aria-label={tr ? "Kullanım Rehberi ve SSS" : "Usage Guide & FAQ"}>
      {/* ── How to Use Steps ── */}
      {config.steps && config.steps.length > 0 && (
        <div className="tool-guide-panel rounded-2xl border border-border/40 bg-card/60 p-6 sm:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-indigo-500 mb-6">
            <ListOrdered className="size-5" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {tr ? `${config.name.tr} Nasıl Kullanılır?` : `How to Use ${config.name.en}?`}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {config.steps.map((step, idx) => (
              <div
                key={idx}
                className="tool-guide-item relative rounded-xl border border-border/50 bg-background/80 p-5 shadow-sm"
              >
                <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 font-bold text-indigo-600 dark:text-indigo-400">
                  {idx + 1}
                </div>
                <h3 className="font-semibold text-foreground text-sm sm:text-base">
                  {tr ? step.name.tr : step.name.en}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {tr ? step.text.tr : step.text.en}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FAQ Section (Visible text backing FAQPage schema) ── */}
      {config.faqs && config.faqs.length > 0 && (
        <div className="tool-guide-panel rounded-2xl border border-border/40 bg-card/60 p-6 sm:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-indigo-500 mb-6">
            <HelpCircle className="size-5" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {tr ? "Sıkça Sorulan Sorular" : "Frequently Asked Questions"}
            </h2>
          </div>
          <div className="space-y-3">
            {config.faqs.map((faq, idx) => (
              <details
                key={idx}
                className="tool-guide-item group rounded-xl border border-border/50 bg-background/80 p-4 transition-colors hover:border-indigo-500/30 open:border-indigo-500/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-foreground text-sm sm:text-base">
                  <span>{tr ? faq.q.tr : faq.q.en}</span>
                  <span className="ml-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </summary>
                <div className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-3">
                  {tr ? faq.a.tr : faq.a.en}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* ── Related Guides (Internal Linking Cluster) ── */}
      {displayedArticles.length > 0 && (
        <div className="tool-guide-panel rounded-2xl border border-border/40 bg-muted/20 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <BookOpen className="size-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {tr ? "İlgili Rehberler ve Makaleler" : "Related Guides & Articles"}
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {displayedArticles.map((art) => (
              <Link
                key={art.slug}
                href={`/${locale}/blog/${art.slug}`}
                className="tool-guide-item group rounded-xl border border-border/40 bg-background/60 p-4 transition-all hover:border-indigo-500/40 hover:shadow-sm"
              >
                <h4 className="text-sm font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2">
                  {tr ? art.title.tr : (art.title.en || art.title.tr)}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {tr ? art.description.tr : (art.description.en || art.description.tr)}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {tr ? "Rehberi Oku" : "Read Guide"}
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

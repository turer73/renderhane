import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/blog/articles";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";
const locales = ["tr", "en"] as const;

/**
 * Static page metadata with stable lastModified dates.
 * Update dates ONLY when page content actually changes — Google penalises
 * sitemap entries whose lastModified changes on every crawl.
 * null = will be filled dynamically (e.g. from most recent blog post date).
 */
const staticPages: { path: string; lastModified: string | null; changeFreq: "weekly" | "monthly"; priority: number }[] = [
  { path: "",         lastModified: "2026-04-02", changeFreq: "weekly",  priority: 1.0 },
  { path: "/blog",    lastModified: null,          changeFreq: "weekly",  priority: 0.8 },
  { path: "/hakkimizda", lastModified: "2026-06-12", changeFreq: "monthly", priority: 0.5 },
  { path: "/iletisim",   lastModified: "2026-06-12", changeFreq: "monthly", priority: 0.5 },
  { path: "/privacy", lastModified: "2025-01-15", changeFreq: "monthly", priority: 0.3 },
  { path: "/terms",   lastModified: "2025-01-15", changeFreq: "monthly", priority: 0.3 },
  { path: "/kvkk",    lastModified: "2025-01-15", changeFreq: "monthly", priority: 0.3 },
  { path: "/cookie-policy", lastModified: "2026-03-16", changeFreq: "monthly", priority: 0.3 },
  { path: "/login",   lastModified: "2026-03-23", changeFreq: "monthly", priority: 0.4 },
  // Free tools — high SEO value
  { path: "/araclar/arka-plan-kaldirma", lastModified: "2026-04-02", changeFreq: "weekly", priority: 0.8 },
  { path: "/araclar/qr-kod",            lastModified: "2026-04-02", changeFreq: "weekly", priority: 0.8 },
  // Tool landing pages — SEO
  { path: "/araclar/sahne-olustur",      lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/aplus-icerik",       lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/3d-model",           lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/gorsel-iyilestir",   lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/video-olustur",      lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/gorsel-duzenle",     lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/sosyal-medya-paketi",lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/ai-gorsel-uret",     lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/konusan-avatar",     lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
  { path: "/araclar/logo-tasarla",       lastModified: "2026-04-03", changeFreq: "monthly", priority: 0.7 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getAllArticles();
  // articles is sorted descending; first element is the most recent
  const latestBlogDate = articles[0]?.date ?? "2026-06-23";

  // Static marketing pages + login
  const staticEntries: MetadataRoute.Sitemap = staticPages.flatMap((page) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${page.path}`,
      lastModified: page.lastModified ?? latestBlogDate,
      changeFrequency: page.changeFreq,
      priority: page.priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${page.path}`])
        ),
      },
    }))
  );

  // Dynamic blog posts — use each article's publish date
  const blogEntries: MetadataRoute.Sitemap = articles.flatMap((article) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}/blog/${article.slug}`,
      lastModified: article.date,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}/blog/${article.slug}`])
        ),
      },
    }))
  );

  return [...staticEntries, ...blogEntries];
}

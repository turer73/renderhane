import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/blog/articles";

const BASE_URL = "https://renderhane.com";
const locales = ["tr", "en"] as const;

/**
 * Static page metadata with stable lastModified dates.
 * Update dates ONLY when page content actually changes — Google penalises
 * sitemap entries whose lastModified changes on every crawl.
 */
const staticPages: { path: string; lastModified: string; changeFreq: "weekly" | "monthly"; priority: number }[] = [
  { path: "",         lastModified: "2026-03-23", changeFreq: "weekly",  priority: 1.0 },
  { path: "/blog",    lastModified: "2025-03-01", changeFreq: "weekly",  priority: 0.8 },
  { path: "/privacy", lastModified: "2025-01-15", changeFreq: "monthly", priority: 0.3 },
  { path: "/terms",   lastModified: "2025-01-15", changeFreq: "monthly", priority: 0.3 },
  { path: "/kvkk",    lastModified: "2025-01-15", changeFreq: "monthly", priority: 0.3 },
  { path: "/cookie-policy", lastModified: "2026-03-16", changeFreq: "monthly", priority: 0.3 },
  { path: "/login",   lastModified: "2026-03-23", changeFreq: "monthly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getAllArticles();

  // Static marketing pages + login
  const staticEntries: MetadataRoute.Sitemap = staticPages.flatMap((page) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${page.path}`,
      lastModified: page.lastModified,
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

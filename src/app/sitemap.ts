import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/blog/articles";

const BASE_URL = "https://renderhane.com";
const locales = ["tr", "en"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  const articles = getAllArticles();

  // Static marketing pages
  const staticPages = ["", "/blog", "/privacy", "/terms", "/kvkk"];
  const staticEntries: MetadataRoute.Sitemap = staticPages.flatMap((page) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${page}`,
      lastModified: now,
      changeFrequency: page === "" ? ("weekly" as const) : ("monthly" as const),
      priority: page === "" ? 1.0 : 0.6,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${page}`])
        ),
      },
    }))
  );

  // Dynamic blog posts
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

  // Login page (indexable for acquisition)
  const loginEntries: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: `${BASE_URL}/${locale}/login`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
    alternates: {
      languages: Object.fromEntries(
        locales.map((l) => [l, `${BASE_URL}/${l}/login`])
      ),
    },
  }));

  return [...staticEntries, ...blogEntries, ...loginEntries];
}

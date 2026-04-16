import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/tr/app/", "/en/app/", "/ref/", "/embed/", "/_next/static/", "/favicon.ico", "/apple-icon", "/icon"],
      },
    ],
    sitemap: "https://www.renderhane.com/sitemap.xml",
  };
}

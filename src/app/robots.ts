import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/tr/app/", "/en/app/", "/ref/", "/embed/", "/tr/onboarding", "/en/onboarding", "/tr/login", "/en/login", "/tr/launch-preview", "/en/launch-preview"],
      },
    ],
    sitemap: "https://www.renderhane.com/sitemap.xml",
  };
}

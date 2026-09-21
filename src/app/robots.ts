import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://renderhane.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/tr/app/", "/en/app/", "/ref/", "/embed/", "/tr/onboarding", "/en/onboarding", "/tr/login", "/en/login", "/tr/launch-preview", "/en/launch-preview"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/ref/", "/embed/"],
      },
    ],
    sitemap: "https://renderhane.com/sitemap.xml",
  };
}

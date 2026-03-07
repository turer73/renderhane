import { ImageResponse } from "next/og";
import { getArticleBySlug } from "@/lib/blog/articles";

export const alt = "Renderhane Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BlogOGImage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const article = getArticleBySlug(slug);

  const title = article
    ? article.title[locale] || article.title.tr
    : "Renderhane Blog";
  const tags = article?.tags?.slice(0, 3) || [];

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 60,
          fontFamily: "sans-serif",
          color: "white",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 24,
              opacity: 0.8,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            renderhane. blog
          </div>
          <div
            style={{
              fontSize: title.length > 60 ? 36 : 48,
              fontWeight: 700,
              lineHeight: 1.2,
              maxWidth: 900,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 16,
            opacity: 0.8,
          }}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: "rgba(255,255,255,0.15)",
                padding: "6px 14px",
                borderRadius: 20,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}

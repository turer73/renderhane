"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { proxyUrl } from "@/lib/proxy-url";

// Lazy-load 3D thumbnail — only loaded when a project has a GLB output
const ModelThumbnail = dynamic(
  () =>
    import("@/components/viewer/model-thumbnail").then(
      (m) => m.ModelThumbnail
    ),
  { ssr: false }
);

interface ProjectCardProps {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  sourceImageUrl: string | null;
  outputCount: number;
  createdAt: string;
  /** URL of a GLB output — if present, shows a live 3D thumbnail */
  glbUrl?: string | null;
}

export function ProjectCard({
  id,
  name,
  thumbnailUrl,
  sourceImageUrl,
  outputCount,
  createdAt,
  glbUrl,
}: ProjectCardProps) {
  const t = useTranslations("projects");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const imageUrl = thumbnailUrl || sourceImageUrl;
  const [imgError, setImgError] = useState(false);

  // Decide what to show: if thumbnail is from an external CDN (fal.media etc),
  // proxy it for CORS. Supabase signed URLs pass through unchanged.
  const displayUrl = imageUrl ? proxyUrl(imageUrl) : null;

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // Show 3D thumbnail when: GLB exists AND (no image thumbnail OR image failed)
  const show3d = !!glbUrl && (!displayUrl || imgError);

  return (
    <Link href={`/${locale}/app/project/${id}`} className="block group">
      <Card className="overflow-hidden border-border/50 shadow-sm transition-all hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 dark:hover:border-indigo-800 dark:hover:shadow-indigo-900/20">
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {/* Priority 1: Image thumbnail (from output or source) */}
          {displayUrl && !imgError ? (
            <Image
              src={displayUrl}
              alt={name}
              fill
              unoptimized
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              onError={() => setImgError(true)}
            />
          ) : show3d ? (
            /* Priority 2: Live 3D thumbnail for GLB outputs */
            <div className="relative h-full w-full bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-800">
              <ModelThumbnail url={proxyUrl(glbUrl!)} />
              <div className="absolute bottom-2 left-2">
                <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  3D
                </span>
              </div>
            </div>
          ) : (
            /* Priority 3: Placeholder */
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground/40"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              {imageUrl && imgError && (
                <span className="text-[10px] text-muted-foreground/50">
                  {t("imageExpired")}
                </span>
              )}
            </div>
          )}

          {/* 3D badge overlay when image thumbnail exists alongside GLB */}
          {displayUrl && !imgError && glbUrl && (
            <div className="absolute bottom-2 left-2">
              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                3D
              </span>
            </div>
          )}
        </div>
        <CardHeader className="pb-2">
          <CardTitle className="truncate text-sm">{name}</CardTitle>
        </CardHeader>
        <CardContent className="pb-0">
          <p className="text-xs text-muted-foreground">
            {t("created")}: {formatDate(createdAt)}
          </p>
        </CardContent>
        <CardFooter>
          <Badge variant={outputCount > 0 ? "secondary" : "outline"}>
            {outputCount > 0
              ? t("outputs", { count: outputCount })
              : t("noOutputs")}
          </Badge>
        </CardFooter>
      </Card>
    </Link>
  );
}

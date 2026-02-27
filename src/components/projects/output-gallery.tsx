"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DownloadMenu } from "@/components/app/download-menu";
import { proxyUrl } from "@/lib/proxy-url";

interface Output {
  id: string;
  type: "glb" | "image" | "video";
  fal_url: string | null;
  r2_url: string | null;
  file_size: number | null;
  created_at: string;
}

interface OutputGalleryProps {
  outputs: Output[];
}

function GlbIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

export function OutputGallery({ outputs }: OutputGalleryProps) {
  const t = useTranslations("projects");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  if (outputs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noOutputs")}
      </p>
    );
  }

  function getOutputUrl(output: Output): string {
    return output.r2_url || output.fal_url || "";
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {outputs.map((output) => {
        const url = getOutputUrl(output);
        const typeLabel = t(`outputTypes.${output.type}`);

        return (
          <Card key={output.id} className="overflow-hidden border-border/50 shadow-sm hover:border-indigo-200 hover:shadow-md dark:hover:border-indigo-800 transition-all p-0">
            <Link
              href={`/${locale}/app/output/${output.id}`}
              className="relative block aspect-square w-full overflow-hidden bg-muted hover:opacity-90 transition-opacity"
            >
              {output.type === "image" && url ? (
                <Image
                  src={url}
                  alt={typeLabel}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              ) : output.type === "glb" ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <GlbIcon className="h-12 w-12 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">
                    {typeLabel}
                  </span>
                </div>
              ) : output.type === "video" ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <VideoIcon className="h-12 w-12 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">
                    {typeLabel}
                  </span>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-xs text-muted-foreground">
                    {typeLabel}
                  </span>
                </div>
              )}
            </Link>

            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <Badge
                  variant={
                    output.type === "glb"
                      ? "default"
                      : output.type === "video"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {typeLabel}
                </Badge>
                {output.file_size && (
                  <span className="truncate text-xs text-muted-foreground">
                    {formatFileSize(output.file_size)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {output.type === "glb" && url && (
                  <Button type="button" variant="ghost" size="icon-xs" asChild>
                    <a
                      href={`/${locale}/embed/${output.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("view3d")}
                      aria-label={t("view3d")}
                    >
                      <GlbIcon className="h-3 w-3" />
                    </a>
                  </Button>
                )}
                {url && (
                  <DownloadMenu
                    url={proxyUrl(url)}
                    outputType={output.type}
                    compact
                  />
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

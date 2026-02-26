import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { TOOL_CREDITS, type ToolType } from "@/lib/fal/models";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutputActions } from "@/components/output/output-actions";
import { proxyUrl } from "@/lib/proxy-url";

export default async function OutputDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "output" });
  const tProjects = await getTranslations({ locale, namespace: "projects" });
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch the output
  const { data: output, error } = await supabase
    .from("outputs")
    .select("*, jobs(tool, project_id)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !output) {
    notFound();
  }

  const url = output.r2_url || output.fal_url;
  const projectId = output.jobs?.project_id;
  const outputType = output.type as "glb" | "image" | "video";

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Tools that accept images as input (active tools with models)
  const imageTools: { tool: ToolType; icon: string }[] = [
    { tool: "3d-model", icon: "cube" },
    { tool: "bg-remove", icon: "eraser" },
    { tool: "enhance", icon: "sparkles" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-3">
        {projectId && (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={`/${locale}/app/project/${projectId}`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              {t("backToProject")}
            </Link>
          </Button>
        )}
      </div>

      {/* Output preview — centered in a card frame */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center p-0">
          {outputType === "image" && url ? (
            <div className="flex w-full justify-center bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px] p-6">
              <div className="relative aspect-square w-full max-w-md">
                <Image
                  src={url}
                  alt={t("title")}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 448px"
                  priority
                />
              </div>
            </div>
          ) : outputType === "glb" && url ? (
            <div className="flex h-[400px] w-full items-center justify-center bg-black/5">
              <p className="text-sm text-muted-foreground">
                {tProjects("outputTypes.glb")}
              </p>
            </div>
          ) : outputType === "video" && url ? (
            <video
              src={proxyUrl(url)}
              controls
              className="w-full max-h-[520px]"
              autoPlay
              muted
              loop
            />
          ) : (
            <div className="flex h-[300px] w-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {t("errorLoad")}
              </p>
            </div>
          )}

          {/* Metadata bar */}
          <div className="flex w-full items-center justify-between gap-4 border-t px-4 py-3">
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  outputType === "glb"
                    ? "default"
                    : outputType === "video"
                      ? "secondary"
                      : "outline"
                }
              >
                {tProjects(`outputTypes.${outputType}`)}
              </Badge>
              {output.file_size && (
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(output.file_size)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDate(output.created_at)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons — only for image outputs */}
      {outputType === "image" && url && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("processWith")}
            </h2>
            <OutputActions
              imageUrl={url}
              tools={imageTools}
              creditCosts={TOOL_CREDITS}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

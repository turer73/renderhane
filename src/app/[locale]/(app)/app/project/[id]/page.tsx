import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { TOOL_KEYS, TOOL_CREDITS, type ToolType } from "@/lib/fal/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OutputGallery } from "@/components/projects/output-gallery";
import { OutputActions } from "@/components/output/output-actions";

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  processing: "default",
  completed: "outline",
  failed: "destructive",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "projects" });
  const tTools = await getTranslations({ locale, namespace: "tools" });
  const tDash = await getTranslations({ locale, namespace: "dashboard" });
  const tCredits = await getTranslations({ locale, namespace: "credits" });
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch the project
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    notFound();
  }

  // Fetch jobs for this project
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch outputs for this project
  const { data: outputs } = await supabase
    .from("outputs")
    .select("*")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case "pending":
        return tDash("statusPending");
      case "processing":
        return tDash("statusProcessing");
      case "completed":
        return tDash("statusCompleted");
      case "failed":
        return tDash("statusFailed");
      default:
        return status;
    }
  }

  const jobList = jobs ?? [];
  const outputList = (outputs ?? []).map((o) => ({
    id: o.id as string,
    type: o.type as "glb" | "image" | "video",
    fal_url: (o.fal_url as string) || null,
    r2_url: (o.r2_url as string) || null,
    file_size: (o.file_size as number) || null,
    created_at: o.created_at as string,
  }));

  return (
    <div className="space-y-6">
      {/* Back link + title */}
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href={`/${locale}/app/projects`}>
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
            {t("title")}
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
      <p className="text-sm text-muted-foreground">
        {t("created")}: {formatDate(project.created_at)}
      </p>

      {/* Source Image + Next Actions */}
      {project.source_image_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("sourceImage")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="relative mx-auto aspect-square max-w-sm overflow-hidden rounded-lg bg-muted">
              <Image
                src={project.source_image_url}
                alt={project.name}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 384px"
              />
            </div>

            {/* What do you want to do? */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("whatNext")}
              </h3>
              <OutputActions
                imageUrl={project.source_image_url}
                tools={[
                  { tool: "3d-model", icon: "cube" },
                  { tool: "bg-remove", icon: "eraser" },
                  { tool: "enhance", icon: "sparkles" },
                  { tool: "scene", icon: "image" },
                  { tool: "video", icon: "video" },
                  { tool: "aplus", icon: "star" },
                ]}
                creditCosts={TOOL_CREDITS}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Jobs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("jobs")}</CardTitle>
        </CardHeader>
        <CardContent>
          {jobList.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {tDash("noJobs")}
            </p>
          ) : (
            <div className="space-y-3">
              {jobList.map((job) => {
                const toolKey =
                  TOOL_KEYS[job.tool as ToolType] || job.tool;

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {tTools(toolKey)}
                        </span>
                        <Badge
                          variant={
                            STATUS_VARIANTS[job.status] ?? "secondary"
                          }
                        >
                          {getStatusLabel(job.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {tCredits("cost", { count: job.credit_cost })}
                        </span>
                        <span>&middot;</span>
                        <span>{formatTime(job.created_at)}</span>
                        {job.error_message && (
                          <>
                            <span>&middot;</span>
                            <span className="text-red-500">
                              {job.error_message}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {(job.status === "pending" ||
                      job.status === "processing") && (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Outputs Gallery */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          {t("outputs", { count: outputList.length })}
        </h2>
        <OutputGallery outputs={outputList} />
      </div>
    </div>
  );
}

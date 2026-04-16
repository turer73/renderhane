import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { OutputCatalog } from "@/components/projects/output-catalog";
import type { CatalogOutput } from "@/components/projects/output-catalog";

/**
 * Projelerim page — output-based filterable catalog.
 *
 * Instead of showing project-level cards, this page queries individual
 * outputs joined with their parent job (for tool/model info) and project
 * (for the display name). The client-side OutputCatalog handles filtering
 * by tool category, search, sorting, and delete.
 */
export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "projects" });
  const tDash = await getTranslations({ locale, namespace: "dashboard" });
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch all outputs with their parent job (tool, model_id) and project (name).
  // outputs.job_id → jobs, outputs.project_id → projects
  const { data: rawOutputs } = await supabase
    .from("outputs")
    .select(
      `
      id,
      type,
      fal_url,
      r2_url,
      file_size,
      created_at,
      project_id,
      jobs!inner(id, tool, model_id),
      projects(name)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Transform into the shape the client component expects
  const outputs: CatalogOutput[] = (rawOutputs ?? []).map((row) => {
    // Supabase returns joined objects — handle both single and array shapes
    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    const project = Array.isArray(row.projects)
      ? row.projects[0]
      : row.projects;

    return {
      id: row.id as string,
      type: row.type as "glb" | "image" | "video",
      falUrl: (row.fal_url as string) || null,
      r2Url: (row.r2_url as string) || null,
      fileSize: (row.file_size as number) || null,
      createdAt: row.created_at as string,
      jobId: job?.id ?? "",
      tool: job?.tool ?? "unknown",
      modelId: job?.model_id ?? "",
      projectName: project?.name ?? "—",
      projectId: (row.project_id as string) ?? "",
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/app`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
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
          {tDash("goBack")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </div>

      {/* Catalog */}
      <OutputCatalog outputs={outputs} locale={locale} />
    </div>
  );
}

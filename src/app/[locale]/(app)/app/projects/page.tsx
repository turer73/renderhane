import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { ProjectCard } from "@/components/projects/project-card";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "projects" });
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch projects with output counts, sorted by most recently updated
  const { data: projects } = await supabase
    .from("projects")
    .select(
      `
      id,
      name,
      thumbnail_url,
      source_image_url,
      created_at,
      outputs:outputs(count)
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const projectList = (projects ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    thumbnailUrl: (p.thumbnail_url as string) || null,
    sourceImageUrl: (p.source_image_url as string) || null,
    outputCount:
      Array.isArray(p.outputs) && p.outputs.length > 0
        ? (p.outputs[0] as { count: number }).count
        : 0,
    createdAt: p.created_at as string,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>

      {projectList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-16">
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
            className="mb-4 text-muted-foreground/40"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          <p className="text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {projectList.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              thumbnailUrl={project.thumbnailUrl}
              sourceImageUrl={project.sourceImageUrl}
              outputCount={project.outputCount}
              createdAt={project.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

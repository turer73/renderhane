import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { ProjectCard } from "@/components/projects/project-card";
import { refreshSignedUrl } from "@/lib/supabase/refresh-url";

interface OutputRow {
  id: string;
  type: string;
  fal_url: string | null;
  r2_url: string | null;
  created_at: string;
}

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

  // Fetch projects WITH their outputs so we can pick the best thumbnail.
  // Output URLs from fal.media never expire — unlike Supabase signed URLs.
  const { data: projects } = await supabase
    .from("projects")
    .select(
      `
      id,
      name,
      thumbnail_url,
      source_image_url,
      created_at,
      outputs(id, type, fal_url, r2_url, created_at)
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const projectList = await Promise.all((projects ?? []).map(async (p) => {
    const allOutputs = ((p.outputs ?? []) as OutputRow[]).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Best thumbnail: prefer an image/video output (fal.media URL — never expires)
    const imageOutput = allOutputs.find(
      (o) =>
        (o.type === "image" || o.type === "video") && (o.fal_url || o.r2_url)
    );
    const bestImageUrl = imageOutput
      ? imageOutput.fal_url || imageOutput.r2_url
      : null;

    // If the project has a GLB output, pass its URL for the 3D thumbnail
    const glbOutput = allOutputs.find(
      (o) => o.type === "glb" && (o.fal_url || o.r2_url)
    );
    const glbUrl = glbOutput ? glbOutput.fal_url || glbOutput.r2_url : null;

    // Refresh expired Supabase signed URLs for thumbnails that aren't from fal.media
    const rawThumb = bestImageUrl || (p.thumbnail_url as string) || null;
    const rawSource = (p.source_image_url as string) || null;
    const thumbnailUrl = await refreshSignedUrl(supabase, rawThumb);
    const sourceImageUrl = await refreshSignedUrl(supabase, rawSource);

    return {
      id: p.id as string,
      name: p.name as string,
      thumbnailUrl,
      sourceImageUrl,
      outputCount: allOutputs.length,
      createdAt: p.created_at as string,
      glbUrl,
    };
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/app`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          {tDash("goBack")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </div>

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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              thumbnailUrl={project.thumbnailUrl}
              sourceImageUrl={project.sourceImageUrl}
              outputCount={project.outputCount}
              createdAt={project.createdAt}
              glbUrl={project.glbUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { getTranslations } from "next-intl/server";

// Use service role to bypass RLS for public embed
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "viewer" });
  const supabase = getServiceClient();

  const { data: output } = await supabase
    .from("outputs")
    .select("fal_url, type, job_id")
    .eq("id", id)
    .eq("type", "glb")
    .single();

  if (!output?.fal_url) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-sm text-white">{t("modelNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      <ModelViewer url={output.fal_url} className="h-full w-full" />
    </div>
  );
}

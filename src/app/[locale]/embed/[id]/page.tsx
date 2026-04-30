import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { proxyUrl } from "@/lib/proxy-url";
import { EmbedViewer } from "@/components/viewer/embed-viewer";

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
    .select("r2_url, fal_url, type, job_id")
    .eq("id", id)
    .eq("type", "glb")
    .single();

  const modelUrl = output?.r2_url || output?.fal_url;

  if (!modelUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-sm text-white">{t("modelNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      <EmbedViewer url={proxyUrl(modelUrl)} />
    </div>
  );
}

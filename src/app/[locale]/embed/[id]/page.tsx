import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { proxyUrl } from "@/lib/proxy-url";
import { createClient } from "@/lib/supabase/server";
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

  // Viewer identity for the owner exception below (null when anonymous).
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const supabase = getServiceClient();

  const { data: output } = await supabase
    .from("outputs")
    .select("r2_url, fal_url, type, job_id, user_id, is_shareable")
    .eq("id", id)
    .eq("type", "glb")
    .single();

  // Non-shared outputs are visible only to their owner. is_shareable
  // defaults to FALSE (019 migration) and nothing sets it yet, so without
  // the owner exception every existing embed would break.
  const isOwner = !!user && !!output && output.user_id === user.id;
  const modelUrl =
    output && (output.is_shareable || isOwner)
      ? output.r2_url || output.fal_url
      : null;

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

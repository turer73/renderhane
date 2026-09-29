import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-check";
import { ModelLabPanel } from "@/components/admin/model-lab-panel";
import { getTranslations } from "next-intl/server";

export default async function AdminModelsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "modelLab" });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) redirect(`/${locale}/app`);
  return <div className="mx-auto w-full max-w-6xl space-y-5">
    <Link href={`/${locale}/app/admin`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline">{t("back")}</Link>
    <ModelLabPanel userId={user.id} />
  </div>;
}

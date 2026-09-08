import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-check";
import { workshopConfig } from "@/lib/relief/workshop-server";
import { ReliefWorkshop } from "@/components/relief/relief-workshop";

export default async function ReliefWorkshopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) redirect(`/${locale}/app`);
  return <ReliefWorkshop configured={Boolean(workshopConfig())} />;
}

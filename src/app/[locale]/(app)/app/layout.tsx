import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { JobPollingProvider } from "@/hooks/use-job-polling";
import { ProcessingModal } from "@/components/app/processing-modal";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <>
      {/* Single polling provider + modal for ALL /app/* pages.
          JobStatus, ProcessingModal, and any page can useJobPolling(). */}
      <JobPollingProvider>
        <AppShell>{children}</AppShell>
        <ProcessingModal />
      </JobPollingProvider>
      <Toaster />
    </>
  );
}

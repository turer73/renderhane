import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { JobPollingProvider } from "@/hooks/use-job-polling";
import { ProcessingModal } from "@/components/app/processing-modal";
import { UpgradeModal } from "@/components/app/upgrade-modal";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

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
      <ErrorBoundary>
        <JobPollingProvider>
          <AppShell>{children}</AppShell>
          <ProcessingModal />
          <UpgradeModal />
        </JobPollingProvider>
      </ErrorBoundary>
      <Toaster />
    </>
  );
}

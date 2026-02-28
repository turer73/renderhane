import { DashboardContent } from "@/components/app/dashboard-content";
import { JobStatus } from "@/components/app/job-status";
import { ProcessingModal } from "@/components/app/processing-modal";
import { ReferralCard } from "@/components/app/referral-card";
import { JobPollingProvider } from "@/hooks/use-job-polling";

export default function AppDashboard() {
  return (
    // Single polling provider — JobStatus and ProcessingModal share
    // the same /api/jobs/status data instead of fetching independently.
    <JobPollingProvider>
      <div className="space-y-8">
        <DashboardContent />
        <ReferralCard />
        <JobStatus />
        <ProcessingModal />
      </div>
    </JobPollingProvider>
  );
}

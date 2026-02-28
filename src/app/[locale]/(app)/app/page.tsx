import { DashboardContent } from "@/components/app/dashboard-content";
import { JobStatus } from "@/components/app/job-status";
import { ReferralCard } from "@/components/app/referral-card";

export default function AppDashboard() {
  return (
    // JobPollingProvider + ProcessingModal are in the shared app layout,
    // so every /app/* page (dashboard, project detail, batch) shares them.
    <div className="space-y-8">
      <DashboardContent />
      <ReferralCard />
      <JobStatus />
    </div>
  );
}

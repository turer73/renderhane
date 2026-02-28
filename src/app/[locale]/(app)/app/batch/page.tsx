import { BatchUpload } from "@/components/app/batch-upload";
import { JobStatus } from "@/components/app/job-status";

export default function BatchPage() {
  return (
    // JobPollingProvider is in the shared app layout — no need to wrap here.
    <div className="space-y-8">
      <BatchUpload />
      <JobStatus />
    </div>
  );
}

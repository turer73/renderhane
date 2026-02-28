import { BatchUpload } from "@/components/app/batch-upload";
import { JobStatus } from "@/components/app/job-status";
import { JobPollingProvider } from "@/hooks/use-job-polling";

export default function BatchPage() {
  return (
    <JobPollingProvider>
      <div className="space-y-8">
        <BatchUpload />
        <JobStatus />
      </div>
    </JobPollingProvider>
  );
}

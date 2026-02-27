import { BatchUpload } from "@/components/app/batch-upload";
import { JobStatus } from "@/components/app/job-status";

export default function BatchPage() {
  return (
    <div className="space-y-8">
      <BatchUpload />
      <JobStatus />
    </div>
  );
}

import { PhotoUpload } from "@/components/app/photo-upload";
import { JobStatus } from "@/components/app/job-status";

export default function AppDashboard() {
  return (
    <div className="space-y-8">
      <PhotoUpload />
      <JobStatus />
    </div>
  );
}

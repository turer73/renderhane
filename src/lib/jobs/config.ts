/**
 * Job status configuration
 * Used by AI agents for job tracking and monitoring
 */

export const jobStatusConfig = {
  statuses: ["pending", "processing", "completed", "failed"] as const,
  staleThresholdMinutes: 30,
  maxRetries: 3,
  labels: {
    pending: "Bekliyor",
    processing: "İşleniyor",
    completed: "Tamamlandı",
    failed: "Başarısız",
  },
} as const;

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { TOOL_KEYS, type ToolType } from "@/lib/fal/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Job {
  id: string;
  tool: string;
  status: "pending" | "processing" | "completed" | "failed";
  credit_cost: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  processing: "default",
  completed: "outline",
  failed: "destructive",
};

export function JobStatus() {
  const tDash = useTranslations("dashboard");
  const tTools = useTranslations("tools");
  const tCredits = useTranslations("credits");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/status");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch {
      // Silently fail — will retry on next poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll every 3 seconds if there are active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (j) => j.status === "pending" || j.status === "processing"
    );
    if (!hasActiveJobs) return;

    const id = setInterval(fetchJobs, 3000);
    return () => clearInterval(id);
  }, [jobs, fetchJobs]);

  function getStatusLabel(status: Job["status"]): string {
    switch (status) {
      case "pending":
        return tDash("statusPending");
      case "processing":
        return tDash("statusProcessing");
      case "completed":
        return tDash("statusCompleted");
      case "failed":
        return tDash("statusFailed");
      default:
        return status;
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tDash("recentJobs")}</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {tDash("noJobs")}
          </p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const toolKey = (job.tool in TOOL_KEYS ? TOOL_KEYS[job.tool as ToolType] : job.tool);

              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {tTools(toolKey)}
                      </span>
                      <Badge variant={STATUS_VARIANTS[job.status] ?? "secondary"}>
                        {getStatusLabel(job.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{tCredits("cost", { count: job.credit_cost })}</span>
                      <span>&middot;</span>
                      <span>{formatTime(job.created_at)}</span>
                      {job.error_message && (
                        <>
                          <span>&middot;</span>
                          <span className="text-red-500">{job.error_message}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {job.status === "completed" && (
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href={`/api/jobs/${job.id}/result`} target="_blank" rel="noopener noreferrer">
                        {tDash("viewResult")}
                      </a>
                    </Button>
                  )}

                  {(job.status === "pending" || job.status === "processing") && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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
  output_url: string | null;
  output_type: "glb" | "image" | "video" | null;
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
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  {/* Thumbnail for completed image jobs */}
                  {job.status === "completed" && job.output_url && job.output_type === "image" ? (
                    <a
                      href={`/api/jobs/${job.id}/result`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border hover:ring-primary transition-colors"
                    >
                      <Image
                        src={job.output_url}
                        alt={tTools(toolKey)}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </a>
                  ) : job.status === "completed" && job.output_url ? (
                    <a
                      href={`/api/jobs/${job.id}/result`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-border hover:ring-primary transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </a>
                  ) : null}

                  {/* Job info */}
                  <div className="flex flex-1 flex-col gap-1">
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

                  {/* Action buttons */}
                  {job.status === "completed" && job.output_url && (
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={job.output_url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
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

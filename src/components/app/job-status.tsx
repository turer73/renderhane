"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { TOOL_KEYS, type ToolType } from "@/lib/fal/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DownloadMenu } from "@/components/app/download-menu";
import { proxyUrl } from "@/lib/proxy-url";

// Lazy-load the 3D viewer — heavy Three.js bundle loaded only when needed
const ModelViewer = dynamic(
  () => import("@/components/viewer/model-viewer").then((m) => m.ModelViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center rounded-lg border bg-muted">
        <span className="text-sm text-muted-foreground animate-pulse">
          3D yükleniyor…
        </span>
      </div>
    ),
  }
);

interface Job {
  id: string;
  tool: string;
  status: "pending" | "processing" | "completed" | "failed";
  credit_cost: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  output_id: string | null;
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
  const tViewer = useTranslations("viewer");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded3d, setExpanded3d] = useState<string | null>(null);

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

  // Listen for new job submissions from PhotoUpload
  useEffect(() => {
    const handleNewJob = () => {
      fetchJobs();
    };
    window.addEventListener("job-submitted", handleNewJob);
    return () => window.removeEventListener("job-submitted", handleNewJob);
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
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          {tDash("recentJobs")}
        </CardTitle>
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
              const is3dExpanded = expanded3d === job.id;

              return (
                <div key={job.id} className="space-y-0">
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3 transition-colors hover:bg-muted/30">
                    {/* Thumbnail for completed image jobs */}
                    {job.status === "completed" && job.output_url && job.output_type === "image" ? (
                      <Link
                        href={job.output_id ? `/${locale}/app/output/${job.output_id}` : `/api/jobs/${job.id}/result`}
                        className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border hover:ring-primary transition-colors"
                      >
                        <Image
                          src={job.output_url}
                          alt={tTools(toolKey)}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      </Link>
                    ) : job.status === "completed" && job.output_url && job.output_type === "glb" ? (
                      <button
                        type="button"
                        onClick={() => setExpanded3d(is3dExpanded ? null : job.id)}
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-border hover:ring-primary transition-colors"
                        title={tViewer("loading")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={is3dExpanded ? "text-primary" : "text-muted-foreground"}>
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                      </button>
                    ) : job.status === "completed" && job.output_url ? (
                      <Link
                        href={job.output_id ? `/${locale}/app/output/${job.output_id}` : `/api/jobs/${job.id}/result`}
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-border hover:ring-primary transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                      </Link>
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
                    <div className="flex items-center gap-2">
                      {/* 3D viewer toggle button */}
                      {job.status === "completed" && job.output_url && job.output_type === "glb" && (
                        <Button
                          type="button"
                          variant={is3dExpanded ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExpanded3d(is3dExpanded ? null : job.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                          </svg>
                          {is3dExpanded ? tViewer("stopRotation") : "3D"}
                        </Button>
                      )}

                      {/* Download with format selection */}
                      {job.status === "completed" && job.output_url && (
                        <DownloadMenu
                          url={proxyUrl(job.output_url)}
                          outputType={job.output_type ?? "image"}
                        />
                      )}

                      {(job.status === "pending" || job.status === "processing") && (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
                      )}
                    </div>
                  </div>

                  {/* Inline 3D Model Viewer — expands below the job row */}
                  {is3dExpanded && job.output_url && (
                    <div className="rounded-b-lg border border-t-0 bg-black/5 p-2">
                      <ModelViewer
                        url={proxyUrl(job.output_url)}
                        className="h-[350px] w-full"
                        autoRotate={true}
                      />
                    </div>
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

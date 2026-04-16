"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Shared job type ────────────────────────────────────────
// Matches the shape returned by GET /api/jobs/status

export interface PolledJob {
  id: string;
  tool: string;
  model_id?: string;
  status: "pending" | "processing" | "completed" | "failed";
  credit_cost: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  output_id: string | null;
  output_url: string | null;
  output_type: "glb" | "image" | "video" | null;
  /** Source image used as input — for thumbnail when output is non-renderable (e.g. .glb) */
  source_image: string | null;
}

// ─── Context ────────────────────────────────────────────────

interface JobPollingContextValue {
  jobs: PolledJob[];
  loading: boolean;
  /** Force an immediate re-fetch (e.g. after submitting a new job). */
  refetch: () => void;
}

const JobPollingContext = createContext<JobPollingContextValue | null>(null);

/** How often we poll when there are active (pending / processing) jobs. */
const POLL_INTERVAL_MS = 2500;

// ─── Provider ───────────────────────────────────────────────
// Wrap your page with this so every child can read shared job
// data via `useJobPolling()` — no duplicate network requests.

export function JobPollingProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<PolledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchJobs = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/jobs/status", { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Silently fail — will retry on next poll
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Immediate refetch when a new job is submitted (Workspace / BatchUpload).
  useEffect(() => {
    const handle = () => fetchJobs();
    window.addEventListener("job-submitted", handle);
    return () => window.removeEventListener("job-submitted", handle);
  }, [fetchJobs]);

  // Pause polling when tab is hidden to save bandwidth/battery
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchJobs(); // Refetch immediately when tab becomes visible
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchJobs]);

  // Auto-poll while there are active jobs (only when tab is visible)
  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "pending" || j.status === "processing"
    );
    if (!hasActive) return;

    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchJobs();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [jobs, fetchJobs]);

  return (
    <JobPollingContext.Provider value={{ jobs, loading, refetch: fetchJobs }}>
      {children}
    </JobPollingContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────

/**
 * Access the centralized job polling data.
 * Must be used inside a `<JobPollingProvider>`.
 */
export function useJobPolling(): JobPollingContextValue {
  const ctx = useContext(JobPollingContext);
  if (!ctx) {
    throw new Error("useJobPolling must be used within a <JobPollingProvider>");
  }
  return ctx;
}

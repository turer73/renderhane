"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  output_type: "glb" | "image" | "video" | "audio" | null;
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

/** Poll every 2.5s while the newest active job is young, when results usually land. */
const FAST_POLL_MS = 2500;
const FAST_POLL_FOR_MS = 10 * 60 * 1000;
/** Long renders are checked every 30s. */
const SLOW_POLL_MS = 30_000;
/**
 * Jobs still pending after 2h are stuck (the stuck-jobs cron only runs daily),
 * so they stop driving polls. Returning to the tab or submitting still refetches.
 */
const STOP_POLL_AFTER_MS = 2 * 60 * 60 * 1000;

/** Delay until the next poll, or null when no job is worth polling for. */
export function nextPollDelay(jobs: PolledJob[], now: number): number | null {
  let youngest = Infinity;
  for (const job of jobs) {
    if (job.status !== "pending" && job.status !== "processing") continue;
    const created = Date.parse(job.created_at);
    // Unparseable timestamps count as new rather than silently stopping polls.
    const age = Number.isNaN(created) ? 0 : Math.max(0, now - created);
    youngest = Math.min(youngest, age);
  }
  if (youngest === Infinity || youngest >= STOP_POLL_AFTER_MS) return null;
  return youngest < FAST_POLL_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS;
}

function sameJobs(a: PolledJob[], b: PolledJob[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((job, i) => {
    const other = b[i];
    return (Object.keys(job) as (keyof PolledJob)[]).every((key) => job[key] === other[key]);
  });
}

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
        const next: PolledJob[] = data.jobs ?? [];
        // Polls usually return the same list; keeping the old array avoids
        // re-rendering every consumer (the whole workspace) every 2.5s.
        setJobs((prev) => (sameJobs(prev, next) ? prev : next));
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

  // Auto-poll while there are active jobs (only when tab is visible). The delay
  // is recomputed each tick because unchanged polls keep the same jobs array.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = nextPollDelay(jobs, Date.now());
      if (delay === null) return;
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") fetchJobs();
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [jobs, fetchJobs]);

  const value = useMemo(() => ({ jobs, loading, refetch: fetchJobs }), [jobs, loading, fetchJobs]);

  return (
    <JobPollingContext.Provider value={value}>
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

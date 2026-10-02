"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box, ExternalLink, FlaskConical, Loader2, Play, RotateCcw, Search, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageInputErrorDialog } from "@/components/media/image-input-error-dialog";
import { LAB_CATALOG, buildLabInput, type LabModel } from "@/lib/admin/model-lab-catalog";
import { labResponseErrorKey, LocalizedLabError } from "@/lib/admin/model-lab-errors";
import {
  LAB_POLL_MS,
  labPhase,
  mergeLabRuns,
  pollBackoffMs,
  removeLabRun,
  runsDueForPoll,
  runsWithExpiringLinks,
  type LabPollState,
  type LabRunDto,
} from "@/lib/admin/model-lab-flow";
import { clearLabRun, readLabRun, type LabRun } from "@/lib/admin/model-lab-session";
import { discardLabInput, resignLabUploads, signedUploadPath, uploadLabInput } from "@/lib/admin/model-lab-uploads";
import { getImageInputLimits, IMAGE_FORMATS, type ImageInputLimits } from "@/lib/media/image-input-contract";
import type { ImageInputIssue } from "@/lib/media/image-limit-check";
import { createClient } from "@/lib/supabase/client";
import { LabImageField } from "./model-lab/lab-image-field";
import { formatLabBytes } from "./model-lab/lab-output";
import { LabProgress } from "./model-lab/lab-progress";
import { LabResults, type LabRunActions } from "./model-lab/lab-results";

const SELECT_CLASS = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const JSON_HEADERS = { "Content-Type": "application/json" };
const LINK_REFRESH_TICK_MS = 60_000;
const LINK_REFRESH_THROTTLE_MS = 30_000;
const MAX_KEEP_PATHS = 16;
const subscribeToHydration = () => () => {};
type Translate = ReturnType<typeof useTranslations>;

/** Defer browser-only state (history polling, legacy import) until hydration. */
export function ModelLabPanel({ userId }: { userId: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const t = useTranslations("modelLab");
  return hydrated ? <LabWorkbench key={userId} userId={userId} /> : <p role="status">{t("loading")}</p>;
}

function isIssue(value: unknown): value is ImageInputIssue {
  if (!value || typeof value !== "object") return false;
  const issue = value as Record<string, unknown>;
  return typeof issue.code === "string" && typeof issue.message === "string" &&
    (issue.field === undefined || typeof issue.field === "string");
}

/** Localized lines for a model's image limits (the issues themselves stay Turkish, per the shared contract). */
export function labLimitsText(limits: ImageInputLimits, locale: string, t: Translate): string[] {
  const formats = new Intl.ListFormat(locale, { type: "disjunction" }).format(limits.formats.map((format) => IMAGE_FORMATS[format].label));
  let line = t("image.limits", { formats, size: formatLabBytes(limits.maxBytes, locale) });
  if (limits.maxDimension !== null) line += ` · ${t("image.dimensions", { min: limits.minDimension, max: limits.maxDimension })}`;
  return !limits.verification.formats || !limits.verification.size ? [line, t("image.unverified")] : [line];
}

function fieldLabel(t: Translate, key: string, fallback: string) {
  return t.has(`fields.${key}`) ? t(`fields.${key}`) : fallback;
}

/** History lives on the server: load it, keep unsettled runs polled and signed links fresh. */
function useLabHistory(t: Translate) {
  const [runs, setRuns] = useState<LabRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [paused, setPaused] = useState<ReadonlySet<string>>(() => new Set());
  const runsRef = useRef(runs);
  const pollState = useRef<Record<string, LabPollState>>({});
  const lastRefresh = useRef<Record<string, number>>({});
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const merge = useCallback((incoming: LabRunDto[]) => setRuns((current) => mergeLabRuns(current, incoming)), []);
  const remove = useCallback((id: string) => {
    delete pollState.current[id];
    setRuns((current) => removeLabRun(current, id));
  }, []);
  const setPausedFor = useCallback((id: string, on: boolean) => {
    setPaused((current) => {
      if (current.has(id) === on) return current;
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const load = useCallback(async (before: string | null) => {
    try {
      const response = await fetch(`/api/admin/models/runs${before ? `?before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !Array.isArray(data.runs)) {
        throw new LocalizedLabError(t(response.status === 403 || response.status === 429 ? labResponseErrorKey(response.status, "status") : "historyError"));
      }
      setRuns((current) => mergeLabRuns(current, data.runs as LabRunDto[]));
      setNextBefore(typeof data.nextBefore === "string" ? data.nextBefore : null);
      if (typeof data.retentionDays === "number") setRetentionDays(data.retentionDays);
      setError("");
    } catch (cause) {
      setError(cause instanceof LocalizedLabError ? cause.message : t("historyError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(null);
  }, [load]);

  const reload = useCallback((before: string | null) => {
    setLoading(true);
    void load(before);
  }, [load]);

  /** One status read for a run; never submits. Errors back off and keep tracking. */
  const poll = useCallback(async (run: Pick<LabRunDto, "id">, extra: Record<string, unknown> = {}) => {
    const failed = () => {
      const failures = (pollState.current[run.id]?.failures ?? 0) + 1;
      pollState.current[run.id] = { failures, nextAt: Date.now() + pollBackoffMs(failures) };
      if (failures >= 2) setPausedFor(run.id, true);
    };
    try {
      const response = await fetch("/api/admin/models/test/status", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ runId: run.id, ...extra }) });
      if (response.status === 404) {
        remove(run.id);
        return;
      }
      const data = await response.json().catch(() => null);
      if (data?.run) merge([data.run as LabRunDto]);
      if (!response.ok) return failed();
      delete pollState.current[run.id];
      setPausedFor(run.id, false);
    } catch {
      failed();
    }
  }, [merge, remove, setPausedFor]);

  useEffect(() => {
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight) return;
      const due = runsDueForPoll(runsRef.current, Date.now(), pollState.current);
      if (due.length === 0) return;
      inFlight = true;
      void Promise.all(due.map((run) => poll(run))).finally(() => {
        inFlight = false;
      });
    }, LAB_POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  /** Fresh signed links for one run (a preview failed or links are about to expire). */
  const refresh = useCallback(async (id: string, force = false) => {
    const now = Date.now();
    if (!force && now - (lastRefresh.current[id] ?? 0) < LINK_REFRESH_THROTTLE_MS) return;
    lastRefresh.current[id] = now;
    try {
      const response = await fetch(`/api/admin/models/runs/${id}`, { cache: "no-store" });
      if (response.status === 404) return remove(id);
      const data = await response.json().catch(() => null);
      if (response.ok && data?.run) merge([data.run as LabRunDto]);
    } catch {
      // The next tick or preview error tries again.
    }
  }, [merge, remove]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const run of runsWithExpiringLinks(runsRef.current, Date.now()).slice(0, 4)) void refresh(run.id);
    }, LINK_REFRESH_TICK_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const pollNow = useCallback(async (run: LabRunDto, extra?: Record<string, unknown>) => {
    delete pollState.current[run.id];
    await poll(run, extra);
  }, [poll]);

  return { runs, loading, error, nextBefore, retentionDays, paused, merge, remove, reload, refresh, pollNow };
}

type LegacyNotice = { kind: "imported" } | { kind: "expired"; requestId: string };

/** The lab itself; `initialModelKey` preselects a model (the panel starts with Meshy). */
export function LabWorkbench({ userId, initialModelKey = "meshy-v71" }: { userId: string; initialModelKey?: string }) {
  const t = useTranslations("modelLab");
  const locale = useLocale();
  const history = useLabHistory(t);
  const { merge: mergeRuns, refresh: refreshRun, remove: removeRun } = history;

  const [selected, setSelected] = useState(initialModelKey);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [busyFields, setBusyFields] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<ImageInputIssue[] | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [step, setStep] = useState<"idle" | "validating" | "submitting">("idle");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [resendable, setResendable] = useState(false);
  const [busyRuns, setBusyRuns] = useState<ReadonlySet<string>>(() => new Set());
  const [actionError, setActionError] = useState("");
  const [legacy, setLegacy] = useState<LabRun | null>(() => readLabRun(userId));
  const [legacyNotice, setLegacyNotice] = useState<LegacyNotice | null>(null);
  /** One id per browser attempt: resending after a lost response finds the same run, never a second charge. */
  const attemptRef = useRef<{ id: string; fingerprint: string } | null>(null);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);

  const model: LabModel = LAB_CATALOG.find((entry) => entry.key === selected) ?? LAB_CATALOG[0];
  const limits = useMemo(() => getImageInputLimits(model.key), [model.key]);
  const limitsText = useMemo(() => labLimitsText(limits, locale, t), [limits, locale, t]);
  const filtered = LAB_CATALOG.filter((entry) =>
    (category === "all" || entry.category === category) &&
    (status === "all" || entry.status === status) &&
    (entry.name + " " + entry.key + " " + entry.endpoint).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale).trim())
  );
  const uploading = Object.values(busyFields).some(Boolean);
  const currentRun = history.runs.find((run) => run.id === currentRunId) ?? null;
  const phase = labPhase({ uploading, validating: step === "validating", submitting: step === "submitting", run: currentRun });
  const unknownRun = history.runs.some((run) => run.status === "unknown");
  const locked = step !== "idle";

  const storageClient = useCallback(() => (clientRef.current ??= createClient()), []);
  const upload = useCallback(async (file: File) => uploadLabInput(storageClient(), userId, file), [storageClient, userId]);

  // A run tracked only in this browser before server history: import it once through its signed receipt.
  useEffect(() => {
    if (!legacy?.receipt) return;
    const controller = new AbortController();
    fetch("/api/admin/models/test/status", {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ receipt: legacy.receipt }), signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (response.ok && data?.run) {
        mergeRuns([data.run as LabRunDto]);
        clearLabRun(userId);
        setLegacy(null);
        setLegacyNotice({ kind: "imported" });
      } else if (response.status === 403) {
        setLegacyNotice({ kind: "expired", requestId: legacy.requestId ?? "—" });
      }
      // Anything else (rate limit, outage): keep it and try on the next visit.
    }).catch(() => undefined);
    return () => controller.abort();
  }, [legacy, mergeRuns, userId]);

  function dismissLegacy() {
    clearLabRun(userId);
    setLegacy(null);
    setLegacyNotice(null);
  }

  const setFieldValue = useCallback((key: string, value: string) => {
    setValues((old) => ((old[key] ?? "") === value ? old : { ...old, [key]: value }));
    setFieldErrors((old) => {
      if (!(key in old)) return old;
      const next = { ...old };
      delete next[key];
      return next;
    });
    setConsent(false);
  }, []);

  const setFieldBusy = useCallback((key: string, busy: boolean) => {
    setBusyFields((old) => (Boolean(old[key]) === busy ? old : { ...old, [key]: busy }));
  }, []);

  function pick(key: string) {
    if (locked || key === model.key) return;
    // Image fields remount for the new model: in-flight preparation is cancelled and unused uploads are dropped.
    setSelected(key);
    setValues({});
    setBusyFields({});
    setConsent(false);
    setFieldErrors({});
    setFormError("");
    setNotice("");
    setResendable(false);
    attemptRef.current = null;
  }

  function showServerIssues(raw: unknown) {
    const list = Array.isArray(raw) ? raw.filter(isIssue) : [];
    if (list.length === 0) {
      setFormError(t("invalidRequest"));
      return;
    }
    setIssues(list);
    const byField: Record<string, string> = {};
    for (const issue of list) {
      if (issue.field) byField[issue.field] = byField[issue.field] ? `${byField[issue.field]} ${issue.message}` : issue.message;
    }
    setFieldErrors(byField);
  }

  /** Lab uploads in the open form; deleting an old run must not delete them. */
  function formUploadPaths(): string[] {
    const prefix = `${userId}/model-lab/inputs/`;
    const paths = Object.values(values)
      .flatMap((value) => value.split(/\r?\n/))
      .flatMap((url) => signedUploadPath(url.trim(), process.env.NEXT_PUBLIC_SUPABASE_URL) ?? [])
      .filter((path) => path.startsWith(prefix));
    return [...new Set(paths)].slice(0, MAX_KEEP_PATHS);
  }

  async function submit() {
    if (locked || uploading || unknownRun || !consent) return;
    const missing = model.fields.filter((field) => field.required && !(values[field.key] ?? "").trim());
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missing.map((field) => [field.key, t("required")])));
      return;
    }
    try {
      buildLabInput(model.key, values);
    } catch {
      setFormError(t("invalidRequest"));
      return;
    }
    setStep("validating");
    setFormError("");
    setNotice("");
    setFieldErrors({});
    try {
      // Links signed an hour ago may have expired: sign every own upload again first.
      const resigned = await resignLabUploads(storageClient(), values, process.env.NEXT_PUBLIC_SUPABASE_URL);
      if (!resigned) {
        setFormError(t("validationFailed"));
        return;
      }
      if (resigned.missing.length > 0) {
        setFieldErrors(Object.fromEntries(resigned.missing.map((key) => [key, t("image.missing")])));
        return;
      }
      const sent = resigned.values;

      // Validating: real bytes against the model's limits, without any provider spend.
      let checked: Response;
      try {
        checked = await fetch("/api/admin/models/preflight", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ modelKey: model.key, values: sent }) });
      } catch {
        setFormError(t("validationFailed"));
        return;
      }
      if (checked.status === 422) {
        showServerIssues((await checked.json().catch(() => null))?.issues);
        return;
      }
      if (!checked.ok) {
        setFormError(checked.status >= 500 ? t("validationFailed") : t(labResponseErrorKey(checked.status, "submit")));
        return;
      }

      setStep("submitting");
      const fingerprint = JSON.stringify([model.key, values]);
      if (attemptRef.current?.fingerprint !== fingerprint) attemptRef.current = { id: crypto.randomUUID(), fingerprint };
      const attempt = attemptRef.current;
      let response: Response;
      try {
        response = await fetch("/api/admin/models/test", {
          method: "POST", headers: JSON_HEADERS,
          body: JSON.stringify({ modelKey: model.key, values: sent, confirmProviderSpend: true, clientRequestId: attempt.id }),
        });
      } catch {
        // It is unknown whether the server got it; the same attempt id makes a resend safe.
        setResendable(true);
        setFormError(t("networkRetry"));
        history.reload(null);
        return;
      }
      const data = await response.json().catch(() => null);
      const run = data?.run as LabRunDto | undefined;
      if (run) {
        mergeRuns([run]);
        setCurrentRunId(run.id);
      }
      if (run || (response.status >= 400 && response.status < 500) || response.status === 503) {
        // A recorded run, or a request refused before anything was recorded or sent: the attempt is settled.
        attemptRef.current = null;
        setResendable(false);
      } else {
        setResendable(true);
      }
      if (response.status === 422) {
        showServerIssues(data?.issues);
      } else if (run && response.ok) {
        setConsent(false);
        if (data?.duplicate) setNotice(t("duplicateRun"));
      } else if (run || data?.submissionUncertain) {
        setConsent(false);
        setFormError(t("uncertain"));
      } else if (response.status === 503 && data?.code === "history_unavailable") {
        setFormError(t("storageAbort"));
      } else {
        setFormError(t(labResponseErrorKey(response.status, "submit")));
      }
    } finally {
      setStep("idle");
    }
  }

  const withRunBusy = useCallback(async (id: string, action: () => Promise<void>) => {
    setBusyRuns((current) => new Set(current).add(id));
    setActionError("");
    try {
      await action();
    } finally {
      setBusyRuns((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const failAction = useCallback(async (run: LabRunDto, response: Response) => {
    if (response.status === 404) return removeRun(run.id);
    if (response.status === 409) {
      await refreshRun(run.id, true);
      setActionError(t("runConflict"));
      return;
    }
    setActionError(response.status === 403 || response.status === 429 ? t(labResponseErrorKey(response.status, "status")) : t("actionFailed"));
  }, [refreshRun, removeRun, t]);

  const actions: LabRunActions = {
    onDelete: (run) => {
      if (!window.confirm(t("deleteConfirm"))) return;
      const keep = formUploadPaths().map((path) => `keep=${encodeURIComponent(path)}`).join("&");
      void withRunBusy(run.id, async () => {
        try {
          const response = await fetch(`/api/admin/models/runs/${run.id}${keep ? `?${keep}` : ""}`, { method: "DELETE" });
          if (response.ok) removeRun(run.id);
          else await failAction(run, response);
        } catch {
          setActionError(t("actionFailed"));
        }
      });
    },
    onResolve: (run) => {
      if (!window.confirm(t("historyConfirm"))) return;
      void withRunBusy(run.id, async () => {
        try {
          const response = await fetch(`/api/admin/models/runs/${run.id}/resolve`, { method: "POST" });
          const data = await response.json().catch(() => null);
          if (response.ok && data?.run) mergeRuns([data.run as LabRunDto]);
          else await failAction(run, response);
        } catch {
          setActionError(t("actionFailed"));
        }
      });
    },
    onRetryStorage: (run) => void withRunBusy(run.id, () => history.pollNow(run, { retryStorage: true })),
    onPollNow: (run) => void withRunBusy(run.id, () => history.pollNow(run)),
    onRefreshLinks: (run) => void refreshRun(run.id),
  };

  const buttonLabel = step === "validating" ? t("validating") : step === "submitting" ? t("submitting")
    : uploading ? t("waitForUploads") : resendable ? t("retrySame") : t("run");

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="outline" className="gap-1.5"><ShieldCheck className="size-3.5" /> {t("adminOnly")}</Badge>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FlaskConical className="size-6 text-primary" /> {t("title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="rounded-xl border bg-card px-5 py-3 text-right"><strong className="text-2xl tabular-nums">{LAB_CATALOG.length}</strong><p className="text-xs text-muted-foreground">{t("registeredModels")}</p></div>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div><p className="font-medium">{t("spendTitle")}</p><p className="mt-1 text-muted-foreground">{t("spendDescription")}</p></div>
      </div>

      {(legacyNotice || (legacy && !legacy.receipt)) && (
        <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 text-sm">
          <p className="min-w-0 flex-1 break-words">
            {legacyNotice?.kind === "imported" ? t("legacyImported")
              : legacyNotice?.kind === "expired" ? t("legacyExpired", { requestId: legacyNotice.requestId })
                : t("legacyUncertain")}
          </p>
          <Button type="button" variant="ghost" className="min-h-11 gap-1.5" onClick={dismissLegacy}><X className="size-4" />{t("dismiss")}</Button>
        </div>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)]">
        <section aria-label={t("catalog")} className="min-w-0 rounded-xl border bg-card">
          <div className="space-y-3 border-b p-4">
            <Label htmlFor="lab-search">{t("search")}</Label>
            <div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input id="lab-search" placeholder={t("searchPlaceholder")} className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label={t("category")} className={SELECT_CLASS} value={category} onChange={(event) => setCategory(event.target.value)}>{["all", "3d", "image", "video", "audio", "avatar", "tools"].map((key) => <option value={key} key={key}>{t(`categories.${key}`)}</option>)}</select>
              <select aria-label={t("recordStatus")} className={SELECT_CLASS} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("allRecords")}</option>{["active", "lab", "legacy"].map((key) => <option value={key} key={key}>{t(`statuses.${key}`)}</option>)}</select>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">{t("shown", { shown: filtered.length, total: LAB_CATALOG.length })}</p>
          </div>
          <div className="max-h-[380px] space-y-1 overflow-y-auto p-2 lg:max-h-[640px]">
            {filtered.map((entry) => <button type="button" key={entry.key} disabled={locked} onClick={() => pick(entry.key)} aria-pressed={entry.key === model.key} className={"w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 " + (entry.key === model.key ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted")}>
              <span className="block break-words text-sm font-medium">{entry.name}</span>
              <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{t(`categories.${entry.category}`)}</span><span>· {t(`statuses.${entry.status}`)}</span></span>
            </button>)}
            {filtered.length === 0 && <p className="p-5 text-sm text-muted-foreground">{t("noMatch")}</p>}
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <section aria-label={t("settings")} className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6">
            <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Box className="size-5 text-primary" /><h2 className="text-xl font-semibold">{model.name}</h2><Badge variant="secondary">{t(`statuses.${model.status}`)}</Badge></div><p className="break-all font-mono text-xs text-muted-foreground">{model.endpoint}</p></div>
            {model.status !== "active" && <p className="rounded-lg bg-muted p-3 text-sm">{t(model.status === "legacy" ? "legacyNote" : "labNote")}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm"><span>{t.rich("adminCredits", { strong: (chunks) => <strong>{chunks}</strong> })}</span><a href={model.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-primary underline underline-offset-4">{t("providerPrice")} <ExternalLink className="size-3.5" /></a></div>
            <p className="text-xs text-muted-foreground">{t("priceNote")}</p>
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-5" noValidate>
              {model.fields.map((field) => {
                const label = fieldLabel(t, field.key, field.label);
                const fieldError = fieldErrors[field.key] ?? null;
                if (field.media === "image" && field.kind !== "text") {
                  return (
                    <LabImageField
                      key={model.key + ":" + field.key}
                      id={"lab-" + field.key}
                      label={label}
                      required={field.required}
                      multiple={field.kind === "urls"}
                      limits={limits}
                      limitsText={limitsText}
                      error={fieldError}
                      disabled={locked}
                      upload={upload}
                      discard={discardLabInput}
                      onChange={(value) => setFieldValue(field.key, value)}
                      onBusyChange={(busy) => setFieldBusy(field.key, busy)}
                      onIssues={(found) => {
                        setIssues(found);
                        setFieldErrors((old) => ({ ...old, [field.key]: found.map((issue) => issue.message).join(" ") }));
                      }}
                    />
                  );
                }
                const common = {
                  id: "lab-" + field.key,
                  required: field.required,
                  disabled: locked,
                  "aria-invalid": fieldError ? true : undefined,
                  "aria-describedby": fieldError ? `lab-${field.key}-error` : undefined,
                  value: values[field.key] ?? "",
                };
                return (
                  <div className="space-y-2" key={model.key + ":" + field.key}>
                    <Label htmlFor={"lab-" + field.key}>{label}{field.required ? " *" : ` ${t("optional")}`}</Label>
                    {field.kind === "text"
                      ? <Textarea {...common} maxLength={5000} placeholder={t("textPlaceholder")} className="min-h-28" onChange={(event) => setFieldValue(field.key, event.target.value)} />
                      : <Input {...common} type="url" inputMode="url" maxLength={4096} placeholder="https://…" className="h-11" onChange={(event) => setFieldValue(field.key, event.target.value)} />}
                    {fieldError && <p id={`lab-${field.key}-error`} role="alert" className="break-words text-sm text-destructive">{fieldError}</p>}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">{t("sourceNote")}</p>
              <details className="rounded-lg border p-3"><summary className="min-h-7 cursor-pointer text-sm">{t("defaults")}</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(model.defaults, null, 2)}</pre></details>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} disabled={locked} onChange={(event) => setConsent(event.target.checked)} /><span>{t("consent")}</span></label>
              {unknownRun && <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">{t("unknownBlocked")}</p>}
              {formError && <p role="alert" className="break-words text-sm text-destructive">{formError}</p>}
              {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
              <Button type="submit" className="h-auto min-h-11 w-full gap-2 whitespace-normal" disabled={!consent || locked || uploading || unknownRun}>
                {locked || uploading ? <Loader2 className="size-4 animate-spin" /> : resendable ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
                {buttonLabel}
              </Button>
            </form>
          </section>
          <LabProgress phase={phase} />
        </div>
      </div>

      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      <LabResults
        runs={history.runs}
        loading={history.loading}
        error={history.error}
        hasMore={history.nextBefore !== null}
        retentionDays={history.retentionDays}
        paused={history.paused}
        busy={busyRuns}
        actions={actions}
        onRetry={() => history.reload(null)}
        onLoadMore={() => history.reload(history.nextBefore)}
      />
      <ImageInputErrorDialog issues={issues} onClose={() => setIssues(null)} />
    </div>
  );
}

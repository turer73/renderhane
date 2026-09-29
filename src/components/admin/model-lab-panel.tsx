"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Box, ExternalLink, FlaskConical, Loader2, Play, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { LAB_CATALOG, buildLabInput } from "@/lib/admin/model-lab-catalog";
import { readLabRun, saveLabRun, type LabRun } from "@/lib/admin/model-lab-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLocale, useTranslations } from "next-intl";

const SELECT_CLASS = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const subscribeToHydration = () => () => {};

/** Defer browser-local recovery until hydration; no prompt or source URL is stored. */
export function ModelLabPanel({ userId }: { userId: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const t = useTranslations("modelLab");
  return hydrated ? <LabWorkbench key={userId} userId={userId} /> : <p role="status">{t("loading")}</p>;
}

function LabWorkbench({ userId }: { userId: string }) {
  const t = useTranslations("modelLab");
  const locale = useLocale();
  const [run, setRun] = useState<LabRun | null>(() => readLabRun(userId));
  const [selected, setSelected] = useState(() => readLabRun(userId)?.modelKey ?? "meshy-v71");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const submitLock = useRef(false);
  const model = LAB_CATALOG.find((entry) => entry.key === selected) ?? LAB_CATALOG[0];
  const filtered = LAB_CATALOG.filter((entry) =>
    (category === "all" || entry.category === category) &&
    (status === "all" || entry.status === status) &&
    (entry.name + " " + entry.key + " " + entry.endpoint).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale).trim())
  );
  const pending = run?.status === "IN_QUEUE" || run?.status === "IN_PROGRESS";
  const blocked = submitting || pending || run?.status === "UNKNOWN";

  function remember(next: LabRun) {
    setRun(next);
    setStorageError(!saveLabRun(userId, next));
  }

  useEffect(() => {
    if (!pending || !run?.receipt) return;
    const activeRun = run;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    async function poll() {
      try {
        const response = await fetch("/api/admin/models/test/status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receipt: activeRun.receipt }), signal: controller.signal,
        });
        const data = await response.json();
        if (disposed) return;
        if (!response.ok) throw new Error(data.error || t("statusReadError"));
        if (!["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"].includes(data.status)) throw new Error(t("unknownProviderStatus"));
        const next: LabRun = { ...activeRun, status: data.status, outputs: data.outputs ?? [], error: data.error };
        setRun(next);
        setStorageError(!saveLabRun(userId, next));
        setPollError("");
        if (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") timer = setTimeout(poll, 5000);
      } catch (cause) {
        if (!disposed) setPollError(cause instanceof Error ? cause.message : t("statusReadError"));
      }
    }
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
    // Only receipt identity and an explicit resume start a polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.receipt, pending, userId, pollVersion]);

  function pick(key: string) {
    setSelected(key); setValues({}); setConsent(false); setError("");
  }

  async function submit() {
    if (submitLock.current || blocked || !consent) return;
    try { buildLabInput(model.key, values); }
    catch (cause) { setError(t("invalidFields") + (cause instanceof Error ? " " + t("technicalDetail", { detail: cause.message }) : "")); return; }
    submitLock.current = true;
    setSubmitting(true); setError(""); setPollError(""); setConsent(false);
    // Save before sending: closing a tab or losing the acknowledgement must
    // never silently become a second paid submission on reload.
    const attempt: LabRun = { modelKey: model.key, startedAt: Date.now(), status: "UNKNOWN" };
    if (!saveLabRun(userId, attempt)) {
      setStorageError(true);
      setError(t("storageAbort"));
      submitLock.current = false;
      setSubmitting(false);
      return;
    }
    setRun(attempt);
    setStorageError(false);
    try {
      const response = await fetch("/api/admin/models/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelKey: model.key, values, confirmProviderSpend: true }),
      });
      const data = await response.json();
      if (typeof data.receipt === "string" && typeof data.requestId === "string") {
        remember({ ...attempt, receipt: data.receipt, requestId: data.requestId, status: "IN_QUEUE" });
        return;
      }
      if (!response.ok) {
        if (data.submissionUncertain || response.status >= 500 && response.status !== 503) throw new Error(data.error || t("uncertain"));
        remember({ ...attempt, status: "FAILED", error: data.error || t("requestRejected") });
        return;
      }
      throw new Error(t("missingReceipt"));
    } catch (cause) {
      remember({ ...attempt, error: cause instanceof Error ? cause.message : t("uncertain") });
    } finally { submitLock.current = false; setSubmitting(false); }
  }

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

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)]">
        <section aria-label={t("catalog")} className="min-w-0 rounded-xl border bg-card">
          <div className="space-y-3 border-b p-4">
            <Label htmlFor="lab-search">{t("search")}</Label>
            <div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input id="lab-search" placeholder={t("searchPlaceholder")} className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label={t("category")} className={SELECT_CLASS} value={category} onChange={(event) => setCategory(event.target.value)}>{["all","3d","image","video","audio","avatar","tools"].map((key) => <option value={key} key={key}>{t(`categories.${key}`)}</option>)}</select>
              <select aria-label={t("recordStatus")} className={SELECT_CLASS} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("allRecords")}</option>{["active","lab","legacy"].map((key) => <option value={key} key={key}>{t(`statuses.${key}`)}</option>)}</select>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">{t("shown", { shown: filtered.length, total: LAB_CATALOG.length })}</p>
          </div>
          <div className="max-h-[380px] space-y-1 overflow-y-auto p-2 lg:max-h-[640px]">
            {filtered.map((entry) => <button type="button" key={entry.key} onClick={() => pick(entry.key)} aria-pressed={entry.key === model.key} className={"w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (entry.key === model.key ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted")}>
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
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
              {model.fields.map((field) => <div className="space-y-2" key={model.key + ":" + field.key}><Label htmlFor={"lab-" + field.key}>{t.has(`fields.${field.key}`) ? t(`fields.${field.key}`) : field.label}{field.required ? " *" : ` ${t("optional")}`}</Label>
                {field.kind === "url" ? <Input id={"lab-" + field.key} type="url" required={field.required} maxLength={4096} placeholder="https://…" className="h-11" value={values[field.key] ?? ""} onChange={(event) => { setValues((old) => ({ ...old, [field.key]: event.target.value })); setConsent(false); }} /> : <Textarea id={"lab-" + field.key} required={field.required} maxLength={field.kind === "text" ? 5000 : 16384} placeholder={t(field.kind === "urls" ? "urlsPlaceholder" : "textPlaceholder")} className="min-h-28" value={values[field.key] ?? ""} onChange={(event) => { setValues((old) => ({ ...old, [field.key]: event.target.value })); setConsent(false); }} />}
              </div>)}
              <p className="text-xs text-muted-foreground">{t("sourceNote")}</p>
              <details className="rounded-lg border p-3"><summary className="min-h-7 cursor-pointer text-sm">{t("defaults")}</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(model.defaults, null, 2)}</pre></details>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t("consent")}</span></label>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="min-h-11 w-full gap-2" disabled={!consent || blocked}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}{submitting ? t("submitting") : pending ? t("pending") : t("run")}</Button>
            </form>
          </section>

          <section aria-label={t("lastRun")} className="min-w-0 space-y-3 rounded-xl border bg-card p-4 sm:p-6">
            <h2 className="font-semibold">{t("lastRun")}</h2>
            {!run ? <p className="text-sm text-muted-foreground">{t("noRun")}</p> : <>
              <p className="break-words text-sm font-medium">{LAB_CATALOG.find((entry) => entry.key === run.modelKey)?.name ?? run.modelKey}</p>
              <p role="status" className="text-sm">{submitting ? t("submittingStatus") : t(`runStatuses.${run.status}`)}</p>
              {run.requestId && <p className="break-all font-mono text-xs text-muted-foreground">{t("request", { requestId: run.requestId })}</p>}
              {run.error && <p role="alert" className="break-words text-sm text-destructive">{t("technicalDetail", { detail: run.error })}</p>}
              {pollError && <div className="space-y-2 rounded-lg border border-amber-500/30 p-3">
                <p role="alert" className="text-sm">{t("pollPaused", { error: pollError })}</p>
                <Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => { setPollError(""); setPollVersion((value) => value + 1); }}>{t("resume")}</Button>
                <Button variant="ghost" className="h-auto min-h-11 whitespace-normal" onClick={() => { if (window.confirm(t("stopConfirm"))) { setPollError(""); remember({ ...run, status: "UNKNOWN", error: t("trackingStopped") }); } }}>{t("stopTracking")}</Button>
              </div>}
              {run.status === "UNKNOWN" && !submitting && <div className="space-y-2 text-sm">
                <p>{t("unknownWarning")}</p>
                <Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => { if (window.confirm(t("historyConfirm"))) remember({ ...run, status: "FAILED", error: t("historyChecked") }); }}>{t("checkHistory")}</Button>
              </div>}
              {run.outputs?.map((output, index) => <div key={output.url + ":" + index} className="space-y-2">
                {output.kind === "image" &&
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={output.url} alt={t("outputAlt", { model: run.modelKey, index: index + 1 })} className="max-h-80 w-full rounded-lg object-contain" />}
                {output.kind === "video" && <video src={output.url} controls preload="metadata" className="max-h-80 w-full rounded-lg" />}
                {output.kind === "audio" && <audio src={output.url} controls preload="metadata" className="w-full" />}
                <a href={output.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline">{t("openOutput", { kind: output.kind })} <ExternalLink className="size-3.5" /></a>
              </div>)}
              {run.status === "COMPLETED" && !run.outputs?.length && <p className="text-sm text-muted-foreground">{t("noOutput")}</p>}
            </>}
              {storageError && run?.requestId && <p role="alert" className="text-sm text-destructive">{t("storageFailed")}</p>}
            <p className="border-t pt-3 text-xs text-muted-foreground">{t("footer")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

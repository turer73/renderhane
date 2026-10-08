"use client";

import { ExternalLink, History, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labRunErrorKey } from "@/lib/admin/model-lab-errors";
import { isActiveRun, isDeletableRun, type LabRunDto, type LabRunStatus } from "@/lib/admin/model-lab-flow";
import { isHttpsUrl, LabOutput } from "./lab-output";

const BADGE: Record<LabRunStatus, string> = {
  submitting: "border-primary/40 text-primary",
  queued: "border-primary/40 text-primary",
  running: "border-primary/40 text-primary",
  completed: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  failed: "border-destructive/50 text-destructive",
  unknown: "border-amber-500/60 text-amber-800 dark:text-amber-300",
};
const WRAP_BUTTON = "h-auto min-h-11 whitespace-normal text-left";

export interface LabRunActions {
  onDelete: (run: LabRunDto) => void;
  onResolve: (run: LabRunDto) => void;
  onRetryStorage: (run: LabRunDto) => void;
  onPollNow: (run: LabRunDto) => void;
  /** Fresh signed links for a run whose stored links failed to load. */
  onRefreshLinks: (run: LabRunDto) => void;
}

function fieldLabel(t: ReturnType<typeof useTranslations>, key: string) {
  return t.has(`fields.${key}`) ? t(`fields.${key}`) : key;
}

function RunInputs({ run }: { run: LabRunDto }) {
  const t = useTranslations("modelLab");
  if (run.inputs.length === 0) return null;
  return (
    <details className="rounded-lg border p-3">
      <summary className="min-h-7 cursor-pointer text-sm">{t("inputs")}</summary>
      <dl className="mt-3 space-y-2 text-sm">
        {run.inputs.map((input, index) => (
          <div key={`${input.key}:${index}`} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{fieldLabel(t, input.key)}</dt>
            <dd className="min-w-0">
              {input.kind === "text" && <p className="line-clamp-4 whitespace-pre-wrap break-words">{input.value}</p>}
              {input.kind === "upload" && (input.url && isHttpsUrl(input.url)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={input.url} alt={t("inputAlt", { field: fieldLabel(t, input.key) })} className="mt-1 h-20 w-20 rounded-md border bg-muted/40 object-contain" />
                : <span className="text-muted-foreground">—</span>)}
              {input.kind === "url" && input.url && isHttpsUrl(input.url) && (
                <a href={input.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-1.5 break-all text-primary underline underline-offset-4">
                  {new URL(input.url).host}
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                </a>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function RunCard({ run, paused, busy, actions }: { run: LabRunDto; paused: boolean; busy: boolean; actions: LabRunActions }) {
  const t = useTranslations("modelLab");
  const locale = useLocale();
  const errorKey = labRunErrorKey(run.errorCode);
  const started = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.createdAt));
  const temporary = run.outputs.some((output) => !output.stored);
  return (
    <article aria-labelledby={`lab-run-${run.id}`} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 id={`lab-run-${run.id}`} className="break-words font-medium">{run.modelName}</h3>
          <p className="text-xs text-muted-foreground"><time dateTime={run.createdAt}>{started}</time></p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {run.requestId ? t("request", { requestId: run.requestId }) : t("requestPending")}
          </p>
        </div>
        <Badge variant="outline" className={`gap-1.5 ${BADGE[run.status]}`}>
          {(isActiveRun(run.status) || run.status === "submitting") && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {t(`runStatuses.${run.status}`)}
        </Badge>
      </header>

      {errorKey && <p role="alert" className="break-words text-sm text-destructive">{t(errorKey)}</p>}

      {run.status === "unknown" && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />{t("unknownWarning")}</p>
          <Button type="button" variant="outline" className={WRAP_BUTTON} disabled={busy} onClick={() => actions.onResolve(run)}>{t("checkHistory")}</Button>
        </div>
      )}

      {paused && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 p-3 text-sm">
          <p role="status">{t("pollPaused")}</p>
          <Button type="button" variant="outline" className={`${WRAP_BUTTON} gap-2`} disabled={busy} onClick={() => actions.onPollNow(run)}>
            <RefreshCw className="size-4 shrink-0" aria-hidden />{t("resume")}
          </Button>
        </div>
      )}

      {run.status === "completed" && run.storage === "pending" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("storagePending")}</p>
      )}
      {run.status === "completed" && (run.storage === "failed" || run.storage === "partial") && temporary && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 p-3 text-sm">
          <p>{t(run.storage === "failed" ? "storageFailedNote" : "storagePartialNote")}</p>
          <Button type="button" variant="outline" className={WRAP_BUTTON} disabled={busy} onClick={() => actions.onRetryStorage(run)}>{t("retryStorage")}</Button>
        </div>
      )}

      {run.outputs.length > 0 && (
        <section aria-label={t("outputs")} className="grid min-w-0 gap-3 sm:grid-cols-2">
          {run.outputs.map((output, index) => (
            <LabOutput key={`${index}:${output.url}`} output={output} index={index} modelName={run.modelName} onExpired={() => actions.onRefreshLinks(run)} />
          ))}
        </section>
      )}
      {run.status === "completed" && run.outputs.length === 0 && <p className="text-sm text-muted-foreground">{t("noOutput")}</p>}

      <RunInputs run={run} />

      {isDeletableRun(run.status) && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" className="min-h-11 gap-2 text-muted-foreground" disabled={busy} onClick={() => actions.onDelete(run)}>
            <Trash2 className="size-4" aria-hidden />{t("deleteRun")}
          </Button>
        </div>
      )}
    </article>
  );
}

/** Server-side run history for this admin, newest first; earlier runs are never overwritten. */
export function LabResults({
  runs,
  loading,
  error,
  hasMore,
  retentionDays,
  paused,
  busy,
  actions,
  onRetry,
  onLoadMore,
}: {
  runs: readonly LabRunDto[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  retentionDays: number;
  /** Runs whose polling is backing off after errors. */
  paused: ReadonlySet<string>;
  /** Runs with an action in flight. */
  busy: ReadonlySet<string>;
  actions: LabRunActions;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const t = useTranslations("modelLab");
  return (
    <section aria-labelledby="lab-results-title" className="min-w-0 space-y-4 rounded-xl border bg-card/50 p-4 sm:p-6">
      <div className="space-y-1">
        <h2 id="lab-results-title" className="flex items-center gap-2 text-lg font-semibold"><History className="size-5 text-primary" aria-hidden />{t("results")}</h2>
        <p className="text-sm text-muted-foreground">{t("resultsDescription")}</p>
      </div>
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-3 text-sm">
          <span className="text-destructive">{error}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>{t("retry")}</Button>
        </div>
      )}
      {loading && runs.length === 0 && <p role="status" className="text-sm text-muted-foreground">{t("historyLoading")}</p>}
      {!loading && !error && runs.length === 0 && <p className="text-sm text-muted-foreground">{t("resultsEmpty")}</p>}
      <div className="space-y-4">
        {runs.map((run) => <RunCard key={run.id} run={run} paused={paused.has(run.id)} busy={busy.has(run.id)} actions={actions} />)}
      </div>
      {hasMore && (
        <Button type="button" variant="outline" className="min-h-11 w-full" disabled={loading} onClick={onLoadMore}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("loadMore")}
        </Button>
      )}
      <p className="border-t pt-3 text-xs text-muted-foreground">{t("retentionNote", { days: retentionDays })}</p>
    </section>
  );
}

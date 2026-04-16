"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HeartPulse,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface CheckResult {
  ok: boolean;
  detail?: string;
}

interface DiagnosticsResponse {
  status: "healthy" | "ISSUES_FOUND";
  timestamp: string;
  checks: Record<string, CheckResult>;
}

export function HealthCheckPanel() {
  const t = useTranslations("admin");

  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/diagnostics");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json: DiagnosticsResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const isHealthy = data?.status === "healthy";
  const checks = data?.checks ? Object.entries(data.checks) : [];

  // Group checks by category
  const envChecks = checks.filter(([k]) => k.startsWith("env:"));
  const supabaseChecks = checks.filter(([k]) => k.startsWith("supabase:"));
  const falChecks = checks.filter(([k]) => k.startsWith("fal:"));
  const webhookChecks = checks.filter(([k]) => k.startsWith("webhook:"));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-500/10">
              <HeartPulse className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("healthCheck")}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("healthCheckDesc")}
              </p>
            </div>
          </div>
          <Button
            onClick={runCheck}
            disabled={loading}
            size="sm"
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("checking")}
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                {t("runCheck")}
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <XCircle className="size-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!data && !error && !loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("healthCheckIdle")}
          </p>
        )}

        {data && (
          <div className="space-y-4">
            {/* Overall status */}
            <div className={`flex items-center gap-2 rounded-lg p-3 ${
              isHealthy
                ? "border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
            }`}>
              {isHealthy ? (
                <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="size-5 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-sm font-semibold ${
                isHealthy
                  ? "text-green-700 dark:text-green-300"
                  : "text-red-700 dark:text-red-300"
              }`}>
                {isHealthy ? t("allHealthy") : t("issuesFound")}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(data.timestamp).toLocaleTimeString("tr-TR")}
              </span>
            </div>

            {/* Check groups */}
            {envChecks.length > 0 && (
              <CheckGroup title={t("envVars")} checks={envChecks} />
            )}
            {supabaseChecks.length > 0 && (
              <CheckGroup title="Supabase" checks={supabaseChecks} />
            )}
            {falChecks.length > 0 && (
              <CheckGroup title="fal.ai" checks={falChecks} />
            )}
            {webhookChecks.length > 0 && (
              <CheckGroup title="Webhook" checks={webhookChecks} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CheckGroup({
  title,
  checks,
}: {
  title: string;
  checks: [string, CheckResult][];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1.5">
        {checks.map(([key, result]) => {
          // Clean up key for display: "env:FAL_KEY" → "FAL_KEY"
          const displayKey = key.includes(":") ? key.split(":").slice(1).join(":") : key;

          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              {result.ok ? (
                <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="size-3.5 text-red-500 shrink-0" />
              )}
              <span className="text-sm font-mono">{displayKey}</span>
              {result.detail && (
                <Badge
                  variant={result.ok ? "outline" : "destructive"}
                  className="ml-auto text-xs shrink-0"
                >
                  {result.detail}
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

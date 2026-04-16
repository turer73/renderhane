"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface EndpointCheck {
  modelKey: string;
  endpoint: string;
  displayName: string;
  status: "active" | "error" | "unknown";
  responseTimeMs?: number;
  error?: string;
}

interface NewModelFound {
  name: string;
  endpoint: string;
  category: string;
  source: string;
}

interface ScanAlert {
  type: "endpoint_down" | "new_model" | "version_upgrade" | "price_change";
  severity: "critical" | "warning" | "info";
  endpoint: string;
  message: string;
  detail?: string;
}

interface ScanRow {
  id: string;
  scanned_at: string;
  total_models_checked: number;
  active_count: number;
  error_count: number;
  new_models_found: number;
  endpoint_checks: EndpointCheck[];
  new_models: NewModelFound[];
  alerts: ScanAlert[];
  reviewed: boolean;
}

export function FalScannerPanel() {
  const t = useTranslations("admin");

  const [latestScan, setLatestScan] = useState<ScanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fal-scanner?limit=1");
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setLatestScan(data.scans?.[0] ?? null);
    } catch {
      // Silent — panel shows "no scan yet"
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  async function handleRunScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/admin/fal-scanner", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Scan failed");
      }
      toast.success(t("scanSuccess"));
      await fetchLatest();
    } catch (err) {
      toast.error(
        t("scanError") + (err instanceof Error ? `: ${err.message}` : "")
      );
    } finally {
      setScanning(false);
    }
  }

  function severityColor(severity: string) {
    switch (severity) {
      case "critical":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "outline";
    }
  }

  function severityIcon(severity: string) {
    switch (severity) {
      case "critical":
        return <XCircle className="size-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="size-4 text-amber-500" />;
      default:
        return <Info className="size-4 text-blue-500" />;
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + Scan Button */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-50 p-2.5 dark:bg-violet-500/10">
                <Radar className="size-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-lg">{t("scanner")}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("scannerDesc")}
                </p>
              </div>
            </div>
            <Button
              onClick={handleRunScan}
              disabled={scanning}
              size="sm"
              className="gap-2"
            >
              {scanning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("scanning")}
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" />
                  {t("runScan")}
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {!latestScan ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("noScanYet")}
            </p>
          </CardContent>
        ) : (
          <CardContent className="space-y-4">
            {/* Last scan time */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              {t("lastScan")}: {formatDate(latestScan.scanned_at)}
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat
                label={t("modelsChecked")}
                value={latestScan.total_models_checked}
                color="slate"
              />
              <MiniStat
                label={t("activeModels")}
                value={latestScan.active_count}
                color="green"
              />
              <MiniStat
                label={t("errorModels")}
                value={latestScan.error_count}
                color={latestScan.error_count > 0 ? "red" : "green"}
              />
              <MiniStat
                label={t("newModelsFound")}
                value={latestScan.new_models_found}
                color={latestScan.new_models_found > 0 ? "violet" : "slate"}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Alerts */}
      {latestScan && latestScan.alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" />
              {t("alerts")} ({latestScan.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {latestScan.alerts.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  {severityIcon(alert.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={severityColor(alert.severity)} className="text-xs">
                        {t(alert.severity)}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {alert.endpoint}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{alert.message}</p>
                    {alert.detail && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {alert.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {latestScan && latestScan.alerts.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="size-5 text-green-500" />
            <p className="text-sm text-muted-foreground">{t("noAlerts")}</p>
          </CardContent>
        </Card>
      )}

      {/* Endpoint Checks Detail */}
      {latestScan && latestScan.endpoint_checks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("endpointStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-6">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">{t("endpoint")}</th>
                    <th className="px-3 py-2 font-medium text-center">
                      Status
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      {t("responseTime")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latestScan.endpoint_checks.map((check) => (
                    <tr
                      key={check.modelKey}
                      className="border-b border-border/40 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-6 py-2 font-medium">
                        {check.displayName}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {check.endpoint}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {check.status === "active" ? (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
                          >
                            <CheckCircle2 className="mr-1 size-3" />
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="size-3" />
                            Hata
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {check.responseTimeMs != null
                          ? `${check.responseTimeMs}ms`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Model Discoveries */}
      {latestScan && latestScan.new_models.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-violet-500" />
              {t("newDiscoveries")} ({latestScan.new_models.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {latestScan.new_models.map((model, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Sparkles className="size-4 text-violet-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {model.endpoint}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {model.category}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Compact stat box */
function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "red" | "violet" | "slate";
}) {
  const colors = {
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    violet: "text-violet-600 dark:text-violet-400",
    slate: "text-foreground",
  };

  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Code2,
  Zap,
  AlertTriangle,
  Loader2,
  Shield,
} from "lucide-react";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export default function SettingsPage() {
  const t = useTranslations("settings");

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing keys
  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch("/api/v1/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create key");
        return;
      }
      setNewRawKey(data.key);
      setNewKeyName("");
      fetchKeys();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm(t("revokeConfirm"))) return;
    try {
      await fetch("/api/v1/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      fetchKeys();
    } catch {
      // silent
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const activeKeys = keys.filter((k) => k.is_active);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      {/* API Keys Section */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Key className="size-5 text-indigo-500" />
              {t("apiKeys")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("apiKeysDesc")}
            </p>
          </div>
          {!showCreate && !newRawKey && activeKeys.length < 5 && (
            <Button
              onClick={() => setShowCreate(true)}
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 shrink-0"
            >
              <Plus className="size-4" />
              {t("createKey")}
            </Button>
          )}
        </div>

        {/* New Key Created — one-time display */}
        {newRawKey && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-600 dark:bg-amber-500/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 space-y-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {t("keyCreated")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white px-4 py-3 font-mono text-sm break-all border dark:bg-background">
                    {showKey ? newRawKey : newRawKey.slice(0, 11) + "•".repeat(20)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    className="shrink-0"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(newRawKey)}
                    className="gap-2 shrink-0"
                  >
                    {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                    {copied ? t("copied") : t("copyKey")}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewRawKey(null);
                    setShowKey(false);
                    setShowCreate(false);
                  }}
                  className="text-xs"
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Create Key Form */}
        {showCreate && !newRawKey && (
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium">{t("keyName")}</label>
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t("keyNamePlaceholder")}
                  className="mt-1.5"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newKeyName.trim() || creating}
                className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {creating && <Loader2 className="size-4 animate-spin" />}
                {t("create")}
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                {t("cancel")}
              </Button>
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}

        {/* Keys List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
            <Key className="mx-auto mb-3 size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("noKeys")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                  key.is_active
                    ? "border-border/60 bg-card"
                    : "border-border/30 bg-muted/30 opacity-60"
                }`}
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                  <Key className="size-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge
                      variant={key.is_active ? "default" : "secondary"}
                      className={`text-[10px] ${
                        key.is_active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : ""
                      }`}
                    >
                      {key.is_active ? t("active") : t("revoked")}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                      {key.key_prefix}...
                    </code>
                    <span>
                      {t("createdAt")}: {formatDate(key.created_at)}
                    </span>
                    <span>
                      {t("lastUsed")}:{" "}
                      {key.last_used_at ? formatDate(key.last_used_at) : t("never")}
                    </span>
                  </div>
                </div>
                {key.is_active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(key.id)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {activeKeys.length >= 5 && (
          <p className="text-xs text-muted-foreground">{t("maxKeys")}</p>
        )}
      </div>

      {/* API Documentation Quick Reference */}
      <div className="rounded-xl border border-border/60 bg-card p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Code2 className="size-5 text-indigo-500" />
          {t("docsTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("docsDesc")}</p>

        {/* Code example */}
        <div className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-200">
          <pre className="font-mono">
{`curl -H "Authorization: Bearer rh_your_key_here" \\
  https://www.renderhane.com/api/v1/balance`}
          </pre>
        </div>

        {/* Endpoints */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold">{t("docsEndpoints")}</h4>
          <div className="mt-2 space-y-2">
            {[
              { method: "GET", path: "/api/v1/balance", desc: t("docsBalance") },
              { method: "POST", path: "/api/v1/jobs", desc: t("docsJobs") },
              { method: "GET", path: "/api/v1/jobs/:id", desc: t("docsJobStatus") },
            ].map((ep) => (
              <div key={ep.path} className="flex items-center gap-3 text-sm">
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] ${
                    ep.method === "GET"
                      ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                      : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                  }`}
                >
                  {ep.method}
                </Badge>
                <code className="font-mono text-xs text-muted-foreground">{ep.path}</code>
                <span className="text-xs text-muted-foreground">— {ep.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
          <Shield className="size-3.5 shrink-0" />
          {t("rateLimitInfo")}
        </div>
      </div>
    </div>
  );
}

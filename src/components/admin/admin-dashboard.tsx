"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Briefcase,
  Coins,
  Activity,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  creditBalance: number;
  referralCode: string;
  referralCount: number;
  unlimitedBgRemove: boolean;
  createdAt: string;
  jobCount: number;
}

interface Stats {
  totalUsers: number;
  totalJobs: number;
  creditsSpent: number;
  activeUsers7d: number;
}

export function AdminDashboard() {
  const t = useTranslations("admin");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editCreditBalance, setEditCreditBalance] = useState("");
  const [editUnlimitedBg, setEditUnlimitedBg] = useState(false);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setUsers(data.users);
      setTotal(data.total);
      if (data.stats) setStats(data.stats);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleSearch() {
    setPage(1);
    setSearch(searchInput);
  }

  function openEditDialog(u: UserRow) {
    setEditUser(u);
    setEditDisplayName(u.displayName);
    setEditCreditBalance(String(u.creditBalance));
    setEditUnlimitedBg(u.unlimitedBgRemove);
  }

  async function handleSave() {
    if (!editUser) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName,
          creditBalance: Number(editCreditBalance),
          unlimitedBgRemove: editUnlimitedBg,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      toast.success(t("saved"));
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(t("saveError") + (err instanceof Error ? `: ${err.message}` : ""));
    } finally {
      setSaving(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label={t("totalUsers")}
            value={stats.totalUsers}
          />
          <StatCard
            icon={Briefcase}
            label={t("totalJobs")}
            value={stats.totalJobs}
          />
          <StatCard
            icon={Coins}
            label={t("creditsSpent")}
            value={stats.creditsSpent}
          />
          <StatCard
            icon={Activity}
            label={t("activeUsers7d")}
            value={stats.activeUsers7d}
          />
        </div>
      )}

      {/* Users Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">{t("users")}</CardTitle>
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  className="pl-9 h-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={handleSearch}>
                {t("users")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("noUsers")}
            </p>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto -mx-6">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-6 py-2 font-medium">{t("email")}</th>
                      <th className="px-3 py-2 font-medium">{t("displayName")}</th>
                      <th className="px-3 py-2 font-medium text-right">{t("creditBalance")}</th>
                      <th className="px-3 py-2 font-medium">{t("referralCode")}</th>
                      <th className="px-3 py-2 font-medium text-right">{t("referralCount")}</th>
                      <th className="px-3 py-2 font-medium text-right">{t("jobCount")}</th>
                      <th className="px-3 py-2 font-medium">{t("createdAt")}</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-border/40 hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-6 py-2.5 font-medium">{u.email}</td>
                        <td className="px-3 py-2.5">
                          {u.displayName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Badge
                            variant={u.creditBalance > 0 ? "default" : "secondary"}
                            className="font-mono"
                          >
                            {u.creditBalance}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {u.referralCode || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">{u.referralCount}</td>
                        <td className="px-3 py-2.5 text-right">{u.jobCount}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5"
                            onClick={() => openEditDialog(u)}
                          >
                            <Pencil className="size-3" />
                            {t("edit")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t("page", { current: page, total: totalPages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="size-4" />
                      {t("previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("next")}
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editUser")}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 pt-2">
              {/* Email (read-only) */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t("email")}
                </label>
                <p className="mt-1 text-sm font-medium">{editUser.email}</p>
              </div>

              {/* Display Name */}
              <div>
                <label className="text-sm font-medium" htmlFor="edit-name">
                  {t("displayName")}
                </label>
                <Input
                  id="edit-name"
                  className="mt-1"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
              </div>

              {/* Credit Balance */}
              <div>
                <label className="text-sm font-medium" htmlFor="edit-credits">
                  {t("creditBalance")}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="edit-credits"
                    type="number"
                    min={0}
                    className="font-mono"
                    value={editCreditBalance}
                    onChange={(e) => setEditCreditBalance(e.target.value)}
                  />
                  {Number(editCreditBalance) !== editUser.creditBalance && (
                    <Badge
                      variant={
                        Number(editCreditBalance) > editUser.creditBalance
                          ? "default"
                          : "destructive"
                      }
                      className="shrink-0"
                    >
                      {Number(editCreditBalance) - editUser.creditBalance > 0 ? "+" : ""}
                      {Number(editCreditBalance) - editUser.creditBalance}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Unlimited BG Remove */}
              <div>
                <label className="text-sm font-medium">
                  {t("unlimitedBgRemove")}
                </label>
                <div className="mt-1">
                  <Button
                    type="button"
                    variant={editUnlimitedBg ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditUnlimitedBg(!editUnlimitedBg)}
                    className={
                      editUnlimitedBg
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : ""
                    }
                  >
                    {editUnlimitedBg ? "✓ Aktif" : "Pasif"}
                  </Button>
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditUser(null)}
                  disabled={saving}
                >
                  İptal
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t("saving")}
                    </>
                  ) : (
                    t("save")
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Small stat card component */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-lg bg-indigo-50 p-2.5 dark:bg-indigo-500/10">
          <Icon className="size-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">
            {value.toLocaleString("tr-TR")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Gift,
  Copy,
  Check,
  Send,
  Users,
  Sparkles,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

interface Referral {
  id: string;
  referee_email: string | null;
  status: string;
  referrer_reward: number;
  created_at: string;
  completed_at: string | null;
}

interface ReferralInfo {
  referralCode: string;
  referralLink: string;
  referralCount: number;
  maxReferrals: number;
  totalCreditsEarned: number;
  unlimitedBgRemove: boolean;
  freeBgRemoveToday: number;
  referrals: Referral[];
}

export function ReferralCard() {
  const t = useTranslations("referral");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/referral");
      if (res.ok) {
        setInfo(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  async function handleCopy() {
    if (!info) return;
    await navigator.clipboard.writeText(info.referralLink);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleInvite() {
    if (!email.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/referral/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), locale }),
      });

      if (res.ok) {
        toast.success(t("inviteSent"));
        setEmail("");
        fetchInfo();
      } else {
        const data = await res.json();
        const errorKey =
          data.error === "already_invited"
            ? "errorAlreadyInvited"
            : data.error === "invalid_email"
              ? "errorInvalidEmail"
              : data.error === "max_referrals_reached"
                ? "errorMaxReached"
                : data.error === "cannot_invite_self"
                  ? "errorSelf"
                  : "errorInvalidEmail";
        toast.error(t(errorKey));
      }
    } catch {
      toast.error(t("errorInvalidEmail"));
    } finally {
      setSending(false);
    }
  }

  if (loading) return null;
  if (!info) return null;

  const progressPercent = (info.referralCount / info.maxReferrals) * 100;

  return (
    <Card className="border-indigo-200/50 dark:border-indigo-500/20 shadow-lg shadow-indigo-100/20 dark:shadow-indigo-900/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="size-5 text-indigo-500" />
            {t("title")}
          </CardTitle>
          {info.unlimitedBgRemove && (
            <Badge
              variant="secondary"
              className="bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
            >
              <Sparkles className="mr-1 size-3" />
              {t("unlimitedBgRemove")}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Free BG-Remove Status */}
        <div className="rounded-lg bg-indigo-50/50 p-3 dark:bg-indigo-500/5">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {info.unlimitedBgRemove
              ? t("dailyFreeUnlimited")
              : info.freeBgRemoveToday > 0
                ? t("dailyFree", { remaining: info.freeBgRemoveToday })
                : t("unlockUnlimited")}
          </p>
        </div>

        {/* Referral Link */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            {t("yourLink")}
          </label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={info.referralLink}
              className="text-xs font-mono"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="size-4 text-green-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Email Invite */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            <Mail className="mr-1 inline size-3.5" />
            {t("inviteByEmail")}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <Button
              onClick={handleInvite}
              disabled={sending || !email.trim()}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 h-11 sm:h-9"
            >
              {sending ? (
                t("sending")
              ) : (
                <>
                  <Send className="mr-1 size-4" />
                  {t("sendInvite")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="size-3.5" />
              {t("progress", {
                count: info.referralCount,
                max: info.maxReferrals,
              })}
            </span>
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              {t("creditsEarned", { total: info.totalCreditsEarned })}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground">{t("reward")}</p>
        </div>

        {/* Invite History */}
        {info.referrals.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {info.referrals.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate text-muted-foreground">
                  {ref.referee_email || "—"}
                </span>
                <Badge
                  variant={
                    ref.status === "completed" ? "default" : "secondary"
                  }
                  className={
                    ref.status === "completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                      : ""
                  }
                >
                  {ref.status === "completed"
                    ? t("statusCompleted")
                    : t("statusPending")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

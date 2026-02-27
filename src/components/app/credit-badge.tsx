"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function CreditBadge() {
  const tCredits = useTranslations("credits");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";

  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await fetch("/api/credits/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance ?? 0);
        }
      } catch {
        // Silently fail — badge shows nothing until loaded
      }
    }
    fetchBalance();
  }, []);

  if (balance === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 border-0 dark:bg-indigo-500/10 dark:text-indigo-300">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12" />
          <path d="M15.5 9.4a3 3 0 0 0-2.8-1.9H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-.7a3 3 0 0 1-2.8-1.9" />
        </svg>
        <span className="font-medium">{balance}</span>
        <span className="text-muted-foreground">{tCredits("balance")}</span>
      </Badge>
      <Link
        href={`/${locale}/app/credits`}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {tCredits("buy")}
      </Link>
    </div>
  );
}

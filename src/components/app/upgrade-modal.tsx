"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Sparkles, Crown } from "lucide-react";

const PACKAGES = [
  {
    key: "monthly",
    credits: 50,
    price: 99,
    icon: Zap,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-800",
    popular: false,
  },
  {
    key: "starter",
    credits: 100,
    price: 199,
    icon: Zap,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-800",
    popular: false,
  },
  {
    key: "standard",
    credits: 300,
    price: 499,
    icon: Sparkles,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
    border: "border-indigo-300 dark:border-indigo-700",
    popular: true,
  },
  {
    key: "pro",
    credits: 800,
    price: 999,
    icon: Crown,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-500/10",
    border: "border-purple-200 dark:border-purple-800",
    popular: false,
  },
];

/**
 * Global upgrade modal that opens when a user runs out of credits.
 * Triggered via: window.dispatchEvent(new CustomEvent("show-upgrade"))
 */
export function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  useEffect(() => {
    function handleShow() {
      setOpen(true);
    }
    window.addEventListener("show-upgrade", handleShow);
    return () => window.removeEventListener("show-upgrade", handleShow);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {tr ? "Krediniz Yetersiz" : "Insufficient Credits"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {tr
              ? "İşleminizi tamamlamak için kredi satın alın"
              : "Purchase credits to complete your task"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            const perCredit = (pkg.price / pkg.credits).toFixed(2);
            return (
              <Link
                key={pkg.key}
                href={`/${locale}/app?buy=${pkg.key}`}
                onClick={() => setOpen(false)}
                className={`relative flex items-center gap-4 rounded-xl border-2 p-4 transition-all hover:shadow-md ${pkg.border} ${pkg.bg}`}
              >
                {pkg.popular && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                    {tr ? "Popüler" : "Popular"}
                  </span>
                )}
                <div className={`flex size-10 items-center justify-center rounded-lg ${pkg.bg}`}>
                  <Icon className={`size-5 ${pkg.color}`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">
                    {pkg.credits} {tr ? "Kredi" : "Credits"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ₺{perCredit} / {tr ? "kredi" : "credit"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">₺{pkg.price}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <Button
          variant="ghost"
          className="w-full text-sm text-muted-foreground"
          onClick={() => setOpen(false)}
        >
          {tr ? "Şimdi değil" : "Not now"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

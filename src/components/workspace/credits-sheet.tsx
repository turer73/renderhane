"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Coins, Check, Loader2, Sparkles } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import type { PackageKey } from "@/lib/payments/iyzico";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACKAGE_KEYS: PackageKey[] = ["monthly", "starter", "standard", "pro"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditsSheet({ open, onOpenChange }: CreditsSheetProps) {
  const t = useTranslations("credits");
  const tp = useTranslations("landing.pricing");

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingPackage, setLoadingPackage] = useState<PackageKey | null>(null);

  // Fetch balance only when the sheet opens
  useEffect(() => {
    if (!open) return;

    async function fetchBalance() {
      try {
        const res = await fetch("/api/credits/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance);
        }
      } catch {
        // Silently fail — balance will show as loading
      }
    }
    fetchBalance();
  }, [open]);

  async function handleBuy(packageKey: PackageKey) {
    setLoadingPackage(packageKey);

    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey }),
      });

      if (!res.ok) {
        throw new Error("Checkout failed");
      }

      const data = await res.json();

      if (data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
      } else {
        throw new Error("No payment page URL");
      }
    } catch {
      toast.error(t("purchaseError"));
      setLoadingPackage(null);
    }
  }

  function getFeatures(key: PackageKey): string[] {
    const features: string[] = [];
    features.push(tp(`${key}.feature1`));
    features.push(tp(`${key}.feature2`));
    features.push(tp(`${key}.feature3`));
    if (key === "pro") {
      const f4 = tp(`${key}.feature4`);
      if (f4) features.push(f4);
    }
    return features;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            {t("purchaseTitle")}
          </SheetTitle>
          <SheetDescription>{t("purchaseSubtitle")}</SheetDescription>
        </SheetHeader>

        {/* Current balance */}
        <div className="px-4">
          <Card className="border-indigo-200/50 bg-indigo-50/30 dark:border-indigo-500/20 dark:bg-indigo-500/5">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <Coins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("currentBalance")}
                </p>
                <p className="text-xl font-bold">
                  {balance !== null ? balance : "--"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="px-4">
          <Separator />
        </div>

        {/* Pricing cards — vertical stack for narrow sheet */}
        <div className="flex flex-col gap-4 px-4 pb-6">
          {PACKAGE_KEYS.map((key) => {
            const isPopular = key === "standard";

            return (
              <Card
                key={key}
                className={`relative flex flex-col transition-all ${
                  isPopular
                    ? "border-indigo-500 shadow-lg shadow-indigo-100/50 ring-1 ring-indigo-500/20 dark:shadow-indigo-900/20"
                    : "border-border/50 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-700"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      {tp("mostPopular")}
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center">
                  <CardTitle className="text-lg">
                    {tp(`${key}.name`)}
                  </CardTitle>
                  <CardDescription>{tp(`${key}.description`)}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  {/* Price */}
                  <div className="text-center">
                    <span className="text-3xl font-bold">
                      {tp(`${key}.price`)}
                    </span>
                  </div>

                  {/* Credits */}
                  <div className="text-center">
                    <Badge variant="secondary" className="text-sm">
                      {tp(`${key}.credits`)}
                    </Badge>
                  </div>

                  <Separator />

                  {/* Features */}
                  <ul className="space-y-2">
                    {getFeatures(key).map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    className={`w-full ${isPopular ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}`}
                    size="lg"
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleBuy(key)}
                    disabled={loadingPackage !== null}
                  >
                    {loadingPackage === key ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("processing")}
                      </>
                    ) : (
                      tp("buyNow")
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

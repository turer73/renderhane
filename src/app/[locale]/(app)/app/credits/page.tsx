"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Coins, Check, Loader2, Sparkles } from "lucide-react";

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

const PACKAGE_KEYS: PackageKey[] = ["starter", "standard", "pro"];

export default function CreditsPage() {
  const t = useTranslations("credits");
  const tp = useTranslations("landing.pricing");
  const searchParams = useSearchParams();

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingPackage, setLoadingPackage] = useState<PackageKey | null>(null);

  // Fetch current balance
  useEffect(() => {
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
  }, []);

  // Show toast based on URL search params
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      toast.success(t("purchaseSuccess"));
      // Refresh balance after successful purchase
      fetch("/api/credits/balance")
        .then((res) => res.json())
        .then((data) => setBalance(data.balance))
        .catch(() => {});
    } else if (status === "error") {
      toast.error(t("purchaseError"));
    }
  }, [searchParams, t]);

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
        // Redirect to iyzico hosted payment page
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
    // Pro has a 4th feature
    if (key === "pro") {
      const f4 = tp(`${key}.feature4`);
      if (f4) features.push(f4);
    }
    return features;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header with balance */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("purchaseTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("purchaseSubtitle")}
          </p>
        </div>
        <Card className="sm:min-w-[200px]">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <Coins className="h-5 w-5 text-yellow-500" />
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

      <Separator />

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PACKAGE_KEYS.map((key) => {
          const isPopular = key === "standard";

          return (
            <Card
              key={key}
              className={`relative flex flex-col ${
                isPopular
                  ? "border-primary shadow-md ring-1 ring-primary/20"
                  : ""
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
                <CardTitle className="text-lg">{tp(`${key}.name`)}</CardTitle>
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
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
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
    </div>
  );
}

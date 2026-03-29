"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "cookie-consent";

export type CookieConsent = "all" | "essential" | null;

export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as CookieConsent;
}

export function CookieBanner() {
  const t = useTranslations("cookieBanner");
  const params = useParams();
  const locale = (params.locale as string) || "tr";
  const [visible, setVisible] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) { setVisible(true); }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function accept(level: "all" | "essential") {
    localStorage.setItem(CONSENT_KEY, level);
    setVisible(false);

    if (level === "all") {
      // Enable GA if consent given
      window.dispatchEvent(new CustomEvent("cookie-consent", { detail: level }));
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 rounded-xl border border-border/50 bg-background/95 px-5 py-4 shadow-lg backdrop-blur-sm sm:flex-row sm:gap-4">
        <p className="flex-1 text-sm text-muted-foreground">
          {t("message")}{" "}
          <Link
            href={`/${locale}/cookie-policy`}
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            {t("learnMore")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => accept("essential")}
          >
            {t("essentialOnly")}
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => accept("all")}
          >
            {t("acceptAll")}
          </Button>
        </div>
      </div>
    </div>
  );
}

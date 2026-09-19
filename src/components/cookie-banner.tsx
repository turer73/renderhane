"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "cookie-consent-v2";
const LEGACY_CONSENT_KEY = "cookie-consent";
export const COOKIE_CONSENT_EVENT = "cookie-consent";
export const OPEN_COOKIE_SETTINGS_EVENT = "open-cookie-settings";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
const PANOLA_SCRIPT_ID = "renderhane-panola-analytics";
const GA_SCRIPT_ID = "renderhane-google-analytics";

export interface CookieConsent {
  essential: true;
  analytics: boolean;
  advertising: boolean;
  version: 2;
}

const ESSENTIAL_ONLY: CookieConsent = {
  essential: true,
  analytics: false,
  advertising: false,
  version: 2,
};

const ACCEPT_ALL: CookieConsent = {
  essential: true,
  analytics: true,
  advertising: true,
  version: 2,
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<CookieConsent>;
      if (
        parsed.version === 2 &&
        typeof parsed.analytics === "boolean" &&
        typeof parsed.advertising === "boolean"
      ) {
        return {
          essential: true,
          analytics: parsed.analytics,
          advertising: parsed.advertising,
          version: 2,
        };
      }
    } catch {
      localStorage.removeItem(CONSENT_KEY);
    }
  }

  const legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
  if (legacy === "all") return ACCEPT_ALL;
  if (legacy === "essential") return ESSENTIAL_ONLY;
  return null;
}

function removeFirstPartyAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name && (name === "_ga" || name === "_gid" || name === "_gat" || name.startsWith("_ga_"))) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
}

function applyConsent(consent: CookieConsent) {
  ensureGtag();
  window.gtag?.("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.advertising ? "granted" : "denied",
    ad_user_data: consent.advertising ? "granted" : "denied",
    ad_personalization: consent.advertising ? "granted" : "denied",
  });

  if (consent.analytics) {
    if (GA_ID && !document.getElementById(GA_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = GA_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      document.head.appendChild(script);
      window.gtag?.("js", new Date());
      window.gtag?.("config", GA_ID);
    }

    if (!document.getElementById(PANOLA_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = PANOLA_SCRIPT_ID;
      script.defer = true;
      script.dataset.domain = "renderhane.com";
      script.src = "https://analytics.panola.app/js/script.js";
      document.head.appendChild(script);
    }
  } else {
    document.getElementById(GA_SCRIPT_ID)?.remove();
    document.getElementById(PANOLA_SCRIPT_ID)?.remove();
    removeFirstPartyAnalyticsCookies();
  }
}

export function CookieBanner() {
  const t = useTranslations("cookieBanner");
  const params = useParams();
  const locale = (params.locale as string) || "tr";
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (consent) {
      setAnalytics(consent.analytics);
      setAdvertising(consent.advertising);
      applyConsent(consent);
    } else {
      setVisible(true);
    }

    const openSettings = () => {
      const current = getCookieConsent() || ESSENTIAL_ONLY;
      setAnalytics(current.analytics);
      setAdvertising(current.advertising);
      setCustomizing(true);
      setVisible(true);
    };

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  function save(consent: CookieConsent) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    setAnalytics(consent.analytics);
    setAdvertising(consent.advertising);
    applyConsent(consent);
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: consent }));
    setVisible(false);
    setCustomizing(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <section
        role="dialog"
        aria-modal="false"
        aria-label={t("title")}
        className="mx-auto max-w-3xl rounded-xl border border-border/50 bg-background/95 px-5 py-4 shadow-lg backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("message")}{" "}
              <Link
                href={`/${locale}/cookie-policy`}
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                {t("learnMore")}
              </Link>
            </p>
          </div>

          {customizing && (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <label className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">{t("essentialTitle")}</span>
                  <span className="block text-xs text-muted-foreground">{t("essentialDescription")}</span>
                </span>
                <input type="checkbox" checked disabled aria-label={t("essentialTitle")} />
              </label>
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">{t("analyticsTitle")}</span>
                  <span className="block text-xs text-muted-foreground">{t("analyticsDescription")}</span>
                </span>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  aria-label={t("analyticsTitle")}
                />
              </label>
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">{t("advertisingTitle")}</span>
                  <span className="block text-xs text-muted-foreground">{t("advertisingDescription")}</span>
                </span>
                <input
                  type="checkbox"
                  checked={advertising}
                  onChange={(event) => setAdvertising(event.target.checked)}
                  aria-label={t("advertisingTitle")}
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => save(ESSENTIAL_ONLY)}>
              {t("essentialOnly")}
            </Button>
            {customizing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  save({ essential: true, analytics, advertising, version: 2 })
                }
              >
                {t("savePreferences")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
                {t("manage")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => save(ACCEPT_ALL)}>
              {t("acceptAll")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

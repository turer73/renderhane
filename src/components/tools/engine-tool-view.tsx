"use client";
/* Uretim arac sayfalarinda V3 motor gorunumu: gercek baslik/altbilgi disinda
 * motorun kendi basligi + calisma alani kullanilir. Baglantilar gercek
 * URL'lere gider; sanatsal sayfa uretimde olmadigindan iletisime yonlenir. */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/launch-preview/core";
import type { Page } from "@/components/launch-preview/tools-engine/core";
import "@/components/launch-preview/tools-engine/styles.css";
import "@/components/launch-preview/launch.css";
import "@/components/launch-preview/tools.css";
import "@/components/launch-preview/preview-dark.css";

const REAL_PATH: Record<Page, string> = {
  home: "",
  background: "araclar/arka-plan-kaldirma",
  scenes: "araclar/sahne-olustur",
  qr: "araclar/qr-kod",
  nfc: "araclar/nfc-yaz",
  artistic: "iletisim",
  tools: "",
};

function realHref(locale: Locale, page: Page): string {
  const rest = REAL_PATH[page];
  return rest ? `/${locale}/${rest}` : `/${locale}`;
}

export function EngineToolView({
  locale,
  page,
  enableBackgroundApi = false,
  label,
}: {
  locale: Locale;
  page: Page;
  enableBackgroundApi?: boolean;
  label: string;
}) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void (async () => {
      const { mountRenderhane } = await import(
        "@/components/launch-preview/tools-engine/core"
      );
      const { createRenderhaneAdapter } = await import(
        "@/components/launch-preview/tools-engine/api-adapter"
      );
      if (cancelled || !host.current) return;
      dispose = mountRenderhane(host.current, {
        initialPage: page,
        chrome: false,
        preview: false,
        assetBase: "/launch-preview/tools",
        adapters: enableBackgroundApi ? createRenderhaneAdapter() : undefined,
        pageHref: (p) => realHref(locale, p),
        onNavigate: (p) => router.push(realHref(locale, p)),
        onAnchor: (id) => {
          document.getElementById(id)?.scrollIntoView({ block: "start" });
        },
      });
    })().catch(() => {
      /* mount hatasi: sayfa alt bolumleri calismaya devam eder */
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [page, locale, router, enableBackgroundApi]);
  return <div ref={host} aria-label={label} />;
}

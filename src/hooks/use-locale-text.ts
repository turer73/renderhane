"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";

/** Picks the Turkish or English copy for the current locale. */
export type LocaleText = (tr: string, en: string) => string;

/**
 * Inline TR/EN copy for dashboard components whose strings live next to the
 * markup. Use `l("Kaydet", "Save")`; Turkish stays the default for any locale
 * other than English.
 */
export function useLocaleText(): LocaleText {
  const locale = useLocale();
  return useCallback((tr: string, en: string) => (locale === "en" ? en : tr), [locale]);
}

/** Same choice outside React (toasts fired from callbacks, module helpers). */
export function pickLocaleText(locale: string | undefined, tr: string, en: string): string {
  return locale === "en" ? en : tr;
}

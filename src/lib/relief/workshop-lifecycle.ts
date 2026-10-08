/**
 * The legacy workshop is archived, not deleted. This code-level gate is shared
 * by UI and API; existing RELIEF_WORKSHOP_ENABLED credentials permit reads only.
 * Reopening writes requires a reviewed code change, not a browser/env override.
 */
export function isWorkshopReadOnly(): boolean {
  return true;
}

export function workshopNavigationLabel(locale: string): string {
  if (isWorkshopReadOnly()) return locale === "tr" ? "Relief Pro Arşivi" : "Relief Pro Archive";
  return locale === "tr" ? "Relief Pro Atölyesi" : "Relief Pro Workshop";
}

export const WORKSHOP_READ_ONLY_MESSAGE = "Eski Rölyef Atölyesi devre dışı. Yeni revizyon oluşturma ve tekrar deneme kapalı; kayıtlı sonuçları inceleyebilir ve mevcut dosyaları indirebilirsiniz.";

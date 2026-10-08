import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReliefWorkshop, workshopErrorMessage } from "@/components/relief/relief-workshop";
import { isWorkshopReadOnly, workshopNavigationLabel, WORKSHOP_READ_ONLY_MESSAGE } from "../workshop-lifecycle";

describe("archived workshop initial UI", () => {
  it("uses the real read-only gate and hides mutation controls", () => {
    expect(isWorkshopReadOnly()).toBe(true);

    const html = renderToStaticMarkup(createElement(ReliefWorkshop, { configured: true }));

    expect(html).toContain("Relief Pro Arşivi");
    expect(html).toContain(WORKSHOP_READ_ONLY_MESSAGE);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Revizyon oluştur ve doğrula");
    expect(html).not.toContain("Aynı revizyonu tekrar dene");
  });

  it("does not say that there are no records when the archive connection is unavailable", () => {
    const html = renderToStaticMarkup(createElement(ReliefWorkshop, { configured: false }));

    expect(html).toContain("Arşiv bağlantısı yapılandırılmadığı için kayıtlar şu anda yüklenemiyor");
    expect(html).toContain("Kayıtlar yüklenemedi.");
    expect(html).not.toContain("Henüz revizyon yok.");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="file"');
  });

  it("uses explicit Turkish and English archive navigation labels", () => {
    expect(workshopNavigationLabel("tr")).toBe("Relief Pro Arşivi");
    expect(workshopNavigationLabel("en")).toBe("Relief Pro Archive");
  });

  it("does not ask an archive reader to submit or retry after a legacy error", () => {
    for (const code of ["engine_changed_create_revision", "retry_unavailable"]) {
      expect(workshopErrorMessage(code)).toContain("tekrar deneme kapalıdır");
      expect(workshopErrorMessage(code)).not.toContain("oluşturun");
    }
  });
});

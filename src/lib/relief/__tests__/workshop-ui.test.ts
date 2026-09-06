import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReliefWorkshop, readWorkshopUiJson, workshopErrorMessage } from "@/components/relief/relief-workshop";
import { WORKSHOP_REQUIRED_ARTIFACTS } from "../workshop";

describe("workshop initial UI truth", () => {
  it("does not claim a configured or completed worker when configuration is absent", () => {
    const html = renderToStaticMarkup(createElement(ReliefWorkshop, { configured: false }));
    expect(html).toContain("Test Atölyesi");
    expect(html).toContain("Worker yapılandırılmadı");
    expect(html).toContain("Hiçbir dosya gönderilmiyor");
    expect(html).toContain("disabled=");
    expect(html).toContain("kararlı semantik ID çiftiyle doğrulanır");
    expect(html).toContain("fiziksel onay düğmesi sunmaz");
    expect(html).not.toContain("/artifacts/");
  });
  it("waits for real worker availability before enabling submission", () => {
    const html = renderToStaticMarkup(createElement(ReliefWorkshop, { configured: true }));
    expect(html).toContain("Bağlantı kontrol ediliyor");
    expect(html).toContain("disabled=");
    expect(html).not.toContain("Worker bağlı");
    expect(html).not.toContain("Dijital işlem bitti");
  });
  it("keeps the direct SVG cut contour in the public artifact contract", () => {
    expect(WORKSHOP_REQUIRED_ARTIFACTS).toContain("cut-contour");
  });
  it("uses stable Turkish fallbacks for rejected or malformed worker replies", async () => {
    expect(workshopErrorMessage("same_origin_required")).toContain("kendi Renderhane adresinden");
    expect(workshopErrorMessage("invalid_worker_artifact")).toContain("İndirme başlatılmadı");
    await expect(readWorkshopUiJson(new Response("<html>broken"))).rejects.toThrow("Worker yanıtı doğrulanamadı");
  });
});

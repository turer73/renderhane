import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReliefWorkshop } from "@/components/relief/relief-workshop";

describe("workshop initial UI truth", () => {
  it("does not claim a configured or completed worker when configuration is absent", () => {
    const html = renderToStaticMarkup(createElement(ReliefWorkshop, { configured: false }));
    expect(html).toContain("Test Atölyesi");
    expect(html).toContain("Worker yapılandırılmadı");
    expect(html).toContain("Hiçbir dosya gönderilmiyor");
    expect(html).toContain("disabled=");
    expect(html).toContain("henüz otomatik doğrulanmıyor");
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
});

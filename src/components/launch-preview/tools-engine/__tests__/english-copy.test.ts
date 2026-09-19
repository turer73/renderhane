import {describe, expect, it} from "vitest";
import {
  englishInspiration,
  localizeToolMarkup,
  localizeToolText,
} from "../english-copy";

describe("English free-tool copy", () => {
  it("localizes the background-removal workspace", () => {
    const html = localizeToolMarkup(
      "<h1>Arka planı geride bırak.</h1><button>Arka planı kaldır</button><span>Günde 3 ücretsiz kullanım</span>"
    );

    expect(html).toContain("Leave the background behind.");
    expect(html).toContain("Remove background");
    expect(html).toContain("3 free uses per day");
    expect(html).not.toMatch(/Arka plan|ücretsiz kullanım/);
  });

  it("localizes QR verification and NFC action states", () => {
    expect(
      localizeToolText(
        "9/9 kontrol · İçerik birebir eşleşti · Klasik karşılaştırma da geçti"
      )
    ).toBe("9/9 checks · Exact payload match · Classic baseline also passed");
    expect(localizeToolText("Etiket yazıldı. Kullanacağın cihazla okuyarak test et."))
      .toBe("Tag written. Read it with the intended device to test it.");
  });

  it("keeps the full English inspiration experience interactive", () => {
    const qr = englishInspiration("qr", {
      category: "all",
      expanded: true,
      selected: "product-360",
    });
    const nfc = englishInspiration("nfc");

    expect(qr).toContain('data-idea-filter="all"');
    expect(qr).toContain('data-idea="product-360"');
    expect(qr).toContain('id="rh-idea-form"');
    expect(qr).toContain('data-idea-more');
    expect(nfc).toContain('data-idea=');
    expect(qr + nfc).not.toMatch(/[ÇĞİÖŞÜçğıöşü]/);
  });
});

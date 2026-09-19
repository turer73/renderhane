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

  it("provides English-only inspiration summaries", () => {
    const qr = englishInspiration("qr");
    const nfc = englishInspiration("nfc");

    expect(qr).toContain("Practical QR ideas");
    expect(nfc).toContain("Practical NFC ideas");
    expect(qr + nfc).not.toMatch(/[ÇĞİÖŞÜçğıöşü]/);
  });
});

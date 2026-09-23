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
    expect(localizeToolText("Bu içerik için 512px küçük kalıyor. Stilli QR için en az 6 piksel/modül gerekiyor; daha büyük çıktı seçin."))
      .toBe("This content does not fit at 512px. At least 6 pixels per module are required for a styled QR; choose a larger output.");
    expect(localizeToolText("QR boş kenarı veya beyaz zemin değişmiş."))
      .toBe("The QR quiet zone or white background has changed.");
    expect(localizeToolText("Orijinal ürün fotoğrafı"))
      .toBe("Original product photo");
    expect(localizeToolText("Dosya okunamadı.")).toBe("The file could not be read.");
    expect(localizeToolText("1/2 etiket yazıldı ve kalıcı kilitlendi. Etiketi uzaklaştır, sıradaki etiketi yaklaştır."))
      .toBe("1/2 tag written and permanently locked. Remove the tag and hold the next tag near the phone.");
    expect(localizeToolText("Toplu yazım tamamlandı: 2/2 etiket yazıldı ve 2 etiket kalıcı kilitlendi."))
      .toBe("Bulk writing completed: 2/2 tags written and 2 tags permanently locked.");
    expect(localizeToolText("30 saniye içinde etiket algılanmadı. İşlemi yeniden başlatabilirsin."))
      .toBe("No tag was detected within 30 seconds. You can start the operation again.");
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

  it("preserves idea-specific setup and risk guidance in English", () => {
    const automation = englishInspiration("nfc", {
      category: "all",
      expanded: true,
      selected: "desk-routine",
    });
    const authenticated = englishInspiration("nfc", {
      category: "all",
      expanded: true,
      selected: "authenticated-edition",
    });

    expect(automation).toContain("Shortcuts or Home Assistant");
    expect(automation).toContain("does not install an automation on another phone");
    expect(authenticated).toContain("key-management process");
    expect(authenticated).toContain("cloning, tag transfer, and replay risks");
    expect(authenticated).toContain("physical binding between a tag and the real product");
  });

});

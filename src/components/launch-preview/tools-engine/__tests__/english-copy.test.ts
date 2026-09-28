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
    expect(localizeToolText("Ad alanını doldurun.")).toBe("Complete the first name field.");
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
    expect(localizeToolText("30 saniye içinde kalıcı kilit tamamlanmadı. Etiket yazıldı ancak kilit durumunu kontrol et."))
      .toBe("Permanent locking did not finish within 30 seconds. The tag was written, but check its lock status.");
    expect(localizeToolText("Kalıcı kilit zaman aşımına uğradı; kilit durumu doğrulanamadı."))
      .toBe("Permanent locking timed out; the lock status could not be verified.");
    expect(localizeToolText("NTAG213 · 132 bayt")).toBe("NTAG213 · 132 bytes");
    expect(localizeToolText("NTAG215 · 492 bayt")).toBe("NTAG215 · 492 bytes");
    expect(localizeToolText("NTAG216 · 872 bayt")).toBe("NTAG216 · 872 bytes");
    expect(localizeToolText("Tahmini NDEF: 156 / 132 bayt · 24 bayt fazla. Renderhane sıkıştırılmış biçimi 104 bayt ve bu etikete sığıyor."))
      .toBe("Estimated NDEF: 156 / 132 bytes · 24 bytes over. Renderhane compact uses 104 bytes and fits this tag.");
    expect(localizeToolText("İçerik seçilen etikete sığmıyor: 156 / 132 bayt. Renderhane sıkıştırılmış biçimini seçersen 104 bayt olarak sığar."))
      .toBe("The content does not fit the selected tag: 156 / 132 bytes. Choose Renderhane compact to fit it in 104 bytes.");
    expect(localizeToolText("Tahmini NDEF: 500 / 492 bayt · 8 bayt fazla. NTAG216 seç."))
      .toBe("Estimated NDEF: 500 / 492 bytes · 8 bytes over. Choose NTAG216.");
    expect(localizeToolText("Tahmini NDEF: 900 / 872 bayt · 28 bayt fazla. İçeriği kısalt; NTAG216 kapasitesi de yeterli değil."))
      .toBe("Estimated NDEF: 900 / 872 bytes · 28 bytes over. Shorten the content; even NTAG216 does not have enough capacity.");
    expect(localizeToolText("İçerik seçilen etikete sığmıyor: 500 / 492 bayt. NTAG216 seç."))
      .toBe("The content does not fit the selected tag: 500 / 492 bytes. Choose NTAG216.");
    expect(localizeToolText("NFC etiketi okunamadı. Temas kesilmiş veya etiket uyumsuz olabilir; etiketi telefonun NFC alanında sabit tutup yeniden dene."))
      .toContain("The NFC tag could not be read.");
    expect(localizeToolText("Geçerli bir 10 haneli vergi numarası veya 11 haneli T.C. kimlik numarası girin."))
      .toBe("Enter a valid 10-digit Turkish tax number or 11-digit Turkish identity number.");
    expect(localizeToolText("NFC etiketi okunamadı. Etiketi ve telefonun NFC ayarını kontrol et."))
      .toBe("The NFC tag could not be read. Check the tag and the phone's NFC setting.");
    expect(localizeToolText("NFC etiketi okunamadı: Adapter offline"))
      .toBe("The NFC tag could not be read: Adapter offline");
    expect(localizeToolText("Etiketten geri okunan içerik yazılan NDEF ile eşleşmedi; kalıcı kilit uygulanmadı."))
      .toBe("The content read back from the tag did not match the written NDEF; permanent locking was not applied.");
    expect(localizeToolText("Toplu yazım tamamlandı: 3/3 etiket yazıldı; 1 kilitlendi, 2 kilitlenemedi. Son hata: Kilit işlemi tamamlanmadı."))
      .toBe("Bulk writing completed: 3/3 tags written; 1 locked, 2 could not be locked. Last error: The locking operation did not complete.");
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

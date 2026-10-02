# Görsel girdi ön kontrolü (model sınırları)

Kullanıcı görseli bir modele gitmeden önce iki yerde kontrol edilir: tarayıcıda hazırlanır, sunucuda kredi ve sağlayıcı harcamasından önce gerçek baytlarıyla doğrulanır. İki taraf aynı sözleşmeyi kullanır.

## Sözleşme

- Kaynak: `src/lib/media/image-input-contract.ts`. `getImageInputLimits(modelKey)` modelin biçim, bayt, boyut, piksel ve adet sınırlarını; `getSelectionImageInputLimits` araç/kademe seçimine göre yönlendirilen modelin sınırlarını; `intersectImageInputLimits` birden çok modele giden tek görselin (A+, Social Kit) en sıkı ortak sınırını verir.
- Belgelenmiş sınırlar fal OpenAPI girdi şemalarından 2026-10-02'de okundu ("MB" 10^6 bayt sayıldı). Yeni model veya şema değişikliğinde `DOCUMENTED` tablosu elle güncellenir; okuma tarihi `DOCUMENTED_LIMITS_SOURCE` içinde.
- Sağlayıcının belgelemediği sınırlar için genel güvenlik değerleri: 20.000.000 bayt, JPEG/PNG/WebP, en kısa kenar 64 piksel, en çok 50 MP. Bu durumda arayüz "sağlayıcı belgelemiyor; genel güvenlik sınırları uygulanıyor" notunu gösterir (`verification` alanı).
- Bütün modellere tek bir 5 MiB sınırı uygulanmaz. Her sunucu okuması ayrıca 32 MiB tavanla sınırlıdır; adet en çok 4 görsel.

## Sunucu kontrolü

- `src/lib/media/image-preflight.ts`: dosya `openPublicDownload` ile okunur (DNS sabitleme, özel IP engeli, 15 sn zaman aşımı, en çok 2 yönlendirme, model sınırı kadar bayt). `data:` adresleri çözülmeden önce kodlanmış uzunluğuyla ölçülür.
- Biçimi bildirilen MIME değil dosyanın sihirli baytları belirler (`image-probe.ts`; PNG, JPEG, WebP, GIF, BMP, AVIF, HEIC). Boyut başlıktan okunur; çok pikselli dosya çözülmeden reddedilir.
- Kontrol; proje, iş kaydı, kredi rezervasyonu, ücretli ön işleme ve sağlayıcı gönderiminden önce çalışır. Kullanıldığı yollar: `/api/jobs/submit`, `submit-aplus`, `submit-talking-avatar`, `submit-social-kit`, `/api/v1/jobs`, `/api/jobs/[id]/regenerate` (süresi dolmuş imzalı bağlantılar önce yeniden imzalanır) ve Model Laboratuvarı (`/api/admin/models/preflight`, `/api/admin/models/test`; alan bazlı).
- Ret yanıtı 422: `{ error: <Türkçe mesaj>, code: "image_input_invalid", issues: [{ code, index, message, field? }] }`. Mesajlar Türkçedir, adres veya imzalı bağlantı belirteci içermez. Ret durumunda rezervasyon yapılmamıştır ya da iade edilir; sağlayıcıya istek gitmez.

## Tarayıcı hazırlığı

- `src/lib/media/optimize-image.ts`: sınıra sığan dosyaya dokunulmaz. Sığmayan dosya için ölçek (1 → 0,5) × desteklenen biçim × kalite (0,92 → 0,80) merdiveni denenir; saydamlık varsa saydamlığı koruyan biçim önce gelir.
- Kalite 0,86'nın veya ölçek 0,75'in altına inerse ya da saydamlık beyaz zemine düzleşecekse önce/sonra önizlemesi gösterilir ve kullanıcı seçer. Orijinal dosya saklanır; model değişince hazırlık orijinalden yeniden yapılır. Hazırlık iptal edilebilir.
- Tarayıcı sınırları: 150 MB dosya, 100 MP çözme. Kodlayıcı tarayıcının kendisidir (`browser-image-codec.ts`); yalnız Chrome'da ölçüldü.

## Sorun giderme

- Kullanıcı 422 görüyorsa mesaj hangi sınırın aşıldığını söyler (biçim, bayt, boyut, piksel, adet, okunamadı, zaman aşımı). Sınır yanlışsa önce sağlayıcının güncel şemasına bakın, sonra `DOCUMENTED` tablosunu ve testlerini (`src/lib/media/__tests__/`) birlikte güncelleyin.
- "Okunamadı/zaman aşımı" kaynağın sunucudan erişilemediğini gösterir (özel ağ, yönlendirme zinciri, süresi dolmuş imzalı bağlantı). Sunucu bu adresleri kasıtlı olarak indirmez.
- Bilinen sınırlar: tarayıcı ölçümü yalnız Chrome; sağlayıcı şemaları el ile okunduğu için değişiklik otomatik fark edilmez.

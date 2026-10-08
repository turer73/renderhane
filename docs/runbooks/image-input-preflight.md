# Görsel girdi ön kontrolü (model sınırları)

Kullanıcı görseli bir modele gitmeden önce iki yerde kontrol edilir: tarayıcıda hazırlanır, sunucuda kredi ve sağlayıcı harcamasından önce gerçek baytlarıyla doğrulanır. İki taraf aynı sözleşmeyi kullanır.

## Sözleşme

- Kaynak: `src/lib/media/image-input-contract.ts` (biçim tablosu ve genel sınırlar model kataloğu olmadan `image-formats.ts` içinde; ücretsiz araçlar yalnız onu yükler). `getImageInputLimits(modelKey)` modelin biçim, bayt, boyut, piksel ve adet sınırlarını; `getSelectionImageInputLimits` araç/kademe seçimine göre yönlendirilen modelin sınırlarını; `intersectImageInputLimits` birden çok modele giden tek görselin (A+, Social Kit) en sıkı ortak sınırını verir.
- Belgelenmiş sınırlar fal OpenAPI girdi şemalarından 2026-10-02'de okundu ("MB" 10^6 bayt sayıldı). Yeni model veya şema değişikliğinde `DOCUMENTED` tablosu elle güncellenir; okuma tarihi `DOCUMENTED_LIMITS_SOURCE` içinde.
- Sağlayıcının belgelemediği sınırlar için genel güvenlik değerleri: 20.000.000 bayt, JPEG/PNG/WebP, en kısa kenar 64 piksel, en çok 50 MP. Bu durumda arayüz "sağlayıcı belgelemiyor; genel güvenlik sınırları uygulanıyor" notunu gösterir (`verification` alanı).
- Bütün modellere tek bir 5 MiB sınırı uygulanmaz. Her sunucu okuması ayrıca 32 MiB tavanla sınırlıdır; adet en çok 4 görsel.

## Sunucu kontrolü

- `src/lib/media/image-preflight.ts`: dosya `openPublicDownload` ile okunur (DNS sabitleme, özel IP engeli, 15 sn zaman aşımı, en çok 2 yönlendirme, model sınırı kadar bayt). `data:` adresleri çözülmeden önce kodlanmış uzunluğuyla ölçülür.
- Biçimi bildirilen MIME değil dosyanın sihirli baytları belirler (`image-probe.ts`; PNG, JPEG, WebP, GIF, BMP, AVIF, HEIC). Boyut başlıktan okunur; çok pikselli dosya çözülmeden reddedilir.
- Başlık tek başına görsel değildir: sınırlara uyan her dosya bir kez **gerçekten çözülür** (`image-decode-check.ts`, `sharp`/libvips; ilk kare, en çok 50 MP, 10 sn). `failOn: "error"`: yalnız başlığı olan, yarıda kesilmiş veya çözülemeyen veri reddedilir; çözülebilen ama içi bozuk (gürültüye dönmüş) veri, sağlayıcıların çözücüleri gibi kabul edilir. Ölçüm (2026-10-02, sharp 0.35.4): 20 MP JPEG ≈ 0,2 sn, 25 MP WebP ≈ 1,2 sn, ek bellek ihmal edilebilir.
- HEIC ve BMP de gerçek çözücüden geçmek zorundadır; platformun biçim desteği yoksa ücretli işleme geçmeden 422 döner ve JPEG/PNG olarak yeniden yükleme önerilir. Kutu yapısı, `mdat` veya piksel dizisinin varlığı tek başına çözme kanıtı sayılmaz.
- Yalnız çözülmüş dosyanın bilgisi istek içi önbelleğe girer; reddedilen dosya önbelleğe alınmaz.
- Kontrol; proje, iş kaydı, kredi rezervasyonu, ücretli ön işleme ve sağlayıcı gönderiminden önce çalışır. Kullanıldığı yollar: `/api/jobs/submit`, `submit-aplus`, `submit-talking-avatar`, `submit-social-kit`, `/api/v1/jobs`, `/api/jobs/[id]/regenerate` (süresi dolmuş imzalı bağlantılar önce yeniden imzalanır) ve Model Laboratuvarı (`/api/admin/models/preflight`, `/api/admin/models/test`; alan bazlı).
- Ret yanıtı 422: `{ error: <Türkçe mesaj>, code: "image_input_invalid", issues: [{ code, index, message, field? }] }`. Mesajlar Türkçedir, adres veya imzalı bağlantı belirteci içermez. Ret durumunda rezervasyon yapılmamıştır ya da iade edilir; sağlayıcıya istek gitmez.
- Ücretsiz arka plan kaldırma (`/api/demo/bg-remove`) aynı ön kontrolü `demo-image-limits.ts` ile yapar ve 422'de `error` İngilizce, `errorTr` Türkçe mesaj döner. Not: bu rotada günlük kullanım hakkı ön kontrolden önce düşer (kötüye kullanıma karşı); tarayıcı hazırlığı geçersiz dosyaların çoğunu gönderilmeden yakalar.

## Tarayıcı hazırlığı

- `src/lib/media/optimize-image.ts`: sınıra sığan dosyaya dokunulmaz. Sığmayan dosya için ölçek (1 → 0,5) × desteklenen biçim × kalite (0,92 → 0,80) merdiveni denenir; saydamlık varsa saydamlığı koruyan biçim önce gelir.
- Kalite 0,86'nın veya ölçek 0,75'in altına inerse ya da saydamlık beyaz zemine düzleşecekse önce/sonra önizlemesi gösterilir ve kullanıcı seçer. Orijinal dosya saklanır; model değişince hazırlık orijinalden yeniden yapılır. Hazırlık iptal edilebilir.
- Sınıra zaten uyan dosya da tarayıcıda bir kez küçük boyutta çözülür (başlık tek başına yetmez); HEIC'i çoğu tarayıcı çözemediği için onun denetimi sunucuya kalır.
- Tarayıcı sınırları: 150 MB dosya, 100 MP çözme. Kodlayıcı tarayıcının kendisidir (`browser-image-codec.ts`); yalnız Chrome'da ölçüldü.

## Ücretsiz araç: 5 MiB yerine gerçek aktarım sınırı

- Eski ücretsiz arka plan kaldırma aracı her dosyaya sabit 5 MiB (5.242.880 bayt) sınırı koyuyordu; kod tabanındaki tek 5 MiB sınırı buydu. Araç fotoğrafı base64 veri adresi olarak JSON gövdesinde gönderir; Vercel fonksiyonu en çok 4,5 MB gövde kabul ettiğinden (Vercel belgesi, 2026-08-24; aşımda 413 `FUNCTION_PAYLOAD_TOO_LARGE`) ~3,3 MB üstü dosyalar 5 MB'tan önce de sunucuya hiç ulaşamıyordu. Bu canlıda ölçülmedi; belgeden ve base64 hesabından çıkarıldı.
- Artık fotoğraf tarayıcıda paylaşılan hazırlayıcıyla 3.000.000 bayta (`DEMO_UPLOAD_MAX_BYTES`) uyarlanır; belirgin kayıpta önce/sonra özetiyle onay sorulur, hazırlık sırasında durum satırında "Fotoğraf hazırlanıyor…" görünür. Sunucu aynı sınırı ve çözmeyi yeniden denetler.
- Ölçüm (Chrome, 2026-10-02): 5.242.881 baytlık JPEG → 2210×1700 px, 2,8 MB, kalite %92, onaysız; istek gövdesi 3,76 MB. 10,5 MB 12 MP gürültü → 2400×1800, 2,4 MB, kalite %86, onaylı; gövde 3,18 MB. Saf gürültü 20 MP (en kötü durum) hazırlığı ≈ 20–25 sn sürdü; gerçek fotoğraflar çok daha hızlıdır (12 MP düzgün görsel 0,5 sn).

## Sorun giderme

- İlk kullanıcı raporundaki `file_too_large` hatası 5.242.880 baytlık sağlayıcı sınırı ve Supabase imzalı yükleme adresi içeriyordu. Ücretsiz aracın `data:` aktarım sınırının düzeltilmesi bu hatanın kaynağını kanıtlamaz. Model anahtarı/endpoint belirlenmeden o özel sağlayıcı sınırının düzeltildiği iddia edilmez; belgelenmemiş sınırlar hâlâ ayrıca doğrulanmalıdır.

- Kullanıcı 422 görüyorsa mesaj hangi sınırın aşıldığını söyler (biçim, bayt, boyut, piksel, adet, okunamadı, zaman aşımı). Sınır yanlışsa önce sağlayıcının güncel şemasına bakın, sonra `DOCUMENTED` tablosunu ve testlerini (`src/lib/media/__tests__/`) birlikte güncelleyin.
- "Okunamadı/zaman aşımı" kaynağın sunucudan erişilemediğini gösterir (özel ağ, yönlendirme zinciri, süresi dolmuş imzalı bağlantı). Sunucu bu adresleri kasıtlı olarak indirmez.
- Bilinen sınırlar: tarayıcı ölçümü yalnız Chrome; sağlayıcı şemaları el ile okunduğu için değişiklik otomatik fark edilmez.

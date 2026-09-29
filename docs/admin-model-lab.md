# Admin Model Laboratuvarı

## Kapsam ve erişim

- Sayfa: `/tr/app/admin/models`. Yönetim panelinin üst kartından, workspace menüsünden ve kullanıcı menüsünden açılır.
- Sayfa ve iki API rotası sunucuda `auth.getUser()` + mevcut `ADMIN_EMAILS` kontrolünü kullanır. Bu değişiklik yeni admin atamaz, canlı ortam değişkenlerini değiştirmez.
- Katalog ayrı bir dokuzlu liste değildir: `MODELS` içindeki bütün kayıtlar otomatik türetilir (bu revizyonda Meshy 7.1 dahil 68). Yeni kayıtlar için katalog testi kapsamı korunmalıdır.
- `Standart kayıt` = `TOOL_MODELS` bağlantısı bulunan kayıt; `Deneysel` = `adminOnly`; `Menü dışı` = araç listesi bağlantısı olmayan kayıt. Bu etiketler canlı sağlayıcı sağlığı veya model kalitesi kanıtı değildir. fal.ai'nin tüm kataloğuna veya keyfi endpoint'lere erişim verilmez.

## Deneme akışı

1. Model ara; tür ve kayıt durumuna göre filtrele.
2. Metin ve gerekli HTTPS kaynak adreslerini gir. Bu ilk sürüm yerel dosya yüklemez; mevcut güvenli dosya adresleri gerekir. Çoklu kaynak en fazla dört adres; metin en fazla 5.000 karakter.
3. Kayıtlı varsayılan parametreleri ve sağlayıcının güncel fiyat sayfasını incele. Ham JSON/serbest parametre override bu sürümde yok.
4. Tek deneme için sağlayıcı ücretini açıkça onayla. Model/girdi değişince onay sıfırlanır.
5. Kuyruk ve sonucu takip et. Önceki deneme sürerken aynı ekran yeni deneme göndermez.

Admin Renderhane kredisi harcamaz. **Sağlayıcı çağrıları gerçek ücretlidir.** Ücret canlı hesaplanmaz; çözünürlük/süre/doku gibi parametrelere göre değişebilir. Sayfa açmak, filtrelemek ve durum sorgulamak yeni üretim göndermez.

## Sunucu ve kesinti güvenliği

- POST `/api/admin/models/test`: `{ modelKey, values, confirmProviderSpend: true }`. Yalnız sunucu kaydındaki model, bilinen alanlar, düz nesne, boyut sınırı ve halka açık HTTPS biçimindeki kaynaklar kabul edilir. Sunucu bu kaynak URL'lerini indirmez; kontrol DNS çözümleme/redirect garantisi değildir.
- `subscribe` yerine mevcut sağlayıcının `submit` kuyruğu kullanılır. Sadece gönderim kabulü beklenir; uzun video/3D üretimi HTTP sayfa isteğine bağlı kalmaz.
- `FAL_WEBHOOK_SECRET` yoksa **gönderimden önce 503**. Alındı, mevcut gizli anahtar ile ayrı domain altında HMAC-SHA256 imzalanır; kullanıcı, model, endpoint, provider request id ve 24 saat süreye bağlıdır. Secret değeri istemciye gönderilmez. Secret rotasyonu eski laboratuvar alındılarını geçersiz kılar.
- POST `/api/admin/models/test/status`: `{ receipt }`. Yeniden admin doğrulaması, aynı-origin, alındı sahipliği/imzası/süresi ve rate limit kontrol edilir. Keyfi provider request id sorgulanamaz.
- Üretim isteği otomatik tekrarlanmaz. Kabul alındısı olan hata yanıtta aynı iş izlenir. Alındısız bağlantı kopmasında durum **belirsiz** tutulur; yeni denemeden önce sağlayıcı geçmişini insan kontrol eder.
- Son deneme kullanıcıya özgü, sürümlenmiş tarayıcı kaydında tutulur. Girdi metni ve kaynak adresleri kaydedilmez. Sonuç bağlantıları ve takip alındısı hassas kabul edilmelidir; paylaşılan tarayıcıda çıktı geçmişinin tutulduğu bilinmelidir.
- Takibi bırakmak üretimi iptal etmez; ücret iadesi yapmaz. Takip hataları otomatik yeni iş veya iade oluşturmaz. Birden fazla sekme/cihaz arasında küresel tek-iş kilidi veya kalıcı idempotency deposu yoktur; paralel denemeler ayrı ücretlendirilebilir.
- Çıktılar bu laboratuvarda R2/proje galerisine arşivlenmez. Sağlayıcı bağlantıları süreli olabilir. Desteklenen çıktı alanı bulunamadığında başarı dosyası uydurulmaz; sağlayıcı geçmişi kontrol edilir.

## Doğrulama sınırı

Katalog/alan kontrolleri; yetkisiz kullanıcı, yanlış origin, eksik harcama onayı, rate limit, imza kurcalama, diğer kullanıcıya ait/süresi dolmuş alındı, belirsiz gönderim, tanınmayan durum ve güvensiz çıktı URL'leri test edilir. Yerel tarayıcı kontrolü gerçek bileşen + sahte taşıma kullanır: gerçek ücretli API denemesi değildir.

Canlı sürüm kabulü ayrıca gerekir: doğru admin hesabıyla menü/sayfa erişimi, ortam yapılandırması ve kullanıcının model/ücret onayından sonra tek ücretli üretim. Bu değişiklik push, PR, merge, deploy, canlı admin ataması veya fiziksel üretim onayı içermez.

Model çıktısı dijital bir denemedir; özellikle GLB üretimi fiziksel ölçülü/üretime hazır dosya garantisi değildir. Relief Pro'nun kapalı bırakılan akışı bu çalışma kapsamında yeniden etkinleştirilmez.

## Yerel kontrol sonucu — 29 Eylül 2026

- `npm test`: 59 dosya, 642 test geçti (önceki Meshy 7.1 testleri dahil).
- `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check`: geçti.
- Gerçek panel bileşeni ve sahte API ile: model arama, Meshy 7.1 seçimi, ücret onayı, 502 yanıtındaki kabul alındısından takip, devam eden işin yenilemede tek status isteğiyle geri alınması ve alındısız bağlantı kopmasında tekrar gönderimin kilitlenmesi doğrulandı.
- 320, 390, 768 ve 1366 px kontrollerinde yatay taşma yok; tarayıcı hata kaydı boş.
- Mevcut Vite yapılandırma biçimi ve yerel `metadataBase` uyarıları kaldı; bunlar build/test başarısızlığı oluşturmadı.
- Bağımsız güvenlik incelemesinde engelleyici bulgu yok. İstek gövdesi sınırı okuma sonrası da kontrol edilir; chunked aşırı büyük gövdeler için akış sırasında kesme ilave sertleştirme olarak açık.
- Canlı auth, gerçek ücretli üretim, sağlayıcı çıktı kalitesi ve tüm 68 endpoint'in güncel çalışırlığı doğrulanmış değildir. Yayın yapılmadı.

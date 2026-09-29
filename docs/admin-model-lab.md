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
- Ücretli istekten önce belirsiz-deneme kaydı yazılıp geri okunarak doğrulanır. Tarayıcı depolaması kapalı/doluysa veya kayıt geri okunamıyorsa gönderim yapılmaz. Kabul alındısı sonradan kaydedilemezse ilk belirsiz kayıt tekrar üretimi kilitlemeye devam eder.
- Sağlayıcının `COMPLETED` yanıtındaki `error`/`error_type` terminal başarısızlık sayılır; sonuç indirme ya da sonsuz tekrar takibi yapılmaz.
- MiniMax ses modellerinin gerekli `voice_setting` alanı normal üretimdeki kanonik ses oluşturucudan türetilir; laboratuvardaki sabit ayarlar gönderim öncesinde gösterilir.
- xAI ses denemeleri de mevcut `buildXaiInput` / `DEFAULT_XAI_VOICE` ayarını açıkça gösterip gönderir. Bu, sağlayıcının kendi varsayılan sesinden bağımsız sözleşme tutarlılığıdır; canlı üretim sonucu kanıtı değildir.
- Takibi bırakmak üretimi iptal etmez; ücret iadesi yapmaz. Takip hataları otomatik yeni iş veya iade oluşturmaz. Birden fazla sekme/cihaz arasında küresel tek-iş kilidi veya kalıcı idempotency deposu yoktur; paralel denemeler ayrı ücretlendirilebilir.
- Çıktılar bu laboratuvarda R2/proje galerisine arşivlenmez. Sağlayıcı bağlantıları süreli olabilir. Desteklenen çıktı alanı bulunamadığında başarı dosyası uydurulmaz; sağlayıcı geçmişi kontrol edilir.

## Doğrulama sınırı

Katalog/alan kontrolleri; yetkisiz kullanıcı, yanlış origin, eksik harcama onayı, rate limit, imza kurcalama, diğer kullanıcıya ait/süresi dolmuş alındı, belirsiz gönderim, tanınmayan durum ve güvensiz çıktı URL'leri test edilir. Yerel tarayıcı kontrolü gerçek bileşen + sahte taşıma kullanır: gerçek ücretli API denemesi değildir.

Canlı sürüm kabulü ayrıca gerekir: doğru admin hesabıyla menü/sayfa erişimi, ortam yapılandırması ve kullanıcının model/ücret onayından sonra tek ücretli üretim. Yerel testler canlı admin ataması, ücretli üretim veya fiziksel üretim onayı vermez. Kullanıcının ayrıca onayladığı merge/deploy işlemi PR #118 üzerinde ayrı yayın kanıtlarıyla izlenir.

Model çıktısı dijital bir denemedir; özellikle GLB üretimi fiziksel ölçülü/üretime hazır dosya garantisi değildir. Relief Pro'nun kapalı bırakılan akışı bu çalışma kapsamında yeniden etkinleştirilmez.

## Yerel kontrol sonucu — 29 Eylül 2026

- İlk doğrulamada `npm test`: 59 dosya, 642 test geçti. PR inceleme, ses çıktısı ve yerelleştirilmiş hata düzeltmeleri sonrasında: 61 dosya, 669 test geçti (önceki Meshy 7.1 testleri dahil).
- `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check`: geçti.
- Gerçek panel bileşeni ve sahte API ile: model arama, Meshy 7.1 seçimi, ücret onayı, 502 yanıtındaki kabul alındısından takip, devam eden işin yenilemede tek status isteğiyle geri alınması ve alındısız bağlantı kopmasında tekrar gönderimin kilitlenmesi doğrulandı.
- 320, 390, 768 ve 1366 px kontrollerinde yatay taşma yok; tarayıcı hata kaydı boş.
- PR #118 incelemesindeki dört bulgu düzeltildi: terminal sağlayıcı hatası, MiniMax ses ayarları, takip kaydı olmadan ücretli gönderim ve TR/EN yerelleştirme. Dil anahtarı eşliği ve tüm katalog alanlarının çeviri kapsamı için regresyon testleri eklendi.
- Güncel gerçek panelde (sahte taşıma): TR/EN depolama hatasında **0 gönderim**; EN belirsiz gönderimde ilk sefer 1, yenilemeden sonra **0 yeni gönderim** ve kilit korunması; EN 390 px genişlikte taşmasız görünüm doğrulandı.
- F5-TTS `audio_url` metin/nesne biçimleri ses çıktısı olarak tanınır; güvenli HTTPS ve yinelenen URL kontrolleri korunur. HTTP hata anlamları dil bağımsız anahtarlara çevrilir; EN panelde Türkçe 502/429 yanıtı kullanıcıya İngilizce takip açıklaması verir, yeni üretim göndermez.
- Mevcut Vite yapılandırma biçimi ve yerel `metadataBase` uyarıları kaldı; bunlar build/test başarısızlığı oluşturmadı.
- Bağımsız güvenlik incelemesinde engelleyici bulgu yok. İstek gövdesi sınırı okuma sonrası da kontrol edilir; chunked aşırı büyük gövdeler için akış sırasında kesme ilave sertleştirme olarak açık.
- Bu yerel kontrol kaydı canlı auth, gerçek ücretli üretim, sağlayıcı çıktı kalitesi veya tüm 68 endpoint'in güncel çalışırlığını kanıtlamaz. Yayın sonucu PR #118 kayıtlarından ayrıca doğrulanmalıdır.

# Admin Model Laboratuvarı

## Kapsam ve erişim

- Sayfa: `/tr/app/admin/models`. Yönetim panelinin üst kartından, workspace menüsünden ve kullanıcı menüsünden açılır.
- Sayfa ve bütün laboratuvar API rotaları sunucuda `auth.getUser()` + mevcut `ADMIN_EMAILS` kontrolünü kullanır. Durum değiştiren her istek ayrıca aynı-origin ister. Bu çalışma yeni admin atamaz, canlı ortam değişkenlerini değiştirmez.
- Katalog ayrı bir liste değildir: `MODELS` içindeki bütün kayıtlar otomatik türetilir (bu revizyonda 68). `Standart kayıt` = `TOOL_MODELS` bağlantısı olan kayıt; `Deneysel` = `adminOnly`; `Menü dışı` = araç listesi bağlantısı olmayan kayıt. Bu etiketler canlı sağlayıcı sağlığı veya model kalitesi kanıtı değildir. fal.ai'nin tüm kataloğuna veya keyfi endpoint'lere erişim verilmez.

## Deneme akışı

1. Model ara; tür ve kayıt durumuna göre filtrele. Deneme gönderilirken model değiştirilemez.
2. Girdileri hazırla:
   - **Görsel alanları** (katalogda `media: "image"`): dosya seç veya sürükle-bırak; HTTPS adresi alternatif olarak kalır. Her görsel önizlenir, değiştirilir veya kaldırılır. Liste alanları (`image_urls`) en fazla dört görsel alır (modelin belgelenmiş sınırı daha düşükse o).
   - **Ses ve video alanları** adres olarak kalır; görsel yükleyiciye çevrilmez.
   - Görsel, seçilen modelin ortak sözleşmesine (`src/lib/media/image-input-contract.ts`) göre tarayıcıda hazırlanır: sığan dosyaya dokunulmaz; büyük dosya kalite korunarak desteklenen biçime çevrilir, gerekirse küçültülür. Belirgin kalite kaybı veya saydamlığın düzleşmesi önce/sonra önizlemesiyle kullanıcıya sorulur. Uygunlaştırılamayan dosya Türkçe modalda ve alanın altında gösterilir; diğer girdiler korunur.
   - Yüklenen dosya yöneticinin kendi klasörüne gider: `uploads/<kullanıcı>/model-lab/inputs/` (özel bucket, sahip-klasör RLS). Modele bir saatlik imzalı bağlantı verilir; doğrulamadan hemen önce bütün kendi yüklemeleri yeniden imzalanır.
3. Kayıtlı varsayılan parametreleri ve sağlayıcının güncel fiyat sayfasını incele. Ham JSON/serbest parametre override yok.
4. Tek deneme için sağlayıcı ücretini açıkça onayla. Herhangi bir girdi değişince onay sıfırlanır.
5. Çalıştır. İlerleme adımları: **Yükleniyor → Doğrulanıyor → Kuyrukta → Çalışıyor → Tamamlandı / Başarısız / Belirsiz**. Doğrulama adımı (`/api/admin/models/preflight`) gerçek baytları model sınırlarına göre kontrol eder ve ücret oluşturmaz; aynı kontrol gönderim rotasında yeniden yapılır.
6. Sonuçlar aynı sayfadaki **Sonuçlar** bölümünde: model, tarih, istek numarası, durum; görsel/video/ses önizlemesi, GLB için mevcut 3D görüntüleyici (tıklayınca yüklenir), her dosya için Aç ve İndir. Yeni deneme önceki denemeyi ezmez.

Admin Renderhane kredisi harcamaz. **Sağlayıcı çağrıları gerçek ücretlidir.** Ücret canlı hesaplanmaz. Sayfa açmak, filtrelemek, doğrulamak ve durum sorgulamak yeni üretim göndermez.

## Sunucu geçmişi ve ücret güvenliği

- Geçmiş `public.model_lab_runs` tablosundadır (migration `20261002160000_model_lab_runs.sql`). RLS açık, istemci politikası yok; tablo yalnız servis rolüyle laboratuvar rotalarından okunur/yazılır ve her sorgu oturumdaki admin kullanıcısına daraltılır. Başka bir admin bir denemeyi okuyamaz, sorgulayamaz, silemez veya kapatamaz.
- POST `/api/admin/models/test`: `{ modelKey, values, confirmProviderSpend: true, clientRequestId }`. Sıra: yetki → gövde/alan kontrolü → gizli anahtar (yoksa gönderimden önce 503) → rate limit → girdi kurulumu → görsel ön kontrolü (422) → **ücretli gönderimden önce** `submitting` kaydı → sağlayıcı kuyruğuna tek `submit` → imzalı alındıyla `queued`.
- `clientRequestId` tarayıcıdaki bir denemenin kimliğidir; `(user_id, client_request_id)` tekildir. Yanıtı kaybolan istek aynı kimlikle yeniden gönderilirse sunucu mevcut kaydı döndürür (`duplicate: true`), sağlayıcıya ikinci kez gitmez. Kayıt oluşturulamazsa gönderim yapılmaz (503, `history_unavailable`).
- Üretim isteği otomatik tekrarlanmaz. Kabul edilmiş istek kimliği taşıyan hata takip edilir; kimliksiz hata `unknown` olur. Onayı iki dakika gelmeyen gönderim de `unknown` gösterilir. Belirsiz deneme varken yeni ücretli deneme düğmesi kilitlidir; yönetici fal.ai geçmişini kontrol ettiğini işaretleyince deneme başarısız olarak kapatılır, hiçbir şey yeniden gönderilmez. Kapatılmış denemeye geç gelen onay onu yeniden açmaz.
- POST `/api/admin/models/test/status`: `{ runId, retryStorage? }` (veya eski tarayıcı kaydı için tek seferlik `{ receipt }`). Yalnız durum/sonuç okur, asla gönderim yapmaz. Saklanan HMAC alındısı kullanıcı, istek numarası ve endpoint ile eşleşmeli ve 24 saat içinde olmalıdır; aksi halde deneme `unknown` olur. Sağlayıcının `COMPLETED` yanıtındaki `error`/`error_type` terminal başarısızlıktır. Rate limit, eski kayıt içe aktarma dahil her veritabanı işinden önce uygulanır.
- Sayfa yenilenince geçmiş sunucudan okunur ve bitmemiş denemeler beş saniyede bir durum okumasıyla izlenir; hata alan sorgu üstel olarak geri çekilir (en çok bir dakika), iki ardışık hatadan sonra kartta "takip duraklatıldı" ve elle yeniden kontrol düğmesi görünür.
- Ham sağlayıcı yanıtı, sağlayıcı hata metni veya imzalı bağlantı belirteci geçmişe yazılmaz ve kullanıcıya gösterilmez. Kendi yüklemeler geçmişte depolama yolu olarak, diğer adresler sorgu dizesi atılarak saklanır. Panel hata metinlerini sunucu dilinden değil, hata kodundan kendi diliyle (TR/EN) gösterir; görsel sözleşme hataları Türkçedir.
- MiniMax ve xAI ses denemeleri normal üretimdeki kanonik ses ayarlarını açıkça gösterip gönderir; canlı üretim sonucu kanıtı değildir.

## Çıktıların kalıcı saklanması

- Sağlayıcı bağlantısı kalıcı dosya diye sunulmaz. Tamamlanan denemenin çıktıları, tamamlanmayı tek isteğin üstlendiği karşılaştır-ve-ayarla güncellemesiyle (iki sekme aynı anda kopyalamaz) özel `uploads` bucket'ına kopyalanır: `uploads/<kullanıcı>/model-lab/<deneme>/`.
- İndirme `openPublicDownload` ile yapılır (DNS sabitleme, özel IP engeli, en çok iki yönlendirme, 60 saniye zaman aşımı). Sınırlar: dosya başına 100 MB, deneme başına 250 MB, en çok 12 çıktı.
- Panel dosyaları bir saatlik imzalı bağlantılarla gösterir (görüntüleme ve `download` ekli indirme). Bağlantılar bitmeden beş dakika önce, ya da önizleme yüklenemezse, deneme yeniden okunarak yenilenir.
- Kopyalanamayan çıktı **Geçici sağlayıcı bağlantısı — kalıcı değil** etiketiyle gösterilir ve "Kalıcı kopyayı yeniden dene" sunulur (başarısız, kısmi veya beş dakikadan uzun süre takılı kalmış kopya için).
- Site CSP'si `media-src` için Supabase'i listelemez: saklanan ses/video tarayıcıda `fetch` → blob ile oynatılır (25 MB üstü yalnız istenince). Sağlayıcının fal.media dosyaları aynı-origin `/api/assets/proxy` üzerinden gösterilir; başka sunuculardaki ses/video/GLB yalnız bağlantı olarak verilir.

## Saklama süresi ve silme

- Denemeler **30 gün** saklanır (`expires_at`). Süresi dolan denemeler geçmiş okunurken önce dosyaları, sonra kaydıyla silinir. Dosya silinemezse kayıt korunur ve bir sonraki okumada yeniden denenir.
- "Denemeyi sil" yalnız tamamlanmış veya başarısız denemelerde vardır (devam eden ya da belirsiz deneme hâlâ ücretleniyor olabilir). Silme; denemenin kalıcı çıktılarını ve **başka hiçbir denemenin kullanmadığı laboratuvar yüklemelerini** kaldırır. Açık formda hâlâ duran yüklemeler `keep` ile korunur.
- Laboratuvar yalnız `<kullanıcı>/model-lab/inputs/` altındaki girdileri siler. Formda ana uygulamadan yapıştırılmış bir yükleme bağlantısı (ör. bir işin kaynak görseli) hiçbir koşulda silinmez.
- Kullanılmadan bırakılan yüklemeler: değiştirilen, kaldırılan, iptal edilen veya model değiştirilince bırakılan görsel hemen sunucudan silinir (bir deneme kullanıyorsa korunur). Sekme kapanınca bırakılanlar 30 günü geçince geçmiş okunurken temizlenir (çağrı başına en eski 50 dosya kontrol edilir).
- Eski tarayıcı-yerel kayıt (yeni geçmişten önceki son deneme) ilk açılışta alındısıyla bir kez içe aktarılır ve tarayıcıdan silinir. Alındısı geçersiz veya süresi dolmuşsa istek numarasıyla bir uyarı gösterilir; kapatılınca tarayıcı kaydı silinir.

## Doğrulama sınırı

- Sunucu testleri (sahte servis-rol istemcisi, migration'daki tekillik kuralını uygular): kayıt-önce-gönderim, tekrar gönderimde tek ücret, alan bazlı 422'de kayıt/ücret yok, belirsiz ve geç onay, yenilemede yalnız durum okuması, depolama hatası ve yeniden deneme, eşzamanlı tamamlanmada tek kopya, kullanıcı izolasyonu, bağlantı yenileme, silme kuralları, ana uygulama yüklemesinin korunması, süresi dolanların ve terk edilmiş yüklemelerin temizlenmesi, eski alındı içe aktarma.
- Migration: yerel PGlite (PostgreSQL 17.5) üzerinde iki kez uygulanıp sözleşme testi geçti; CI `migration-contract` işi de iki kez uygulayıp aynı testi çalıştırır. Canlıya uygulanmadı.
- Panel: gerçek bileşenler, sahte API ve sahte depolama ile Chrome'da sürükle-bırak, değiştir, kaldır, yükleme ve hazırlama sırasında iptal, geç yükleme yanıtının silinmesi, yükleme sürerken model değiştirme, depolama hatası ve yeniden yükleme, büyük görselin onaylı uyarlanması ve reddi, sahte MIME, 422 modalı, ilerleme adımları, kaybolan yanıtın aynı kimlikle güvenli tekrarı, yenilemede takibin sürmesi, belirsiz denemenin kapatılması, bağlantı yenileme, durum hatasında duraklatma ve 375 px mobil görünüm denendi.
- Bu kayıtlar canlı auth, gerçek ücretli üretim, sağlayıcı çıktı kalitesi, gerçek Supabase depolama davranışı veya tüm endpoint'lerin güncel çalışırlığını kanıtlamaz. Canlı kabul ayrıca gerekir: migration'ın uygulanması, doğru admin hesabıyla erişim ve kullanıcı onayıyla tek ücretli deneme.

Model çıktısı dijital bir denemedir; özellikle GLB üretimi fiziksel ölçülü/üretime hazır dosya garantisi değildir. Relief Pro'nun kapalı bırakılan akışı bu çalışma kapsamında yeniden etkinleştirilmez.

## Önceki sürüm kaydı — 29 Eylül 2026 (PR #118)

İlk sürüm dosya yüklemiyor, yalnız son denemeyi tarayıcıda tutuyordu. O sürümün yerel kontrolleri (642 → 669 test; 320/390/768/1366 px taşma kontrolü; depolama hatasında 0 gönderim; belirsiz gönderimde yenilemeden sonra 0 yeni gönderim; PR #118 incelemesindeki dört bulgunun düzeltilmesi) PR #118 kayıtlarında durur. 2 Ekim 2026'dan itibaren bu belgedeki sunucu geçmişi akışı geçerlidir.

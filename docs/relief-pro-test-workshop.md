# Relief Pro Test Atölyesi — kapalı pilot v1

## Sınır ve ürün gerçeği

Bu dilim, daha önce doğrulanan Phase 0 CLI/finalizer'ı mevcut Renderhane oturumuna
bağlar. Tam editör, halka açık API, AI depth seçimi, semantik artwork doğrulaması veya
fiziksel üretim onayı değildir. Dome ve mevcut `outputs`/fal/kredi akışları değişmez.

Kontrol düzlemi `/tr/app/relief` ve `/api/relief/workshop`: mevcut Supabase
`getUser()` + sunucu `ADMIN_EMAILS` kontrolü. Yetkisiz kullanıcı, sahiplik hatası,
eksik worker veya bağlantı hatası başarılı boş sonuç olarak sunulmaz. Yeni Supabase
tablosu/migration gerektirmez; kapalı pilotun revizyonları worker'ın yerel kalıcı
SQLite volume'ündedir. Bu bilinçli sınır, çok kiracılı/çok bölgeli SaaS kuyruğu değildir.

## İşleyiş

1. Unsigned 16-bit absolute height PNG, binary silhouette ve opsiyonel UV/white/varnish
   katmanlarını aynı canvas üzerinde kabul et. Perspective/beauty artwork otomatik
   düzeltilmez. 32–4096 px/kenar, toplam ham PNG 2.9 MB, JSON/base64 istek 4 MB.
2. 20–140 mm genişlik, siluetten hesaplanan yükseklik, 3 mm taban,
   0.6/1.0/1.4/1.8 mm kabartma. Grid 256, gamma 1, absolute normalizasyon;
   toleranslar mevcut finalizer'da 0.02 mm geometri/depth ve 0.5 mm registration kalır.
3. Kaynak SHA-256 + recipe + native paket sürümleri + Python/OS + motor kod hash'i
   aynıysa aynı owner için aynı immutable revizyon döner. Farklı girdi yeni revizyondur.
4. `BEGIN IMMEDIATE` ile tek claim; 90 saniye lease, 5 saniye heartbeat;
   kesilmiş lease yeni attempt'a verilir. Eski lease sonucu yayımlayamaz.
   En fazla 3 attempt, attempt başına 15 dakika. Kullanıcı başına 4 aktif iş;
   pilotta toplam 200 revizyon. Worker 8 GB data bütçesi ve attempt başına 256 MB
   sınırını izler; Docker/POSIX child için tek dosya 64 MB hard limit.
   Başlangıçta, her 5 saniyede ve publish öncesinde 2 GB boş disk kontrolü vardır.
   Bunlar filesystem kotası yerine geçmez: paylaşılan production hostta ayrı
   disk/volume kotası uygulayın. Silme/retention otomatik değildir.
5. Ayrı child process mevcut `build_relief_pro_package` geçiş orchestrator'ını ve
   `finalize_package` doğrulamasını çağırır. Deprecated `build_package`/`benchmark`
   için yeni çağrı noktası oluşturulmaz. Yeni geometri motoru veya tolerans gevşetme yoktur.
6. Kaynaklar kırpılmadan coverage analizi yapılır; crop taşmayı gizleyemez.
   Piksel aralığı fiziksel crop boyutundan türetilir. Sızıntı alanı px × dx × dy;
   uzaklık anizotropik Euclidean distance transform ile piksel merkezleri arasındadır,
   continuous contour/Hausdorff veya UV yazıcı hatası değildir. Alpha/ink sample > 0
   konservatif kapsamdır; filtreleme veya ICC dönüşümü uygulanmaz.
7. Canonical finalized ZIP değiştirilmeden kanıt ZIP'ine eklenir. Yanında coverage
   raporu, revision hash ve pending fiziksel ölçüm şablonları bulunur. Bu yan raporlar
   canonical finalizer semantik onayı gibi gösterilmez. Her indirmede sahiplik,
   allowlist, dosya boyutu ve SHA-256 yeniden kontrol edilir; dosyalar public R2'ye konmaz.
   Readiness JSON atomik değiştirilir; Docker/Linux'ta dosya ve dizin girdileri
   leaf-to-root fsync edildikten sonra SQLite completed olur. Windows dev akışında
   dosyalar flush edilir; aynı directory-durability garantisi verilmez.
   Fiziksel şablonlar mevcut tasarımın gerçek hedef ölçülerine bağlanır; yalnız
   gerçekten üretilmiş depth satırlarına revision/engine kimliği yazılır. Diğer
   depth revizyonları ve bütün ölçüm/onay alanları boş/pending kalır.

`state=completed` yalnızca işin bittiğini belirtir. Geometri, coverage, semantik
örtüşme, fiziksel doğrulama ve üretim durumları ayrı gösterilir. Eksik UV seti veya
uyarılar gizlenmez. Dokusuz final GLB'den `orthographic-albedo.png` varmış gibi davranılmaz.

## Çalıştırma

Sunucu gereksinimleri: Docker Compose, kalıcı **yerel** disk (SQLite için NFS değil),
worker için en az 6 GB RAM limiti ve ek boş disk, kontrollü HTTPS reverse proxy.
Compose yalnız `127.0.0.1:8421` yayınlar. Raw API'yi internete açmayın.

1. En az 32 rastgele karakterli `RELIEF_WORKSHOP_TOKEN` değerini secret store/shell'de ayarlayın.
2. Repo kökünde `docker compose -f workers/relief/compose.workshop.yml up --build -d`.
3. Vercel/Next sunucusunda `RELIEF_WORKSHOP_ENABLED=true`, `RELIEF_WORKSHOP_URL`
   (worker'a ulaşılabilen HTTPS origin, path/query yok) ve aynı `RELIEF_WORKSHOP_TOKEN`.
   Hiçbiri `NEXT_PUBLIC_` değildir. Worker URL'si tarayıcıya verilmez.
4. Yönetici oturumuyla `/tr/app/relief` → kaynak/kullanım sınırı onayı → sentetik
   kalibrasyon → revizyon oluştur → final dosyalar/coverage/ZIP'i kontrol et.
5. Sunucu restartından sonra aynı revizyon listesini, pending işin geri alınmasını,
   indirilen dosya hash'lerini, yetkisiz/başka owner erişiminin reddini doğrulayın.

Yerel Windows geliştirmesinde aynı sabitlenmiş bağımlılıkları kullanan Python 3.11
ile `workshop_http.py` (yalnız loopback developer WSGI server) ve ayrı terminalde
`workshop_worker.py` çalışır. İkisinde `RELIEF_WORKSHOP_DATA` aynı **kalıcı** özel
dizindir; HTTP sürecinde ayrıca token gerekir. Yerel Next development HTTP loopback
worker'ı kabul eder; production build HTTP bağlantıyı reddeder. Auth bypass yoktur.

Kontrol düzlemi worker'ın başarılı JSON yanıtını route/revision/result/artifact
sözleşmesine göre doğrular; bozuk veya farklı revizyona ait yanıt 502 olur.
Yalnız arayüzün public alanları iletilir; worker dosya yolları/ek iç alanları aktarılmaz.
Artifact indirmeleri streaming kalır: SHA-256 zorunludur, gerçek byte sayısı ve hash
akış sonunda doğrulanır; son parça doğrulama tamamlanmadan gönderilmez. Eksik, fazla
veya bozuk akış başarıyla tamamlanmış indirme gibi kapanmaz. Kullanıcı bağlantıyı
keserse upstream de iptal edilir. İndirme için 270 saniye, Vercel route için 300 saniye
üst sınırı vardır; sınırsız dosya aktarımı vaat edilmez. Büyük dosya ve yavaş bağlantı
Vercel üzerinde ayrıca uçtan uca ölçülmelidir; yerel 12 MiB testi canlı platform kanıtı değildir.
SVG kesim konturu kanıt ZIP'indeki üretim adayı paketinin artwork/cut-contour.svg
dosyasındadır; aktif SVG doğrudan proxy/inline preview üzerinden sunulmaz.

Mevcut kullanıcı dosyalarını worker data dizini olarak göstermeyin. Database ve
artifact volume'ünü birlikte yedekleyin; `docker compose down -v` kanıtları siler,
normal yeniden başlatmada kullanılmamalı. Lease kurtarma elektrik kesintisi için
yeniden çalıştırma sağlar; disk/işletim sistemi hasarı için yedek yerine geçmez.

Üretime açmadan önce container build, persistent-volume restart, HTTPS erişimi,
gerçek yönetici UI → API → worker → artifact akışı ve rollout/rollback ayrıca
kanıtlanmalıdır. Yerel testlerin geçmesi bu canlı kontrollerin yerine geçmez.

## Fiziksel ve semantik kalan işler

- Same-source semantic/vector ID katmanları, geometriye karşı yerel iç kenar testi;
  renk benzerliği veya yalnız dış siluet IoU bu testi ikame etmez.
- Nihai tekstürlü geometriye bağlı ortografik albedo/raster sözleşmesi, ICC/RIP,
  alpha premultiplication, white choke/spread ve varnish profil doğrulaması.
- Gerçek cihazdan ölçülmüş hata bütçesi ve minimum çizgi/boşluk/duvar eşikleri.
- Generic 3MF için bağımsız lib3mf/slicer kontrolü. Bambu project 3MF değil.
- P1S/A1 mini × dört depth ve UV ölçüm CSV'leri, fotoğraflar, operatör/cihaz/profil
  kayıtları. Mevcut `evaluate_physical_benchmark.py` ile değerlendirilir. Sonuç
  uygun olsa bile yalnız `eligible_for_final_human_approval`; nihai onay insandadır.
- Public beta öncesi merkezi multi-tenant revision/artifact DB, object store,
  bakım/retention, kota ve operasyonel gözlemleme için ayrı migration/release gate.

Referans: [Gunicorn çalışma ayarları](https://gunicorn.org/reference/settings/),
[Gunicorn 26.2.0 paket kaydı](https://pypi.org/project/gunicorn/26.2.0/).

# Meshy 7.1 — fal.ai bağlantısı

Doğrulama tarihi: 29 Eylül 2026.

## Kapsam

- Workspace → 3D Model → Fotoğraf → AI Model altında ayrı **Meshy 7.1 — Premium** seçeneği.
- Model anahtarı: `meshy-v71`; endpoint: `meshy/v7.1/image-to-3d`.
- Mevcut Meshy 7, varsayılan seçimler, metinden 3D ve kapatılmış relief akışı değişmedi.
- Tek görselden dokulu GLB üretimi. Bu ekleme taban kalınlığı, milimetre ölçüsü, rölyef yüksekliği veya UV örtüşme garantisi vermez.

## Sağlayıcı sözleşmesi ve ücret

- [Resmî fal API şeması](https://fal.ai/models/meshy/v7.1/image-to-3d/api): `image_url` girdisi, `model_glb.url` ana çıktısı; thumbnail ve texture URL'leri ana model değildir.
- [Resmî fiyat](https://fal.ai/models/meshy/v7.1/image-to-3d): dokusuz $0.80, dokulu $1.20; rigging/animation ayrıca ücretlidir. Genel fiyat API'sindeki $0.80 tek başına dokulu üretimin maliyeti değildir.
- Renderhane: Meshy 7 ile aynı **80 kredi**. Mevcut otomatik iyileştirme seçeneği açılırsa +4 kredi.
- Standard model/geometri çözünürlüğü, texture ve remesh açık, triangle / 30.000 hedef poligon. PBR, rigging ve animation kapalı; güvenlik kontrolü açık.
- 4K, smart topology veya başka ücret etkileyen seçenekler bu sürümde arayüze eklenmedi; istemci parametre override'ları mevcut doğrulama tarafından reddedilir.
- Mevcut sunucu tarafı fal sağlayıcısı kullanılır; istemciye anahtar eklenmez.

## Yerel doğrulama

- `npm test`: 55 dosya, 583 test geçti (8 yeni test).
- `npm run type-check`, `npm run lint`, `npm run build`: geçti.
- Build, yerel ortamda `metadataBase` uyarısı verdi; bu değişiklik SEO yapılandırmasını değiştirmedi.
- Bağımsız kod incelemesi: düzeltme gerektiren bulgu yok.
- Üretim kapalı, izole yerel önizlemede gerçek `ToolFormPanel` bileşeni kontrol edildi: Meshy 7 ve 7.1 birlikte görünüyor; 7.1 seçilebiliyor; ücret 80, iyileştirme açıkken 84 kredi; tarayıcı hata kaydı yok.
- Yeni testler: kayıt/varsayılan uyumluluğu, tam endpoint yönlendirmesi, görsel alanı, ücretli parametre engeli, kuyruğa gönderim ve kredi rezervasyonu, webhook/senkron GLB seçimi.

## Henüz doğrulanmayanlar

Gerçek ücretli üretim, canlı hesap yetkisi, canlı webhook/R2 kaydı ve model kalitesi bu yerel kontrollerle kanıtlanmış değildir. Kullanıcı dosyası sağlayıcıya gönderilmedi. Push, PR, merge veya deploy yapılmadı.

Onaylı yayından sonra bir kullanıcı tarafından seçilmiş görselle tek ücretli deneme; galeri/GLB görüntüleme, indirme ve gerçek kredi muhasebesi birlikte doğrulanmalıdır. Çıkan GLB fiziksel üretim onayı değildir.

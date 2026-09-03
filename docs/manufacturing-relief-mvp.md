# Renderhane — Üretime Hazır 3D Rölyef MVP

## 1. Asıl ürün fikri

Bu özellik genel amaçlı bir “görseli rastgele 3D modele çevirme” aracı değildir.

Ana hedef, normal ışıkta kullanılacak turistik magnet, plaket, madalya, masaüstü obje ve benzeri ürünler için:

1. **Gerçek kabartmalı premium ürün** üretmek:
   - 3D yazıcı ile fiziksel rölyef/geometri,
   - aynı kaynak görselden hizalı renk/UV baskı dosyası,
   - düz arka yüz, gerçek milimetre ölçüsü ve üretime uygun gövde.
2. Ayrı bir ürün hattı olarak **epoksili standart ürün** hazırlamak:
   - 3D baskılı kontur altlık,
   - UV baskılı sticker,
   - şeffaf epoksi/doming.

MVP önceliği birinci üründür: **gerçek fiziksel rölyef + hizalı renk baskısı**.

## 2. Neden mevcut Image-to-3D akışı tek başına yeterli değil?

Rodin, Hunyuan3D, TRELLIS, Tripo ve Meshy görsel olarak ikna edici tam 3D varlıklar üretebilir. Ancak tek görselden tahmini geometri üretmeleri nedeniyle aşağıdaki üretim şartlarını garanti etmezler:

- gerçek milimetre ölçüsü,
- tamamen düz arka yüz,
- kontrollü maksimum rölyef yüksekliği,
- minimum duvar ve taban kalınlığı,
- manifold/watertight mesh,
- magnet yuvası veya masa ayağı,
- düz tablaya basılabilir yönelim,
- UV baskı görseli ile bire bir koordinat eşleşmesi.

Bu nedenle `3d-model` aracının yanına ayrı ve deterministik bir `manufacturing-relief` iş akışı eklenmelidir.

## 3. MVP girdi sözleşmesi

Zorunlu:

- `image_url`
- `width_mm`
- `height_mm`
- `base_thickness_mm`
- `relief_depth_mm`

Opsiyonel:

- `shape_mode`: `rectangle | silhouette | badge`
- `depth_mode`: `soft | medium | strong | custom`
- `invert_depth`
- `background_remove`
- `edge_margin_mm`
- `corner_radius_mm`
- `magnet_pocket`: `{ enabled, diameter_mm, depth_mm, count }`
- `hanging_hole`: `{ enabled, diameter_mm, offset_mm }`
- `surface_smoothing`
- `minimum_feature_mm`
- `output_formats`: `glb | stl | 3mf | uv_png | depth_png | preview_png`

Başlangıç varsayılanları:

- genişlik: `70 mm`
- yükseklik: `70 mm`
- taban: `3.0 mm`
- rölyef: `1.2 mm`
- minimum özellik: `0.6 mm`
- kenar payı: `1.2 mm`

## 4. İşleme hattı

```text
Kaynak görsel
  → arka plan ayırma / dış kontur
  → depth map üretimi
  → depth map ton eğrisi ve maskeleme
  → kontrollü height-field mesh
  → taban ve yan duvarlar
  → düz arka yüz
  → opsiyonel magnet yuvası / askı deliği
  → manifold kontrolü ve onarım
  → gerçek mm ölçekleme
  → GLB + STL
  → aynı UV koordinatından baskı PNG'si
  → doğrulama raporu
```

## 5. Çıktılar

MVP’nin güvenilir ilk çıktıları:

- `model.glb`: web önizleme ve arşiv,
- `model.stl`: dilimleyiciye aktarılabilir üretim geometrisi,
- `uv-print.png`: rölyef ile aynı koordinat sistemindeki baskı dosyası,
- `depth-map.png`: kullanıcı kontrolü ve yeniden üretim,
- `preview.png`: Renderhane sonuç kartı,
- `manufacturing-report.json`: ölçü, üçgen sayısı, sınır kutusu, manifold durumu, minimum kalınlık ve uyarılar.

### 3MF hakkında dürüst sınır

Genel amaçlı bir 3MF mesh dosyası üretilebilir. Ancak Bambu Studio proje 3MF’si yalnızca geometri değildir; yazıcı, filament, tabla, yönelim ve dilimleme ayarları da taşıyabilir. İlk sürümde geometri güvenilirliği doğrulanmadan “tam Bambu baskıya hazır proje” iddiası yapılmamalıdır.

İlk aşamada:

1. GLB + STL + UV PNG,
2. ardından genel 3MF,
3. son olarak Bambu Studio/CLI entegrasyonu değerlendirilmelidir.

## 6. Kalite kapıları

Bir iş `completed` sayılmadan önce:

- mesh manifold/watertight olmalı,
- açık kenar bulunmamalı,
- arka yüz düz olmalı,
- ölçüler tolerans içinde olmalı,
- taban kalınlığı hedefin altına düşmemeli,
- rölyef hedef maksimum yüksekliği aşmamalı,
- küçük adacıklar ve baskıda kaybolacak detaylar raporlanmalı,
- UV görseli ile mesh dış konturu eşleşmeli.

Doğrulanamayan çıktı “üretime hazır” etiketi almamalı; `needs_review` durumuna geçmelidir.

## 7. Renderhane entegrasyonu

Önerilen araç anahtarı:

- `manufacturing-relief`

Önerilen model/işlem ayrımı:

- AI modeli: depth map ve isteğe bağlı görsel hazırlama,
- Renderhane işlemcisi: ölçülü mesh, taban, cep, onarım ve dışa aktarma.

Mevcut Fal iş kuyruğu, webhook, R2 ve sonuç galerisi korunabilir. Geometri işleme, Next.js request süresine bağlı kalmayan ayrı bir worker/job adımı olarak yürütülmelidir.

## 8. MVP dışında bırakılanlar

- tam 360° heykel/figür üretimi,
- otomatik çok parçalı renk ayrımı,
- doğrudan G-code üretimi,
- tüm Bambu dilimleme ayarlarının otomatik seçimi,
- rastgele derin kabartılı yüzeye UV kafa yolu hesaplama,
- epoksi dozaj/üretim otomasyonu.

## 9. Başarı ölçütü

İlk doğrulama ürünü 70 × 70 mm bir Kapadokya/şehir magnetidir.

Başarılı MVP:

- yüklenen renderdan tekrarlanabilir biçimde aynı ölçülü rölyefi üretir,
- STL dilimleyicide hatasız açılır,
- düz arka yüzle destek gerektirmeden basılır,
- baskı PNG’si fiziksel rölyef konturuna hizalanır,
- kullanıcıya hatalı veya riskli geometriyi dürüstçe bildirir.

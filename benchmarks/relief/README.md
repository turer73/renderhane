# Relief Pro Benchmark

Bu klasör Renderhane'nin **gerçek kabartmalı ürün + hizalı UV baskı** sisteminin model, algoritma ve fiziksel üretim kararlarını ölçmek için kullanılır.

Bu benchmark'ın amacı yalnızca görsel olarak hoş bir depth map seçmek değildir. Nihai soru şudur:

> Hangi kaynak hazırlama, depth/normal bileşimi ve relief reçetesi; en az kullanıcı düzeltmesiyle, doğru ölçülü, manifold ve fiziksel olarak kabul edilebilir ürünü üretir?

## Ürün sınırı

Birinci ürün: **Relief Pro**

- fiziksel 3D rölyef,
- aynı canvas ve koordinat sisteminde UV renk dosyası,
- gerçek milimetre ölçüsü,
- düz arka yüz,
- parametrik magnet/askı/ayak,
- doğrulanmış GLB + generic 3MF + STL,
- üretilebilirlik raporu.

İkinci ürün olan **Dome** (3D altlık + sticker + epoksi), ayrı benchmark ve ürün hattı olarak ele alınacaktır.

## Klasör düzeni

```text
benchmarks/relief/
├── README.md
├── benchmark.schema.json
├── manifest.json
├── cases/
│   └── <case-id>/
│       ├── source/
│       │   ├── concept-render.*
│       │   ├── front-master.png
│       │   ├── foreground-mask.png
│       │   ├── semantic-layers.png
│       │   └── text-logo.svg
│       ├── ground-truth/
│       │   ├── manual-relief-map-16.png
│       │   └── notes.md
│       ├── candidates/
│       │   ├── depth-anything-v2-small/
│       │   ├── midas/
│       │   └── marigold/
│       ├── builds/
│       │   ├── 0.6mm/
│       │   ├── 1.0mm/
│       │   ├── 1.4mm/
│       │   └── 1.8mm/
│       └── physical/
│           ├── p1s/
│           ├── a1-mini/
│           └── uv/
└── reports/
```

Büyük ikili dosyalar Git deposuna doğrudan eklenmemeli; R2 veya Git LFS kullanımı ayrıca kararlaştırılmalıdır. Manifest ve ölçüm raporları Git'te tutulmalıdır.

## Front Manufacturing Master kabul şartları

Bir örnek `master_ready` sayılmadan önce:

- tam karşıdan ve perspektifsiz olmalı,
- ürünün yan veya arka yüzü görünmemeli,
- stüdyo zemini ve dış gölge bulunmamalı,
- şeffaf alfa ya da temiz düz arka plan kullanmalı,
- tek, kapalı ve doğrulanmış dış kontura sahip olmalı,
- ürün canvas kenarına değmemeli,
- metin ve logolar mümkün olduğunca SVG/vektör olarak ayrılmalı,
- source, masks, vector layers ve UV artwork aynı piksel canvas'ını kullanmalı,
- minimum uzun kenar 2048 px olmalı,
- renk profili sRGB olarak kaydedilmeli,
- üretim en-boy oranı manifestte açıkça belirtilmeli.

Açılı konsept renderlar yalnızca referanstır; doğrudan üretim girdisi sayılmaz.

## 30 örneklik veri seti

- 10 turistik kompozisyon
- 5 portre
- 5 logo/metin ağırlıklı tasarım
- 5 tek obje
- 5 zor/edge-case

Her örnek için lisans, kaynak, izin, kategori, zorluk ve hedef ürün bilgisi manifestte bulunmalıdır.

## Depth adayları

İlk benchmark:

1. Depth Anything V2 Small
2. MiDaS
3. Marigold depth
4. Opsiyonel normal haritası kaynağı

Ham model çıktısı değiştirilmeden saklanır. Normalizasyon, inversion, percentile clamp, gamma ve smoothing ayrı recipe alanları olarak kaydedilir.

## Relief bileşimi

Nihai relief yalnızca tek bir monocular depth çıktısı değildir:

```text
final_relief =
    global_depth
  + semantic_layer_offsets
  + local_normal_detail
  + vector_text_and_logo
  + user_brush_edits
```

Asıl sürümlendirilen kaynak `relief-map-16.png` ve recipe parametreleridir. Mesh türetilmiş artifact'tir.

## Fiziksel reçete başlangıcı

Golden case için başlangıç:

- ürün: magnet
- genişlik/yükseklik: 70 × 70 mm veya master oranına bağlı fit
- taban: 3.0 mm
- relief: 0.6 / 1.0 / 1.4 / 1.8 mm
- minimum özellik: 0.6 mm
- kenar payı: 1.2 mm
- arka yüz: tamamen düz
- nozzle: 0.4 mm
- test yazıcıları: Bambu P1S ve A1 mini

Bu değerler varsayım değil, fiziksel test sonunda güncellenecek başlangıç değerleridir.

## Skorlama

Toplam 100 puan:

| Alan | Puan |
|---|---:|
| Semantik ön/arka sıralama | 20 |
| Kenar ve siluet doğruluğu | 15 |
| Yerel detay korunumu | 10 |
| Metin/logo güvenliği | 10 |
| Manuel düzeltme süresi | 15 |
| Mesh doğrulama | 15 |
| Fiziksel baskı kabulü | 10 |
| UV hizalama | 5 |

### Zorunlu kapılar

Puan yüksek olsa bile aşağıdakilerden biri başarısızsa çıktı `production_ready` değildir:

- watertight/manifold değilse,
- açık edge varsa,
- self-intersection varsa,
- fiziksel ölçü tolerans dışındaysa,
- minimum taban kalınlığı ihlal edilmişse,
- UV hizalama hatası kalibre profilde 0.5 mm'yi aşıyorsa.

## Durumlar

- `planned`
- `source_ready`
- `master_ready`
- `candidates_ready`
- `mesh_ready`
- `printed`
- `uv_tested`
- `accepted`
- `rejected`

## Tekrarlanabilirlik

Her build raporu şunları taşımalıdır:

- source SHA-256
- relief-map SHA-256
- mask/vector SHA-256
- recipe JSON
- engine adı ve sürümü
- dependency/container digest
- timestamp
- mesh bounds, face/vertex sayısı ve hacim
- validation sonuçları

Aynı kaynak, recipe ve engine sürümü aynı fiziksel bounds ve aynı topoloji sonucunu üretmelidir.

## Phase 0 çıkış kriteri

Kapadokya golden master ve 30 örneklik manifest tamamlanmış; üç depth yaklaşımı ölçülmüş; dört relief derinliği P1S/A1 mini'de basılmış; UV kalibrasyon kuponu değerlendirilmiş ve varsayılan recipe tahmin yerine veriye göre seçilmiş olmalıdır.

# Renderhane Relief Geometry Worker — Phase 0

Bu klasör, sürümlenmiş bir **16-bit mutlak rölyef haritasını** gerçek fiziksel ölçülerde, doğrulanabilir üretim geometrisine dönüştüren bağımsız prototipi içerir. Eski 8-bit/percentile girdiler yalnız açık uyumluluk yolu olarak tutulur; kanonik manufacturing master veya fiziksel üretim kanıtı sayılmaz.

Asıl ürün **Relief Pro**’dur: gerçek fiziksel kabartma ile aynı koordinat sisteminden üretilmiş UV renk katmanlarının birlikte teslim edilmesi. Epoksili **Dome** ürünü ayrı bir hattır.

## Ürün gerçeği

Bu worker:

- tam 3D varlık tahmin etmez,
- Rodin/Hunyuan/TRELLIS çıktısını doğrudan üretim dosyası saymaz,
- milimetre ölçüsü, taban, dış siluet, mesh topolojisi ve export doğrulamasını deterministik kodla yapar,
- dijital test geçse bile fiziksel P1S/A1 mini ve UV testini zorunlu bırakır.

## Kanonik API ve migration sınırı

- İç public API: `relief_engine`.
- Kararlı CLI/uyumluluk facade'ı: `relief_builder.py`.
- Kanonik Phase 0 orchestrator: `run_phase0_benchmark.py`.
- `product_relief_builder.py`, `build_relief_pro_package.py` ve `run_phase0.py`; pocket, front-master ve package-finalizer davranışları kanonik çekirdeğe taşınana kadar geçiş hattıdır.
- `benchmark.py` ve `build_package.py` deprecated paralel uyumluluk/orchestration yollarıdır; ince facade değildir ve yeni çağrı noktaları eklenmemelidir.

Bu modüller Phase A içinde silinmez. Önce benzersiz yetenekler ve çağıran workflow/testler kanonik API'ye migrate edilmeli, ardından kaldırma ayrı ve ölçülebilir bir değişiklik olarak yapılmalıdır.

## Şu anda yaptığı işler

- Kanonik `BuildRecipe` ve geçiş `ProductRecipe` yollarında yalnız gerçek unsigned 16-bit grayscale PNG'yi mutlak yükseklik master'ı kabul eder.
- `normalization_mode=absolute` varsayılandır; 16-bit kod değerlerini 65535'e bölüp yükseklik oranlarını korur.
- `normalization_mode=robust` yalnız açık opt-in uyumluluk modudur ve percentile clamp uygular.
- Legacy 8-bit girdiler yalnız `normalization_mode=robust` ile advisory eşliğinde kabul edilir; production master değildir.
- Dikdörtgen kalibrasyon plakası veya maskeye bağlı tek parçalı dış siluet üretir.
- Dış siluette kopuk adaları, noktasal temasları ve Phase 0’da desteklenmeyen iç delikleri reddeder.
- Robust modda percentile clamp; her iki modda gamma, inversion ve Gaussian smoothing uygular.
- Gerçek X/Y ölçüsünü, taban kalınlığını ve maksimum rölyef derinliğini uygular.
- Düz arka yüzlü, watertight/manifold tek hacim oluşturur.
- STL’yi milimetre, GLB’yi metre, generic 3MF’yi milimetre biriminde dışa aktarır.
- STL/GLB/3MF dosyalarını tekrar açarak ölçü ve watertight kontrolü yapar.
- Kaynakla aynı dönüşümü kullanan UV renk, white mask, varnish mask ve siluet maskesi üretir.
- Fiziksel `contour.svg` ve registration overlay üretir.
- Artifact SHA-256 değerlerini, reçete hash’ini, birimleri, bounds ve sınırlamaları raporlar.
- Aynı girdi, reçete ve yazılım ortamında byte-deterministic dosyalar üretir.

## Semantic label → canonical height compiler

Semantic label artwork, fiziksel rölyef yüksekliğinin upstream girdisidir. Compiler
etiket PNG'sini **aynı piksel tuvalinde** okur; resize, crop, fitting veya resampling
yapmaz. `L` (uint8) ve unsigned 16-bit PNG etiketleri kabul edilir. Reçete alanları
strict'tir: bilinmeyen alanlar, tekrar eden stable ID/rank/name değerleri ve etikette
bulunmayan/fazladan ID'ler fail-closed reddedilir.

Her region'ın fiziksel kenar/plateau yüksekliği, profil ve mm cinsinden bevel'i
anisotropic pixel pitch (`W/N`, `H/M`) ile değerlendirilir. Candidate/detail girdileri
yalnız aynı canvas'ta bounded yardımcı sinyallerdir; `candidate_orientation` ile
direct/inverted seçilebilir. Çıktı tek-valued bir heightfield'dir.
Minimum-feature, component çapı, plateau, detail clipping ve fiziksel yüzey eğimi
(max/p95, yalnız diagnostik) rapora yazılır.

```bash
python compile_semantic_relief.py \
  --labels /path/to/semantic-labels.png \
  --recipe /path/to/semantic-recipe.json \
  --output /tmp/semantic-relief \
  --width-mm 70 --height-mm 70 --relief-depth-mm 1.2 \
  --minimum-feature-mm 0.6 \
  --depth-candidate /path/to/candidate.png \
  --detail-source /path/to/detail.png
```

Çıktı `relief-map-16.png` içinde mutlak yüksekliği tek seferlik half-up uint16
kuantizasyonuyla, `silhouette-mask.png` içinde aynı label canvas'ının aktif maskesini
taşır. `semantic-relief-report.json` canonical recipe hash'ini ve ayrı durumları
(`compiler_status`, `physical_validation_status=pending`,
`production_status=not_approved_pending_physical_validation`) içerir. Dijital
compiler doğrulaması fiziksel baskı/UV/RIP onayı değildir.

## Bilinçli Phase 0 sınırları

Kanonik `relief_engine` çekirdeğinde henüz şunlar yoktur:

- magnet yuvası veya askı deliği boolean işlemi,
- UV artwork/normal-map görünüm katmanlarının compiler çıktısıyla otomatik birleşimi
  (semantic label → height compiler ayrı ve kanonik bir upstream aşamadır),
- otomatik minimum yazdırılabilir detay analizi,
- Bambu Studio’ya özel proje 3MF profili,
- üretim uygulamasındaki workflow/queue entegrasyonu,
- fiziksel UV kafa açıklığı garantisi.

Geçiş hattındaki `product_relief_builder.py` deneysel magnet pocket üretebilir; bu seçenek zorunlu bridge/retention/orientation uyarısı verir ve dijital sonucu en fazla `needs_review` yapar.

Siluet modu yalnızca **tek, deliksiz ve 4-bağlantılı** dış formu kabul eder. İç delik veya bir noktada birleşen bölgeler yanlış/tehlikeli topoloji üretmemesi için reddedilir.

## Kurulum

```bash
cd workers/relief
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
python -m pip install -r requirements-dev.txt
```

## Tek model oluşturma

```bash
python relief_builder.py \
  --relief-map /path/to/relief-map-16.png \
  --mask /path/to/alpha-mask.png \
  --shape-mode silhouette \
  --uv-artwork /path/to/uv-print.png \
  --white-mask /path/to/white-mask.png \
  --varnish-mask /path/to/varnish-mask.png \
  --out-dir /tmp/renderhane-relief \
  --width-mm 70 \
  --base-thickness-mm 3.0 \
  --relief-depth-mm 1.2 \
  --normalization-mode absolute \
  --grid-long-edge 256 \
  --artwork-long-edge-px 2048
```

`--height-mm` verilmezse, siluet crop oranı korunur. Açıkça farklı bir yükseklik verilirse rapor aspect-ratio değişimini advisory olarak gösterir.

## Çıktı

```text
out-dir/
├── model.stl                         # milimetre
├── model.glb                         # metre; web önizleme
├── model.3mf                         # generic 3MF, milimetre
├── relief-map-normalized-16.png
├── height-preview.png
├── uv-print-aligned.png              # verilmişse
├── white-mask-aligned.png            # verilmişse
├── varnish-mask-aligned.png          # verilmişse
├── silhouette-mask-aligned.png       # mask verilmişse
├── contour.svg                       # fiziksel dış kontur
├── registration-overlay.svg
├── manufacturing-report.json
├── artifact-manifest.json
└── manufacturing-package.zip
```

Rapor iki ayrı durum taşır:

- `digital_status`: `validated | needs_review`
- `production_status`: `physical_validation_required | blocked`

Dijital doğrulama geçmesi, fiziksel üretimin doğrulandığı anlamına gelmez.

Geçiş paketleyicisi ve finalizer `ready | needs_review | failed` dijital paket statüsü kullanır. Her uyarı sonucu `needs_review` durumuna düşürür. Bu alanlardaki `ready` yalnız dijital artifact kapsamındadır; her iki aşamada da `physical_validation_status=pending` ve `production_status=not_approved_pending_physical_validation` korunur.

Relief Pro geçiş paketi manifest sözleşmesi v3'tür. V3; reçete hash'ini, original UV/white/varnish kaynaklarını, registration v2'yi ve türetilmiş artwork/contour/projection provenance zincirini zorunlu doğrular. Finalizer ayrıca paketlenmiş 16-bit height map, mask ve reçeteden kanonik geometriyi geçici dizinde yeniden üretir; normalized height/mask, STL, GLB, 3MF ve manufacturing report birebir uyuşmadan paketi mühürlemez. Byte eşitliği aynı engine/toolchain sözleşmesini gerektirir; farklı builder veya bağımlılık sürümüyle üretilmiş paket fail-closed davranır ve güncel ortamda yeniden build edilmelidir. Unsigned manifest iç tutarlılığı kanıtlar, onaylı harici kaynağın kimliğini kanıtlamaz. Manifest v1/v2 veya registration v1 paketleri sessizce yükseltilmez ya da üretime hazır sayılmaz; güncel builder ile yeniden oluşturulmaları gerekir.

### Geçiş paketi registration v2 / manifest v3

`build_relief_pro_package.py` artık final `geometry/model.glb` dosyasını kaynak
maskeden bağımsız olarak, fiziksel XY sınırları sabitlenmiş +Z ortografik kamerayla
CPU üzerinde yeniden rasterize eder. Doğrulama tuvalinin uzun kenarı en az 1120
pikseldir; örnek konumu piksel merkezi `(0.5, 0.5)` ve GLB birimi metre → milimetre
dönüşümü açıktır. Paket şu ilave kanıtları taşır:

- `geometry/final-glb-orthographic-silhouette.png`,
- `geometry/final-glb-orthographic-depth-16.png`,
- `geometry/final-glb-orthographic-projection.json`,
- final GLB silüetinden türetilen `artwork/cut-contour.svg`,
- `reports/final-glb-silhouette-registration-report.json`,
- `reports/final-glb-silhouette-overlay.png`,
- `reports/final-glb-depth-registration-report.json`,
- `reports/final-glb-depth-difference.png`.

`artwork/registration.json` sözleşmesi v2; source/crop/artwork/verification
canvas'larını, piksel pitch değerlerini, model eksenlerini, pixel-edge matrislerini,
depth kodlamasını, resampling/alpha politikasını, renk profili varsayımını ve katman
niyetlerini açıkça taşır. Finalizer saklanan projeksiyonu kabul etmekle yetinmez;
aynı final GLB'yi yeniden rasterize edip silhouette, depth ve projection kanıtlarını
yeniden üretir. Source contour ile GLB contour arasında iki yönlü fiziksel mesafe,
IoU ve symmetric-difference hesaplanır. Kaynaktan taze yeniden oluşturulan kanonik
heightfield ile final GLB depth rasterı ayrıca `0.02 mm` geometri toleransında
max/p95/mean/RMS ve signed-error ölçümleriyle karşılaştırılır.

CPU projeksiyonu 600.000'den fazla görünür üçgende kaynak tüketimini sınırlamak için
fail-closed davranır; bu sınır geometri onayı değildir. Builder ayrıca downsample
sonrasında kaynak silüetin üst/alt/sol/sağ ekstremumlarından biri kaybolursa paketi
üretmez ve `grid_long_edge` artışı ister. Böylece nominal fiziksel model çerçevesi ile
gerçek GLB XY sınırlarının sessizce ayrışması önlenir.

Siluet kapısı ölçümü `[max-U, max+U]` aralığıyla değerlendirir: üst sınır tolerans
içindeyse `pass`, alt sınır dışarıdaysa `fail`, aralık toleransla kesişiyorsa
`needs_review` olur. `U` bir verification-pixel diagonali kadardır. Mesh
discretisation hatası belirsizliğe saklanmaz; doğrudan ölçülen farktır. Hiçbir
durumda kullanıcı toleransı genişletilmez.

Bu sözleşme dış kontur/cut ve derinlik hizasını bağımsız geometri kanıtına bağlar;
untextured GLB'den renk, white ink veya varnish semantiği çıkardığını iddia etmez.
Manifest dosya varlığını `artwork_file_set_status`, yerel semantik doğrulamayı ise
ayrı `artwork_semantic_registration_status=not_validated` alanıyla taşır; eksiksiz
dosya seti semantik registration onayı değildir.
V2 içindeki `layer_intents` alanları beyan/provenance bilgisidir; yerel motif
correspondence, RIP renk dönüşümü, white choke/spread, varnish modu ve gerçek
printer/material sapması fiziksel kalibrasyon olmadan doğrulanmış sayılmaz. Dijital
`ready` hâlâ `production_ready` değildir.
Üretim yolları dolu output dizinini yalnız kendi regular, non-link ve tam içerikli sahiplik marker'ı mevcutsa yeniler. Kaynaklardan biri output dizininin içindeyse rerun reddedilir. Deprecated `build_package.py` için daha önce üretilmiş markersız dizinler yerinde yükseltilmez; yeni/boş bir output dizinine rebuild gerekir.

## Dört derinlikli Phase 0 paketi

```bash
python run_phase0_benchmark.py \
  --relief-map /path/to/manual-relief-map-16.png \
  --mask /path/to/alpha-mask.png \
  --front-master /path/to/front-master.png \
  --uv-artwork /path/to/uv-print.png \
  --white-mask /path/to/white-mask.png \
  --varnish-mask /path/to/varnish-mask.png \
  --out-dir /tmp/kapadokya-phase0 \
  --width-mm 70 \
  --base-thickness-mm 3 \
  --depths 0.6,1.0,1.4,1.8
```

Çıkış klasörü boş olmalıdır. Bu kural eski ve yeni artifact’ların yanlışlıkla aynı pakete karışmasını önler.

Paket içinde:

- dört ayrı 3MF/STL/GLB seti,
- dijital benchmark özeti,
- değerlendiriciyle uyumlu `fdm-physical-measurements-v2.csv`,
- değerlendiriciyle uyumlu `uv-physical-measurements-v2.csv`,
- eski çağıranlar için aynı FDM formunun `physical-measurements.csv` kopyası,
- UV test talimatı,
- fiziksel karar alanları

bulunur. Varsayılan rölyef derinliği fiziksel sonuçlar kaydedilene kadar `null` kalır.

## UV yükseklik kuponu

```bash
python generate_uv_clearance_coupon.py \
  --out-dir /tmp/renderhane-uv-coupon
```

Kupon 3 mm taban üzerinde 0.0 / 0.6 / 1.0 / 1.4 / 1.8 mm yükseltilmiş bölgeler içerir. **UV operatörünün güvenli kafa açıklığı onayı olmadan makineye konulmamalıdır.**

## Gerçek fiziksel doğrulama kiti

Hak sorunu olmayan kalibrasyon tasarımından dört FDM varyantı, final GLB'den
bağımsız semantik türetim kanıtı, UV yükseklik kuponu ve v2 ölçüm formları üretmek
için:

```bash
python prepare_physical_validation_kit.py \
  --out-dir /tmp/renderhane-relief-physical-kit \
  --jobs 1
```

Kalibrasyon profili `grid_long_edge=512` kullanır. 256 ve 384 gridleri sabit
semantik eşiklerde ok bölgesini geçemediği için eşikler genişletilmemiştir. 512
profilinde final GLB depth rasterı ve hizalı UV artwork ayrı algoritmalarla stable-ID
haritalarına dönüştürülür; karşılaştırma aşamasında translation/scale/warp fitting
yapılmaz. Bu türetim yalnız analitik `calibration-v1` fixture'ı içindir; arbitrary
untextured müşteri GLB'sinden semantik anlam çıkarıldığı iddia edilmez.

Çıktıdaki `PRINT-AND-MEASURE.md` gerçek P1S/A1 mini ve UV/RIP/ICC prosedürüdür.
Boş fiziksel formlar nedeniyle ilk `physical_gate=incomplete` ve
`production_status=not_approved` sonucu bilinçli davranıştır.

## Test

```bash
python -m pytest workers/relief/tests -q
```

Testler şu alanları kapsar:

- fiziksel bounds ve birim dönüşümü,
- watertight, winding, hacim ve açık kenarlar,
- STL/GLB/3MF yeniden yükleme,
- byte determinism,
- dış siluet ve kontur,
- final GLB'nin sabit fiziksel kameradan bağımsız yeniden projeksiyonu,
- asimetrik mirror/translation negatif enjeksiyonları,
- kaynak heightfield ile final GLB arasında fiziksel derinlik farkı,
- source-derived proxy mask spoof reddi,
- alt-pixel/crop/transform ve dijital belirsizlik aralığı,
- kopuk bölge/iç delik reddi,
- UV katmanlarının ortak koordinat dönüşümü,
- aspect-ratio advisory,
- geçersiz veya tehlikeli reçete reddi,
- stale benchmark klasörü reddi,
- dört-derinlik paketinin fiziksel kararı açık bırakması,
- UV clearance kuponu,
- final GLB depth ile hizalı artwork'ten bağımsız kalibrasyon semantiği.

## Phase 0 çıkış kapısı

Dijital çekirdeğin tamamlanması için testlerin ve CI smoke benchmark’ının geçmesi gerekir. **Issue #53 ancak dört derinlik P1S ve A1 mini’de basılıp UV kuponu ölçüldüğünde kapanmalıdır.**

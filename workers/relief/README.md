# Renderhane Relief Geometry Worker — Phase 0

Bu klasör, AI ile hazırlanmış veya elle düzenlenmiş bir **8/16-bit rölyef haritasını** gerçek fiziksel ölçülerde, doğrulanabilir üretim geometrisine dönüştüren bağımsız prototipi içerir.

Asıl ürün **Relief Pro**’dur: gerçek fiziksel kabartma ile aynı koordinat sisteminden üretilmiş UV renk katmanlarının birlikte teslim edilmesi. Epoksili **Dome** ürünü ayrı bir hattır.

## Ürün gerçeği

Bu worker:

- tam 3D varlık tahmin etmez,
- Rodin/Hunyuan/TRELLIS çıktısını doğrudan üretim dosyası saymaz,
- milimetre ölçüsü, taban, dış siluet, mesh topolojisi ve export doğrulamasını deterministik kodla yapar,
- dijital test geçse bile fiziksel P1S/A1 mini ve UV testini zorunlu bırakır.

## Şu anda yaptığı işler

- 8/16-bit gri tonlu rölyef haritası okur.
- Dikdörtgen kalibrasyon plakası veya maskeye bağlı tek parçalı dış siluet üretir.
- Dış siluette kopuk adaları, noktasal temasları ve Phase 0’da desteklenmeyen iç delikleri reddeder.
- Percentile clamp, gamma, inversion ve Gaussian smoothing uygular.
- Gerçek X/Y ölçüsünü, taban kalınlığını ve maksimum rölyef derinliğini uygular.
- Düz arka yüzlü, watertight/manifold tek hacim oluşturur.
- STL’yi milimetre, GLB’yi metre, generic 3MF’yi milimetre biriminde dışa aktarır.
- STL/GLB/3MF dosyalarını tekrar açarak ölçü ve watertight kontrolü yapar.
- Kaynakla aynı dönüşümü kullanan UV renk, white mask, varnish mask ve siluet maskesi üretir.
- Fiziksel `contour.svg` ve registration overlay üretir.
- Artifact SHA-256 değerlerini, reçete hash’ini, birimleri, bounds ve sınırlamaları raporlar.
- Aynı girdi, reçete ve yazılım ortamında byte-deterministic dosyalar üretir.

## Bilinçli Phase 0 sınırları

Henüz şunlar yoktur:

- magnet yuvası veya askı deliği boolean işlemi,
- semantik katman/normal map birleşimi,
- otomatik minimum yazdırılabilir detay analizi,
- Bambu Studio’ya özel proje 3MF profili,
- üretim uygulamasındaki workflow/queue entegrasyonu,
- fiziksel UV kafa açıklığı garantisi.

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
- P1S/A1 mini ölçüm formu,
- UV test talimatı,
- fiziksel karar alanları

bulunur. Varsayılan rölyef derinliği fiziksel sonuçlar kaydedilene kadar `null` kalır.

## UV yükseklik kuponu

```bash
python generate_uv_clearance_coupon.py \
  --out-dir /tmp/renderhane-uv-coupon
```

Kupon 3 mm taban üzerinde 0.0 / 0.6 / 1.0 / 1.4 / 1.8 mm yükseltilmiş bölgeler içerir. **UV operatörünün güvenli kafa açıklığı onayı olmadan makineye konulmamalıdır.**

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
- kopuk bölge/iç delik reddi,
- UV katmanlarının ortak koordinat dönüşümü,
- aspect-ratio advisory,
- geçersiz veya tehlikeli reçete reddi,
- stale benchmark klasörü reddi,
- dört-derinlik paketinin fiziksel kararı açık bırakması,
- UV clearance kuponu.

## Phase 0 çıkış kapısı

Dijital çekirdeğin tamamlanması için testlerin ve CI smoke benchmark’ının geçmesi gerekir. **Issue #53 ancak dört derinlik P1S ve A1 mini’de basılıp UV kuponu ölçüldüğünde kapanmalıdır.**

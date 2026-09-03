# Renderhane Relief Geometry Worker — Phase 0

Bu klasör, 16-bit bir relief haritasını gerçek fiziksel ölçülerde kapalı hacme dönüştüren bağımsız prototipi içerir.

## Bu sürüm ne yapar?

- 8/16-bit gri tonlu relief haritası okur.
- Fiziksel genişlik, taban kalınlığı ve maksimum rölyef derinliği uygular.
- En-boy oranından yüksekliği otomatik çözebilir.
- Percentile clamp, gamma, inversion ve Gaussian smoothing uygular.
- Düz arka yüzlü, dikdörtgen bir watertight mesh üretir.
- STL'yi milimetre, GLB'yi metre biriminde dışa aktarır.
- Normalize edilmiş 16-bit relief haritası ve üretim raporu üretir.
- Aynı girdilerle deterministik dosya çıktısı verir.

## Bilinçli kapsam sınırı

Bu prototip henüz:

- alfa maskesine göre dış silueti kesmez,
- magnet yuvası açmaz,
- askı/ayak geometrisi eklemez,
- 3MF üretmez,
- UV baskı maskesi üretmez,
- semantic layer veya normal-map birleşimi yapmaz,
- doğrudan Renderhane job sistemine bağlı değildir.

Mask verilirse Phase 0'da yalnızca mask dışındaki rölyef yüksekliği sıfırlanır; dikdörtgen taban korunur. Bu davranış bilinçlidir ve raporda ürün özelliği olarak kabul edilmemelidir.

## Kurulum

```bash
cd workers/relief
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements-dev.txt
```

## Kullanım

```bash
python relief_builder.py \
  --relief-map /path/to/relief-map-16.png \
  --out-dir /tmp/renderhane-relief \
  --width-mm 70 \
  --base-thickness-mm 3.0 \
  --relief-depth-mm 1.2 \
  --grid-long-edge 256
```

Opsiyonel:

```bash
  --height-mm 70 \
  --mask /path/to/mask.png \
  --percentile-low 2 \
  --percentile-high 98 \
  --gamma 1.0 \
  --smoothing-sigma-px 1.0 \
  --invert-depth
```

## Çıktı

```text
out-dir/
├── model.stl                       # mm
├── model.glb                       # metres; web preview
├── relief-map-normalized-16.png
└── manufacturing-report.json
```

Rapor şu kontrolleri içerir:

- watertight
- winding consistency
- closed volume
- açık kenar sayısı
- vertex/face sayısı
- fiziksel bounds
- hacim
- Z aralığı
- uyarılar
- production status

## Test

```bash
pytest -q
```

Testler:

- doğru fiziksel ölçüyü,
- watertight ve sıfır açık kenarı,
- STL/GLB birim dönüşümünü,
- mask davranışını,
- dosya bazında deterministik çıktıyı,
- geçersiz reçete reddini

doğrular.

## Yerel doğrulama sonucu

Sentetik 96 × 64, 16-bit relief haritası; `70 mm` genişlik, `3.0 mm` taban, `1.2 mm` rölyef ve `128 px` grid ile test edildi:

```text
extents:            70.000000 × 46.666667 × 4.200000 mm
watertight:         true
winding_consistent: true
is_volume:          true
open_edge_count:    0
euler_number:       2
production_status:  ready
```

Aynı test iki kez çalıştırıldığında STL, GLB, 16-bit PNG ve JSON rapor SHA-256 değerleri bire bir aynı çıktı.

## Sonraki teknik adım

1. Siluet maskesinden kapalı 2D poligon üretme.
2. Poligon içi height-field triangulation.
3. Manifold3D ile magnet yuvası boolean işlemi.
4. Generic 3MF export ve doğrulama.
5. Kapadokya golden master ile fiziksel P1S/A1 mini testi.

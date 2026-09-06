# UV appearance yardımcı katmanı

`build_uv_appearance.py`, canonical unsigned-16 relief map, zorunlu 0/255 L PNG
silhouette mask, same-canvas RGB artwork ve explicit `relief_depth_mm` girdisinden
deterministic gölgeleme, virtual normal, appearance-varnish mask ve RIP job ticket
üretir. Normal, `h_mm=relief_depth_mm*q/65535` ile fiziksel mm pixel pitch'ten
hesaplanır. Sabit sol-üst ışık, bounded
chiaroscuro/value grouping, low-amplitude cavity/curvature proxy ve seçici
gloss/mat önerisi kullanır. Hue/chroma korunması için tüm RGB kanalları yalnız
linear-light scalar gain ile birlikte ölçeklenir.

Bu bir fiziksel kabartı aracı değildir: ticket her zaman
`appearance_status=not_calibrated`, `physical_z_mm=null` ve
`uneven_surface_validation_status=not_validated` taşır. `surface_height_range_mm`
ve printer-profile maksimum yüzey farkı fiziksel ölçüm/profil olmadan bilinmez.
Steep/vertical surface, head clearance, ink thickness ve braille için evrensel
gate yoktur; printer/media/RIP profile ve fiziksel kupon doğrulaması gerekir.

Mask kaynak yükseklikten türetilmez; üç giriş de tam aynı canvas olmalıdır.
Mask dışındaki gain tam `1`, enhanced artwork kaynak RGB ile pixel-identical,
signed shading diagnostic değeri ise nötrde tam `32768` olur. Ticket, aktif
alanın gerçek `surface_height_range_mm` değerini, p95/max mm/mm slope'u,
`out_of_mask_changed_pixels=0` ve linear-clipping sayısını kaydeder.

Canonical artwork `RGB` veya `RGBA` PNG olabilir. RGBA'da alpha yalnız 0/255
olmalı ve alpha coverage explicit silhouette ile bit-identical eşleşmelidir;
alpha mask tahmini için kullanılmaz ve output'ta pixel-identical korunur.

## CLI

```bash
python build_uv_appearance.py \
  --relief-map relief-map-16.png \
  --uv-artwork uv-artwork-source.png \
  --silhouette silhouette-mask.png \
  --out-dir uv-appearance-out \
  --physical-width-mm 70 \
  --physical-height-mm 62.763419 \
  --relief-depth-mm 1.2
```

Çıktılar şunlardır:

- `uv-artwork-depth-enhanced.png`
- `shading-map-16.png`
- `appearance-normal.png`
- `appearance-varnish-mask.png`
- `uv-appearance-job-ticket.json`

Güvenli varsayılanlar: no warp/no resize/no parallax/no detached cast shadow;
brand hue shift, black crush, variable-white pseudo-shading ve silhouette dışı
etki yoktur. White choke/spread yalnız RIP'in tek sahibidir; engine ile RIP aynı
dönüşümü iki kez uygulamaz.

Yönelim sözleşmesi `artwork_up_axis=-y`'dir. Sabit sol-üst ışık bu eksene
bağlıdır; artwork döndürülecekse assist yeniden derlenmelidir. Aksi halde
convex/concave algısı tersine dönebilir. Fiziksel kupon, assist açık/kapalı
karşılaştırmasını hem 0° hem 180° yönelimde yapar ve false-depth oranını kaydeder.

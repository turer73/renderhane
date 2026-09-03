# Renderhane Üretime Hazır Rölyef Sistemi

**Araştırma, mimari karar ve uygulama planı**  
**Tarih:** 3 Eylül 2026  
**Durum:** Araştırma ve planlama tamamlandı; uygulama koduna geçilmedi.  
**Dal:** `feature/manufacturing-relief-mvp`

---

## 0. Yönetici özeti

Renderhane'ye eklenecek özellik genel amaçlı bir “fotoğrafı 3D modele çevir” aracı olmamalıdır. Bu alan zaten MakerWorld, Relief Maker, HueForge ve çok sayıda image-to-3D servisi tarafından kısmen çözülmektedir. Sadece bir görselden STL çıkarmak, tek başına güçlü veya savunulabilir bir ürün değildir.

Renderhane'nin farklılaşabileceği alan şudur:

> **Bir ön tasarımı, fiziksel üretim kuralları doğrulanmış gerçek kabartmalı ürüne ve onunla aynı koordinat sistemindeki UV baskı paketine dönüştürmek.**

Asıl ürün iki ayrı hatta ele alınmalıdır:

1. **Relief Pro — gerçek kabartmalı premium ürün**
   - 3D yazıcıyla basılan gerçek rölyef,
   - kabartıyla hizalı renk/UV baskı dosyası,
   - düz arka yüz,
   - gerçek milimetre ölçüsü,
   - magnet yuvası, askı deliği veya masa ayağı,
   - GLB önizleme, 3MF üretim dosyası, STL uyumluluk dosyası,
   - üretilebilirlik raporu.

2. **Dome — epoksili standart ürün**
   - kontur biçimli 3D baskılı altlık,
   - UV baskılı sticker,
   - şeffaf epoksi/doming,
   - kesim çizgisi, taşma payı ve epoksi güvenli alanı.

**MVP önceliği Relief Pro olmalıdır.** Dome hattı daha kolaydır ve Relief Pro'nun altyapısının önemli bölümünü daha sonra yeniden kullanabilir.

En önemli teknik sonuç:

> Rodin, Hunyuan3D, TRELLIS veya Meshy'ye tek bir konsept render verip çıkan GLB'yi “üretime hazır magnet” kabul etmek doğru değildir.

Bu modeller güzel görünen 3D varlıklar üretir; fakat ölçü, düz arka yüz, rölyef derinliği, minimum duvar, magnet yuvası, manifold geometri ve UV hizasını garanti etmez. AI, yalnızca **geometri tahmini için yardımcı katman** olmalıdır. Nihai ürün geometrisi Renderhane'nin deterministik üretim motoru tarafından oluşturulmalıdır.

---

## 1. Asıl fikir ve ürün sınırı

### 1.1 Relief Pro

Örnek ürünler:

- Kapadokya, Uzungöl, Safranbolu şehir magnetleri,
- yarış ve etkinlik hatıraları,
- okul/kurs plaketleri,
- spor kulübü armaları,
- madalya ve rozetler,
- masaüstü turistik objeler,
- kurumsal küçük seri ürünler.

Ürünün ön yüzündeki yükseklikler fiziksel olacaktır. Renk, aynı ön tasarımdan üretilen UV baskı dosyasıyla uygulanacaktır. Fiziksel kabartı ile renk dosyasının ortak kaynak ve ortak koordinat sistemi kullanması sistemin temel değeridir.

### 1.2 Dome

Dome hattında üç boyut algısının önemli bölümü grafik tasarım, gölge, bevel ve epoksinin mercek etkisinden gelir. 3D baskılı altlık gerçek kalınlık ve dış form sağlar. Bu ürün:

- daha düşük maliyetli,
- daha hızlı çeşitlendirilebilir,
- kişiselleştirmeye daha uygun,
- yüksek adetli üretime daha elverişlidir.

Ancak Dome, Relief Pro ile aynı ürün gibi gösterilmemelidir. Müşterinin “gerçek kabartma” ile “epoksi dome” arasındaki farkı açıkça görmesi gerekir.

### 1.3 MVP dışında tutulacak işler

İlk sürümde şu vaatler verilmemelidir:

- tek görselden kusursuz tam 360° heykel,
- her fotoğraf için sıfır müdahaleyle tek tıkta üretim,
- otomatik G-code,
- her UV flatbed yazıcıda garantili doğrudan kabartı baskısı,
- her Bambu Studio sürümüyle bire bir proje uyumluluğu,
- karmaşık çok parçalı renk ayrımı,
- otomatik epoksi dozajlama.

---

## 2. Pazar ve rakip araştırmasının sonucu

### 2.1 MakerWorld Relief Sculpture Maker

MakerWorld'de relief üretim aracı ve bu araçla oluşturulmuş çok sayıda model bulunmaktadır. Sistem, relief üretimini Bambu ekosistemi içinde erişilebilir hale getirir. Bu durum iki şeyi gösterir:

- relief ürünlere ve kolay üretim aracına gerçek kullanıcı ilgisi vardır,
- yalnızca “görselden kabartma STL” özelliği farklılaşmak için yeterli değildir.

Renderhane'nin avantajı, Bambu'nun ücretsiz relief aracını taklit etmek değil; üreticinin ihtiyacı olan renk hizalama, ürün şablonu, magnet yuvası, UV iş dosyası, seri varyasyon ve üretim doğrulamasını birlikte sunmak olmalıdır.

### 2.2 Relief Maker

Relief Maker üretim odaklı bir yaklaşım sergiler: temiz topoloji, derinlik sıkıştırma, aşırı çıkıntıların önlenmesi ve STEP/STL/OBJ gibi çıktılar. Ancak temel akışı mevcut bir 3D modelden bakış açısı seçip relief üretmeye dayanır.

Renderhane'nin boşluğu:

- kullanıcı 3D model sahibi olmak zorunda kalmadan,
- 2D tasarım/render üzerinden,
- semantik katmanları düzenleyerek,
- renkli UV paketiyle birlikte,
- belirli ürün kalıplarına göre üretim dosyası oluşturmak.

### 2.3 HueForge

HueForge, görselin parlaklık ve filament geçirgenliği ilişkisini katman yüksekliğine dönüştürerek renkli, düz 3D baskılar üretir. Bu, renkli görseli filamente taşıma açısından güçlüdür; fakat bizim asıl ürünümüzde renk UV baskıdan, derinlik gerçek rölyeften gelecektir.

HueForge'un 3MF eklentisi önemli bir mimari ders verir: her slicer'ın proje 3MF lehçesini sıfırdan sabit kodlamak yerine, kullanıcının slicer'dan aldığı bir şablon/profil 3MF'sini içe aktarıp geometri ve gerekli ayarları onun üzerine yerleştirmek daha dayanıklı bir yaklaşımdır.

### 2.4 Image-to-3D servisleri

Renderhane'de TRELLIS, Rodin, Hunyuan3D, Tripo ve Meshy zaten mevcuttur. Bunlar tam 3D varlık üretiminde değerlidir; ancak relief üretiminde tahmini arka geometri ve serbest form üretmeleri nedeniyle ana motor olmamalıdır.

### 2.5 Stratejik konumlandırma

Savunulabilir ürün cümlesi:

> **Renderhane, tasarımı sadece 3D modele değil; ölçülü, doğrulanmış, UV ile hizalı fiziksel ürüne dönüştürür.**

Öncelikli kullanıcı:

- turistik magnet ve hediyelik üreticisi,
- küçük atölye,
- etkinlik/promosyon üreticisi,
- 3D yazıcı sahibi kişiselleştirme işletmesi,
- UV baskıcı ile çalışan tasarımcı.

İlk aşamada ürün genel halka açılmamalı; önce Renderhane içinde özel/internal üretim aracı olarak kullanılmalı, fiziksel testler tamamlandıktan sonra sınırlı beta yapılmalıdır.

---

## 3. Mevcut Renderhane altyapısının dürüst denetimi

### 3.1 Güçlü ve yeniden kullanılabilir parçalar

Mevcut sistemde şunlar hazırdır:

- Next.js 16 ve TypeScript kontrol düzlemi,
- Supabase kimlik, veritabanı ve kredi sistemi,
- Cloudflare R2 kalıcı dosya depolama,
- Fal model yönlendirme ve webhook altyapısı,
- gerçek zamanlı job durumu,
- 3D GLB görüntüleme,
- API anahtarlı `/api/v1/jobs` yüzeyi,
- Blender eklentisi,
- `3dprint` kullanıcı segmenti,
- araç registry yapısı.

Bunlar yeni sistemin arayüz, kullanıcı, ödeme, dosya ve bildirim katmanında önemli hız kazandırır.

### 3.2 Mevcut job modeli neden yeterli değil?

Mevcut akışın temel varsayımı:

```text
bir kullanıcı isteği
  → bir AI modeli
  → bir webhook
  → bir ana çıktı URL'si
  → bir outputs kaydı
```

Üretim relief sistemi ise şöyledir:

```text
kaynak
  → maske
  → segmentler
  → bir veya daha fazla depth adayı
  → kullanıcı düzenlemesi
  → relief revision
  → mesh oluşturma
  → manifold doğrulama
  → GLB + 3MF + STL + UV dosyaları + rapor
```

Ayrıca kullanıcı depth haritasını düzenlerken iş saatler veya günler boyunca “düzenleme bekliyor” durumda kalabilir. Tek bir Fal job durumuna bunu sıkıştırmak yanlış olur.

### 3.3 Tek çıktı sorunu

`process-webhook.ts`, bir payload içinden tek URL seçmekte, çıktıyı `glb|image|video` olarak sınıflandırmakta ve `job_id` üzerinde tek kayıt upsert etmektedir. Relief paketinde ise aynı revision için çok sayıda birincil çıktı gerekir.

Bu nedenle mevcut `outputs` tablosu bozulmamalı; yeni çoklu dosya sistemi için ayrı bir `artifacts` tablosu eklenmelidir. Eski araçlar çalışmaya devam eder. Relief sisteminin ana önizleme çıktısı, gerekiyorsa eski galeri uyumluluğu için `outputs` tablosuna yansıtılabilir.

### 3.4 Tarayıcıdaki GLB → STL dönüşümü

Mevcut indirme menüsü Three.js ile GLB'yi tarayıcıda STL/OBJ/GLTF'ye dönüştürmektedir. Bu kullanıcı kolaylığı sağlar; fakat üretim doğrulaması değildir.

Tarayıcı dönüşümü:

- açık kenarları onarmaz,
- self-intersection kontrol etmez,
- minimum kalınlık ölçmez,
- birim ve tolerans doğrulamaz,
- manifold garantisi vermez,
- magnet cepleri veya üretim parametreleri uygulamaz.

Relief ürününde STL ve 3MF, sunucu tarafındaki doğrulanmış geometri worker'ından çıkmalıdır.

### 3.5 Blender eklentisinin rolü

Mevcut Blender eklentisi Renderhane API'ye job yollar, sonucu indirir ve GLB'yi Blender'a aktarır. Bu değerli bir ileri aşama entegrasyonudur; fakat ilk MVP'nin çekirdeği değildir.

Faz 3 sonrasında eklentiye şu özellikler eklenebilir:

- relief revision indirme,
- elle mesh düzenleme,
- tekrar Renderhane'ye yükleme,
- UV hizalama önizlemesi,
- üretim doğrulaması isteme.

---

## 4. En kritik ürün girdisi: konsept render ile üretim master'ını ayırmak

Şu anda hazırladığımız açılı stüdyo renderları fikir ve satış sunumu için güçlüdür; ancak doğrudan üretim dosyası değildir.

Açılı renderda:

- perspektif vardır,
- ürünün yan kalınlığı görünür,
- stüdyo gölgesi vardır,
- dış kontur kameraya göre deforme olur,
- ön yüzdeki renk görseli ortografik değildir.

Üretim için ayrı bir **Front Manufacturing Master** gerekir:

- tam karşıdan ortografik görünüş,
- şeffaf veya düz arka plan,
- çevresel gölge yok,
- ürün dışı obje yok,
- metinler vektör veya düzenlenebilir,
- ön yüzün bütün alanı tek koordinat sisteminde,
- bilinen en-boy oranı.

Doğru iş akışı:

```text
konsept ürün renderı
  → tasarım referansı
  → front manufacturing master'ın yeniden kurulması
  → relief ve UV üretimi
```

Renderhane ileride konsept renderdan front master önerebilir; fakat ilk sürümde sonucu kullanıcıya doğrulatmadan üretime geçmemelidir.

---

## 5. Bilimsel/teknik araştırma sonucu: tek başına monocular depth yetmez

Tek görüntüden mutlak geometri çıkarmak doğası gereği belirsizdir. Aynı 2D görüntü birden fazla farklı 3D yüzeye karşılık gelebilir. Özellikle stilize turistik görsellerde gölge, çizgi kalınlığı, renk kontrastı ve perspektif gerçek geometriyle karışır.

Bunun sonucu:

> Depth modeli bir başlangıç önerisi üretmelidir; nihai relief haritası kullanıcı tarafından düzeltilebilir, katmanlı ve deterministik olmalıdır.

### 5.1 Önerilen geometri kaynakları

1. **Global göreli derinlik**
   - sahnenin ana ön/arka ilişkisi,
   - Depth Anything V2 Small veya Marigold adayı.

2. **Yüzey normali / yerel detay**
   - taş, yüz, kumaş, kaya gibi lokal form,
   - ilk MVP'de depth'ten türetilebilir,
   - kalite fazında normal tahmini eklenebilir.

3. **Semantik bölgeler**
   - kişi, yazı, dağ, ağaç, bina, balon gibi ayrı maskeler,
   - her bölgenin ordinal derinliği kullanıcı tarafından değiştirilebilir.

4. **Vektör katmanları**
   - şehir adı, logo, çerçeve, ok, tarih gibi öğeler AI depth'e bırakılmamalı,
   - doğrudan vektör ekstrüzyon veya oyma olarak işlenmelidir.

5. **Kullanıcı düzeltmeleri**
   - öne çıkar,
   - geri it,
   - düzleştir,
   - oy,
   - yükselt,
   - kenarı koru,
   - yumuşat.

### 5.2 Relief sentezi

Yetkili kaynak dosya mesh değil, **16-bit relief map** olmalıdır.

Kavramsal birleşim:

```text
H = GlobalDepthCompression
  + SemanticRegionOffsets
  + LocalNormalDetail
  + VectorTextAndLogo
  + UserBrushEdits
```

Sonuç 0–1 aralığında normalize edilir ve gerçek milimetre rölyef yüksekliğine dönüştürülür.

### 5.3 Neden depth + normal?

Relief araştırmalarında iki ölçekli yöntemlerin genel ilkesi şudur:

- depth haritası büyük form ve katman ilişkisini taşır,
- normal haritası ince yerel ayrıntıları taşır,
- derinlik sıkıştırılırken yüksek frekanslı detay ayrıca korunur.

Bu nedenle sadece gri resmi height map yapmak veya yalnızca tek depth haritasını doğrusal yükseltmek yetersizdir. Global derinliğe gamma uygulamak bazen sahneyi düzleştirir, bazen de yazı/gölge artefaktlarını büyütür.

### 5.4 Model seçimi

**Depth Anything V2 Small**

- hızlı ve ince ayrıntıda güçlü bir başlangıç adayıdır,
- Small ağırlıkları Apache 2.0; Base/Large/Giant ağırlıkları ticari olmayan lisans altındadır,
- ticari Renderhane için yalnızca lisansı uygun olan Small sürüm esas alınmalıdır.

**Marigold**

- diffusion tabanlı depth ve normal ailesidir,
- Fal üzerinde hazır depth endpoint'i vardır,
- daha yavaş fakat ikinci kalite adayı olarak değerlidir,
- kod Apache 2.0 olsa da model RAIL++-M lisansındadır; üretimde kullanmadan önce model lisansı ve Fal kullanım koşulları ayrıca incelenmelidir.

**SAM 2 / BiRefNet**

- BiRefNet mevcut arka plan temizleme için kullanılabilir,
- SAM 2 kullanıcı tıklamasıyla semantik bölgeleri ayırmak için daha uygundur,
- SAM 2 kod ve checkpoint'leri Apache 2.0 lisanslıdır.

**MonoRelief V2 ve benzeri akademik modeller**

- doğrudan monocular relief hedeflediği için araştırma benchmark'ına alınmalıdır,
- ancak üretim çekirdeği yapılmadan önce kod kalitesi, lisans, model boyutu ve gerçek tasarım performansı test edilmelidir.

**Rodin/Hunyuan/TRELLIS**

- Relief Pro çekirdeği değildir,
- isteğe bağlı “yaratıcı 3D kaynak” veya 3D modelden relief fazında kullanılabilir.

---

## 6. Önerilen kullanıcı deneyimi

### Aşama 1 — Kaynak

Kullanıcı:

- front master yükler,
- veya konsept görselden front master oluşturur,
- ürün türünü seçer: magnet, plaket, madalya, masaüstü,
- ölçüyü seçer: örneğin 70 × 70 mm.

Sistem kaynak kalite kontrolü yapar:

- perspektif uyarısı,
- düşük çözünürlük,
- okunamayacak küçük yazı,
- zayıf dış kontur,
- aşırı karmaşık detay,
- arka plan/gölge problemi.

### Aşama 2 — Bölgeleme

Sistem otomatik maskeler önerir. Kullanıcı tek tıklamayla:

- ana nesneyi,
- yazıyı,
- ön planı,
- orta planı,
- arka planı

seçebilir ve düzeltir.

Metinler mümkün olduğunca OCR ile tespit edilir; ancak nihai metin kullanıcının yeniden yazdığı vektör metin olmalıdır. OCR geometrisi doğrudan üretime verilmemelidir.

### Aşama 3 — Relief haritası

Sistem iki veya üç aday üretir:

- Hızlı,
- Dengeli,
- Detaylı.

Kullanıcı split-view içinde görür:

- sol: renkli tasarım,
- orta: 16-bit relief map,
- sağ: nötr ışık altında gerçek zamanlı 3D önizleme.

Temel kontroller:

- taban kalınlığı,
- maksimum rölyef,
- global derinlik sıkıştırma,
- gamma/levels,
- detay gücü,
- yumuşatma,
- kenar koruma,
- ön/arka ters çevirme,
- bölge bazında Z sırası,
- yazı/logo yüksekliği,
- minimum detay filtresi.

### Aşama 4 — Ürün mühendisliği

Kullanıcı ürün şablonu seçer:

- düz arka magnet,
- 1 veya 2 yuvarlak magnet yuvası,
- askı deliği,
- masa ayağı,
- çerçeveli plaket,
- madalya deliği.

Ölçüler gerçek mm olarak gösterilir.

### Aşama 5 — Üretim doğrulaması

Sistem şu kontrolleri çalıştırır:

- manifold/watertight,
- açık kenar,
- ters normal,
- self-intersection,
- ölçü ve birim,
- minimum taban kalınlığı,
- maksimum relief,
- küçük ve kopuk adacıklar,
- minimum baskılanabilir çizgi/boşluk,
- magnet yuvası et kalınlığı,
- düz arka yüz toleransı,
- overhang/slope uyarısı,
- UV baskı profilinin izin verdiği maksimum yüzey farkı.

Sonuç:

- `Ready for Production`,
- `Ready with Warnings`,
- `Needs Review`.

Doğrulanmamış dosyaya “baskıya hazır” etiketi verilmemelidir.

### Aşama 6 — Üretim paketi

Kullanıcı tek ZIP paketi indirir.

---

## 7. Relief motorunun teknik tasarımı

### 7.1 Canonical canvas

Her revision için değişmeyen bir 2D koordinat sistemi tanımlanmalıdır:

- master genişlik/yükseklik,
- crop matrisi,
- alpha/contour,
- mm-per-pixel,
- UV yönü,
- bleed ve safe-area.

Mesh noktaları ve baskı görselleri aynı dönüşüm matrisini kullanmalıdır. UV hizalamanın anahtarı budur.

### 7.2 Ara dosyalar

- `source-master.png`
- `foreground-mask.png`
- `segments/*.png`
- `depth-raw-*.exr` veya 16-bit PNG
- `normal-raw.exr` — opsiyonel
- `relief-map-16.png` — yetkili kaynak
- `edit-ops.json`
- `product-spec.json`

Mesh her seferinde bu dosyalardan deterministik üretilmelidir.

### 7.3 Dış kontur

Öncelik sırası:

1. kaynağın alpha kanalı,
2. kullanıcı onaylı foreground mask,
3. arka plan kaldırma sonucu,
4. kullanıcı çizimi.

Kontur işlemleri:

- marching squares,
- küçük ada temizliği,
- Douglas–Peucker benzeri sadeleştirme,
- iç/dış offset,
- minimum köşe yarıçapı,
- çok sivri epoksi veya 3D baskı uçlarının temizlenmesi.

### 7.4 Height-field mesh

MVP'de serbest form tam 3D mesh yerine kontrollü 2.5D height-field kullanılmalıdır.

- relief map düzenli grid üzerinde örneklenir,
- contour dışındaki noktalar kaldırılır,
- ön yüz triangulate edilir,
- yan duvar oluşturulur,
- düz arka yüz kapatılır,
- winding ve normal yönleri düzeltilir.

Başlangıç gridleri:

- hızlı önizleme: 256–384,
- standart: 512,
- premium: 768–1024.

Daha yüksek çözünürlük otomatik olarak daha iyi baskı anlamına gelmez. 70 mm üründe nozzle ve layer yüksekliğinin çözemeyeceği detay mesh boyutunu ve hesap yükünü gereksiz artırır.

### 7.5 Detay koruma

Önerilen sıra:

1. global depth'i percentile ile normalize et,
2. outlier'ları kırp,
3. edge-aware smoothing uygula,
4. log/gamma eğrisiyle global formu sıkıştır,
5. semantik bölge offsetlerini ekle,
6. normal/high-frequency detayını sınırlı güçte ekle,
7. minimum feature filtresi uygula,
8. kullanıcı editlerini son katman olarak uygula.

### 7.6 Taban ve cepler

Boolean işlemleri için güvenilir manifold kütüphanesi kullanılmalıdır. Öneri:

- Manifold C++/Python veya WASM,
- Python tarafında `trimesh` ile analiz/I-O,
- gerektiğinde `manifold3d` ile boolean,
- 3MF için resmi `lib3mf`.

Magnet yuvası parametrik olmalıdır:

- çap/uzunluk,
- derinlik,
- tolerans,
- adet,
- merkez veya simetrik yerleşim,
- minimum arka et kalınlığı.

### 7.7 UV baskı profili

Her baskı yöntemi için profil gerekir:

```text
profile_type
max_relief_delta_mm
safe_head_clearance_mm
bleed_mm
registration_tolerance_mm
white_underbase_mode
varnish_mode
mirror_output
jig_origin
sheet_size_mm
```

İlk doğrudan relief UV testinde 0.4 / 0.8 / 1.2 / 1.6 mm yüzey farkı içeren kalibrasyon kuponu hazırlanmalıdır. Hangi seviyede renk kaçması, bulanıklık veya kafa riski oluştuğu fason makinede fiziksel olarak ölçülmelidir.

Renderhane UV kafasının hareketini üretmez. Yazıcının RIP ve makine ayarları baskıcıya aittir. Renderhane'nin görevi geometri, baskı artwork'ü, spot maskeler, jig koordinatı ve güvenlik uyarısı üretmektir.

---

## 8. Çıktı ve üretim paketi

### 8.1 Relief Pro paketi

```text
project-name/
  manifest.json
  source/
    source-master.png
  relief/
    relief-map-16.png
    depth-preview.png
  models/
    model.glb
    model.3mf
    model.stl
  uv/
    color-srgb.png
    white-mask.png
    varnish-mask.png
    contour.svg
    jig-template.svg
  reports/
    manufacturing-report.json
    manufacturing-report.pdf
  preview/
    front.png
    angled.png
```

Notlar:

- GLB web önizleme içindir.
- Genel 3MF esas üretim formatı olmalıdır; ölçü ve topoloji bilgisi STL'den daha güvenlidir.
- STL uyumluluk içindir.
- İlk sürümde Bambu Studio'nun tüm proje ayarlarını taşıyan özel 3MF vaat edilmemelidir.
- CMYK ve ICC dönüşümü, baskıcının gerçek RIP/profil bilgisi olmadan güvenilir yapılamaz. İlk sürüm sRGB renk görseli ve ayrı spot maskeler üretmelidir.

### 8.2 Bambu proje 3MF stratejisi

Faz 3'te iki yol karşılaştırılmalıdır:

1. Bambu Studio/Orca CLI ile export,
2. kullanıcıdan alınan slicer-template 3MF içine geometri ve kontrollü metadata yerleştirme.

Tercih, template yaklaşımına yakın olmalıdır. Çünkü slicer lehçeleri ve vendor metadata'ları sürümler arasında değişebilir. Kullanıcının kendi P1S/A1 mini profiliyle kaydettiği boş veya örnek proje şablon olarak içe alınır; Renderhane sadece gerekli geometri ve belirli ayarları değiştirir.

Buna rağmen çıktının her desteklenen slicer sürümünde otomatik entegrasyon testi yapılmalıdır.

### 8.3 Dome paketi

```text
models/base.3mf
models/base.stl
print/sticker-color.png
print/cutline.svg
print/bleed-guide.pdf
print/doming-safe-area.svg
reports/base-dimensions.json
```

---

## 9. Hedef sistem mimarisi

### 9.1 Katmanlar

```text
[Tarayıcı / Renderhane UI]
        ↓
[Vercel / Next.js kontrol düzlemi]
  - auth
  - kredi
  - workflow API
  - proje/revision yönetimi
        ↓
[Supabase]
  - workflow ve revision kayıtları
  - artifact metadata
  - realtime
  - PGMQ görev kuyruğu
        ↓                    ↓
[Fal / AI inference]    [Docker Geometry Worker]
  - segment/depth        - relief synthesis
  - opsiyonel normal     - mesh/build/boolean
                         - validation
                         - GLB/3MF/STL/export
        ↓                    ↓
             [Cloudflare R2]
        - kaynak, ara dosya, final paket
```

### 9.2 Vercel'in rolü

Vercel şu işleri yapmalıdır:

- HTTP API,
- auth ve rate limit,
- kredi rezervasyonu,
- job/workflow oluşturma,
- kısa AI provider çağrıları,
- webhook alma,
- durum sorgulama,
- dosya imzalama.

Blender, OpenCV, native manifold, büyük sparse solver ve yüksek çözünürlüklü mesh üretimi Vercel Function içinde çalıştırılmamalıdır. Function süre, bellek ve bundle sınırları vardır; ayrıca native binary yönetimi dağıtımı kırılgan hale getirir.

### 9.3 Geometry Worker

Ayrı Docker image:

```text
Python 3.11+
NumPy
Pillow
OpenCV
SciPy
trimesh
manifold3d
lib3mf binding/CLI
optional Blender headless
```

Worker özellikleri:

- idempotent,
- aynı revision + spec hash için aynı çıktı,
- ara adımları R2'ye checkpoint etme,
- retry-safe,
- stdout yapılandırılmış log,
- Sentry/OpenTelemetry uyumu,
- CPU ve bellek limitleri,
- dosya hash doğrulaması.

İlk geliştirme yerel Docker worker ile yapılmalıdır. Beta dağıtımı için Cloud Run Job uygun bir başlangıç seçeneğidir; container tek işi çalıştırıp çıkabilir, retry ve uzun timeout desteği vardır. Hacim arttığında queue tüketen sürekli/ölçeklenen worker modeline geçilebilir.

### 9.4 Kuyruk

Mevcut `webhook_queue` yalnızca Fal webhook güvenilirliği için kullanılmaktadır. Üretim görevleri için ayrı Supabase Queue/PGMQ kuyrukları önerilir:

- `relief-ai`
- `relief-build`
- `relief-validate`
- `relief-export`

Her mesaj:

```json
{
  "workflow_id": "uuid",
  "revision_id": "uuid",
  "step": "build_mesh",
  "spec_hash": "sha256",
  "attempt": 1
}
```

Görev başarıyla artifact yazılmadan kuyruktan silinmemelidir.

---

## 10. Veritabanı modeli

Mevcut genel `jobs` ve `outputs` sistemi korunmalıdır. Relief'i mevcut tek-job şemasına zorlamak yerine ayrı workflow tabloları eklenmelidir.

### 10.1 `manufacturing_workflows`

- `id`
- `user_id`
- `project_id`
- `kind`: `relief_pro | dome`
- `status`: `draft | generating | editing | queued | building | validating | ready | ready_with_warnings | needs_review | failed | archived`
- `active_revision_id`
- `printer_profile_id`
- `created_at`, `updated_at`

### 10.2 `manufacturing_revisions`

- `id`
- `workflow_id`
- `parent_revision_id`
- `source_artifact_id`
- `relief_map_artifact_id`
- `product_spec JSONB`
- `edit_ops JSONB`
- `canonical_transform JSONB`
- `spec_hash`
- `created_by`
- `created_at`

### 10.3 `manufacturing_steps`

- `id`
- `workflow_id`
- `revision_id`
- `step_key`
- `status`
- `provider`
- `provider_request_id`
- `attempts`
- `credit_tx_id`
- `input_manifest JSONB`
- `output_manifest JSONB`
- `error_code`, `error_message`
- zaman alanları

### 10.4 `artifacts`

- `id`
- `workflow_id`
- `revision_id`
- `step_id`
- `role`: `source | mask | segment | depth | normal | relief_map | glb | 3mf | stl | uv_color | uv_white | uv_varnish | cutline | jig | report | package`
- `mime_type`
- `r2_url`
- `file_size`
- `sha256`
- `width`, `height`
- `metadata JSONB`
- `created_at`

### 10.5 `printer_profiles`

- sistem profilleri ve kullanıcı profilleri,
- yazıcı/slicer bilgisi,
- nozzle/layer/min-feature,
- UV üretim profili,
- opsiyonel template 3MF artifact'i.

### 10.6 `validation_runs`

- revision,
- engine version,
- overall status,
- checks JSONB,
- created_at.

---

## 11. API tasarımı

Genel `/api/v1/jobs` korunur. Üretim workflow'u için ayrı kaynak API daha doğru olur.

```text
POST   /api/v1/manufacturing-workflows
GET    /api/v1/manufacturing-workflows/:id
PATCH  /api/v1/manufacturing-workflows/:id

POST   /api/v1/manufacturing-workflows/:id/source
POST   /api/v1/manufacturing-workflows/:id/depth-candidates
POST   /api/v1/manufacturing-workflows/:id/revisions
GET    /api/v1/manufacturing-workflows/:id/revisions/:revisionId

POST   /api/v1/manufacturing-workflows/:id/build
POST   /api/v1/manufacturing-workflows/:id/validate
POST   /api/v1/manufacturing-workflows/:id/export
GET    /api/v1/manufacturing-workflows/:id/artifacts
```

Kurallar:

- bütün POST işlemleri `Idempotency-Key` kabul etmeli,
- revision immutable olmalı,
- değişiklik yeni revision üretmeli,
- build sonucu `spec_hash` ile cache edilebilmeli,
- source URL yerine artifact ID tercih edilmeli,
- API kullanıcıya tek URL değil, rol bazlı artifact listesi dönmeli.

---

## 12. Kredi ve maliyet modeli

Bir workflow boyunca krediyi saatlerce reserved tutmak yanlış olur. Kullanıcı düzenleme yaparken provider maliyeti oluşmaz.

Önerilen ücretlendirme:

- arka plan/segment önerisi: pakete dahil veya düşük kredi,
- depth adayları: model çağrısı kadar kredi,
- kullanıcı düzenlemesi: ücretsiz,
- düşük çözünürlüklü 3D preview rebuild: ücretsiz veya çok düşük kredi,
- yüksek çözünürlüklü manufacturing build + validation: sabit kredi,
- Bambu template export veya büyük batch: ek kredi.

Deterministik rebuild'in maliyeti AI çağrısından daha düşük olmalıdır. Kullanıcının küçük gamma veya relief değişikliğinde tekrar tam AI bedeli ödemesi ürün deneyimini bozar.

İlk fiziksel doğrulama dönemi admin/internal olarak ücretsiz yürütülmelidir. Fiyatlandırma gerçek CPU süresi, R2 dosya boyutu, AI maliyeti ve başarısızlık oranı ölçülmeden kesinleştirilmemelidir.

---

## 13. Kalite ve benchmark araştırma planı

### 13.1 Test veri seti

En az 30 kaynak:

- 10 stilize turistik kompozisyon,
- 5 portre/insan,
- 5 logo ve yoğun metin,
- 5 şeffaf arka planlı tek obje,
- 5 zor örnek: karanlık, kalabalık, ince ağaç/minare, sis, yansıma.

Her kaynak için insan tarafından hazırlanmış:

- foreground mask,
- 3–6 semantik bölge,
- ordinal ön/arka sırası,
- beklenen dış kontur,
- kabul edilen üretim master'ı.

### 13.2 Model karşılaştırması

İlk benchmark:

- Depth Anything V2 Small — self-hosted,
- Fal MiDaS,
- Fal Marigold,
- uygun lisans/kod bulunursa MonoRelief V2 araştırma adayı.

Ölçümler:

- bölgesel derinlik sırası doğruluğu,
- kenar doğruluğu,
- ince ayrıntı korunumu,
- gölgeyi yanlış geometriye çevirme oranı,
- kabul edilebilir sonuca ulaşmak için manuel düzenleme süresi,
- inference süresi,
- çağrı maliyeti.

### 13.3 Dijital üretim testleri

Her sonuç için:

- watertight/manifold,
- açık edge = 0,
- self-intersection = 0,
- ölçü sapması,
- taban düzlüğü,
- minimum kalınlık,
- triangle count,
- GLB/3MF/STL tekrar açılma testi,
- Bambu Studio ve OrcaSlicer import testi.

### 13.4 Fiziksel 3D baskı matrisi

Kapadokya referansıyla:

- relief: 0.6 / 1.0 / 1.4 / 1.8 mm,
- base: 2.0 / 2.5 / 3.0 mm,
- layer: 0.08 / 0.12 / 0.16 mm,
- mevcut 0.4 nozzle ve imkân varsa 0.2 nozzle,
- PLA Basic/Matte karşılaştırması,
- P1S ve A1 mini karşılaştırması.

Ölçümler:

- yazı okunabilirliği,
- minare/ağaç/ince çizgi kaybı,
- yüzey basamaklanması,
- warp,
- baskı süresi,
- gram maliyeti,
- ilk sefer kabul oranı.

### 13.5 UV kalibrasyon testi

10 × 10 cm test kuponunda:

- 0 / 0.4 / 0.8 / 1.2 / 1.6 mm basamak,
- 0.25–1.0 mm çizgiler,
- registration cross,
- küçük metin,
- renk geçişleri,
- beyaz taban açık/kapalı alanları,
- vernik alanı.

Ölçümler:

- renk/geometry registration hatası,
- kenar netliği,
- damla sapması,
- beyaz örtücülüğü,
- kafa güvenliği,
- yüzey yapışması,
- çizilme ve bükülme.

### 13.6 Kabul kriterleri

Private beta öncesi hedef:

- workflow'ların en az %95'i final artifact paketi üretmeli,
- meshlerin en az %90'ı otomatik olarak manifold çıkmalı,
- profil doğrulandıktan sonra bu oran %98'e yaklaşmalı,
- 70 mm üründe UV registration hatası ≤ 0.5 mm,
- kabul edilebilir relief için medyan manuel düzenleme ≤ 5 dakika,
- fiziksel ilk baskı kabul oranı ≥ %85,
- kalibre edilmiş ürün profilinde ≥ %95,
- aynı revision ve engine sürümü aynı geometrik hash'i üretmeli,
- doğrulanamayan dosya hiçbir zaman `ready` olmamalı.

---

## 14. Uygulama fazları

Süreler tek geliştirici eşdeğeridir; araştırma ve fiziksel tedarik gecikmeleri hariç kesin takvim sözü değildir.

### Faz 0 — Benchmark ve üretim standardı

**Tahmin: 1–2 kişi-hafta**

- 30 kaynaklık test seti,
- front master standardı,
- DA-V2 Small / MiDaS / Marigold karşılaştırması,
- 16-bit relief map standardı,
- ürün parametre şeması,
- fiziksel kalibrasyon kuponları,
- başarı metriklerinin sabitlenmesi.

**Çıkış kapısı:** Model ve algoritma yönü veriyle seçilmiş olmalı.

### Faz 1 — Yerel deterministik CLI prototipi

**Tahmin: 1.5–3 kişi-hafta**

```text
source + mask + relief map + product spec
  → GLB + STL + generic 3MF + report
```

- height-field mesh,
- contour,
- backplate,
- magnet pocket,
- manifold validation,
- lib3mf export,
- golden-file testleri.

**Çıkış kapısı:** Kapadokya modeli P1S/A1 mini'de hatasız açılıp basılmalı.

### Faz 2 — Relief editor prototipi

**Tahmin: 2–3 kişi-hafta**

- 2D/3D split-view,
- levels/gamma/detail,
- semantik region offset,
- fırça düzeltme,
- text/vector katmanı,
- revision sistemi.

**Çıkış kapısı:** Zor örneklerin çoğu 5 dakika altında düzeltilebilmeli.

### Faz 3 — Renderhane backend entegrasyonu

**Tahmin: 2–4 kişi-hafta**

- yeni tablolar ve RLS,
- manufacturing API,
- PGMQ kuyrukları,
- Docker worker,
- artifact yönetimi,
- R2 manifest,
- kredi adımları,
- retry/idempotency,
- realtime durum.

**Çıkış kapısı:** Browserdan başlayan workflow final pakete kadar kesintisiz çalışmalı.

### Faz 4 — UV üretim paketi ve fiziksel profil

**Tahmin: 1–2 kişi-hafta + saha testi**

- ortak koordinat sistemi,
- color/white/varnish maskeleri,
- SVG contour ve jig,
- printer profile,
- UV calibration report,
- fason iş akışı.

**Çıkış kapısı:** Aynı tasarımda UV baskı hizası hedef toleransı sağlamalı.

### Faz 5 — Generic 3MF ve Bambu template entegrasyonu

**Tahmin: 1–3 kişi-hafta**

- generic 3MF conformance,
- lib3mf validator,
- kullanıcı 3MF template importu,
- P1S/A1 mini profil testleri,
- Bambu Studio/Orca sürüm matrisi.

**Çıkış kapısı:** Desteklenen profil/slicer sürümleri otomatik testten geçmeli.

### Faz 6 — Dome hattı

**Tahmin: 1–2 kişi-hafta**

- base contour,
- sticker artwork,
- bleed/cutline,
- epoksi safe-area,
- batch kişiselleştirme.

### Faz 7 — Private beta

**Tahmin: 2–4 hafta gözlem**

- 5–10 gerçek üretici,
- hata ve destek ölçümü,
- gerçek üretim maliyeti,
- fiyatlandırma,
- hangi şablonların satıldığı.

Toplam gerçekçi MVP: **yaklaşık 8–14 kişi-hafta + fiziksel doğrulama süresi**. Sadece demo görünümü daha hızlı çıkar; ancak “üretime hazır” iddiası için bu test ve altyapı gereklidir.

---

## 15. Öncelik sırası

1. Konsept render ile manufacturing master ayrımını ürün akışında sabitle.
2. Fiziksel ürün spesifikasyonunu yazılı hale getir.
3. Depth benchmark yap; model seçimini tahmine bırakma.
4. 16-bit relief map'i tek kaynak gerçek kabul et.
5. Yerel deterministik mesh CLI'ını üret.
6. P1S/A1 mini fiziksel testini tamamla.
7. UV step-wedge ve registration testi yap.
8. Bundan sonra Renderhane UI/API entegrasyonuna geç.
9. Generic 3MF'yi doğrula.
10. Bambu özel 3MF'yi en sona bırak.

---

## 16. Yapılmaması gerekenler

- `manufacturing-relief`i yalnızca `MODELS` listesine yeni bir Fal modeli gibi eklemek.
- AI'dan çıkan serbest GLB'yi düzleştirip üretim dosyası diye sunmak.
- browser tarafındaki STL exportuna güvenmek.
- depth haritasını kullanıcı düzenlemesi olmadan kesin geometri kabul etmek.
- yazı ve logoları depth modeline bırakmak.
- farklı artifact'leri tek `outputs` kaydına sıkıştırmak.
- Vercel Function içine Blender/native geometry yığmak.
- ilk sürümde her slicer için tam project 3MF vaat etmek.
- gerçek UV makine profili olmadan “baskıya hazır CMYK” demek.
- fiziksel test olmadan `Ready for Production` etiketi göstermek.

---

## 17. Ana riskler ve azaltma

| Risk | Etki | Azaltma |
|---|---:|---|
| Stilize renderda yanlış depth | Yüksek | semantik katman, alternatif aday, kullanıcı editörü |
| İnce detayın baskıda kaybolması | Yüksek | minimum feature filtresi, printer/nozzle profili |
| UV'nin kabartıda bulanıklaşması | Çok yüksek | fiziksel step test, max Z profili, otomatik limit |
| Mesh açık veya non-manifold | Çok yüksek | Manifold + trimesh + lib3mf kalite kapısı |
| Bambu 3MF sürüm uyumsuzluğu | Orta-yüksek | generic 3MF önce, template yaklaşımı, sürüm test matrisi |
| Worker tekrarlı/çift çıktı | Orta | idempotency key, spec hash, artifact hash |
| Kullanıcı uzun süre editte kalır | Orta | revision workflow; uzun kredi rezervasyonu yok |
| AI/model lisansı | Yüksek | yalnızca uygun model ağırlığı; lisans kayıt defteri |
| IP/telif ihlali | Yüksek | kullanıcı beyanı, moderasyon, raporlama ve kullanım şartı |
| Çok geniş ürün kapsamı | Yüksek | ilk ürün: 70 × 70 mm şehir/etkinlik magneti |

---

## 18. Go / No-Go kararı

### Go

Aşağıdaki koşullarda ürün geliştirmeye devam edilir:

- depth benchmark'ta en az bir yöntem semantik sıralamada kabul edilebilir sonuç veriyor,
- kullanıcı düzenlemesi medyan 5 dakika altında kalıyor,
- Kapadokya referansı dijital kalite kapılarından geçiyor,
- P1S/A1 mini baskısı görsel olarak yeterli,
- fason UV testinde ≤0.5 mm hizalama ve kabul edilebilir netlik elde ediliyor,
- toplam işlem maliyeti hedef satış/kredi modeline uyuyor.

### No-Go veya pivot

Aşağıdaki durumda otomatik Relief Pro iddiası daraltılır:

- stilize turistik görsellerde depth düzenlemesi sürekli 10–15 dakikayı aşıyor,
- doğrudan relief UV baskısı fiziksel olarak istikrarsız,
- kullanıcıların çoğu gerçek kabartma yerine epoksili ürünü tercih ediyor,
- otomatik mesh doğrulama oranı düşük kalıyor.

Bu durumda pivot:

- vektör/katman tabanlı yarı otomatik relief,
- UV baskılı düz insert,
- veya Dome ürün hattı.

Bu bir başarısızlık değil; fiziksel veriye göre ürün sınırını doğru koymaktır.

---

## 19. Bir sonraki somut çalışma

Kod entegrasyonundan önce tamamlanacak ilk paket:

1. Kapadokya için front manufacturing master,
2. elle hazırlanmış referans foreground mask,
3. elle hazırlanmış 5 seviyeli bölgesel depth ground truth,
4. DA-V2 Small, MiDaS ve Marigold depth adayları,
5. 0.6/1.0/1.4/1.8 mm dört relief STL'si,
6. 70 × 70 mm düz arka ve magnet yuvalı taban,
7. Bambu Studio import testi,
8. P1S/A1 mini baskı karşılaştırması,
9. UV calibration step coupon,
10. ölçüm ve fotoğraf içeren benchmark raporu.

Bu test sonucu görülmeden site arayüzünde “yeni araç” kartı açılmamalıdır.

---

## 20. Araştırma kaynakları

- [Depth Anything V2 — resmi GitHub](https://github.com/DepthAnything/Depth-Anything-V2)
- [Marigold — resmi GitHub](https://github.com/prs-eth/Marigold)
- [SAM 2 — resmi GitHub](https://github.com/facebookresearch/sam2)
- [MonoRelief V2 — arXiv](https://arxiv.org/abs/2508.19555)
- [Real-time Bas-Relief Generation from Depth-and-Normal Maps — Eurographics](https://diglib.eg.org/items/7a2d84c8-8ad7-41e3-bcb4-13629d85a30c)
- [Normal Image Manipulation for Bas-relief Generation — arXiv](https://arxiv.org/abs/1804.06092)
- [Relief Maker](https://www.reliefmaker.com/)
- [MakerWorld Relief Sculpture Maker örnek çıktıları](https://makerworld.com/en/models/1746852-2025-heracles-2oz-silver-coin-replica)
- [HueForge 3MF Export yaklaşımı](https://shop.thehueforge.com/pages/3mf-plugin)
- [3MF resmi spesifikasyonu](https://3mf.io/spec/)
- [lib3mf — resmi uygulama](https://github.com/3MFConsortium/lib3mf)
- [Manifold — robust mesh geometry](https://github.com/elalish/manifold)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Blender command-line background mode](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html)

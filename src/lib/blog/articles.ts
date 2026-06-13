export interface BlogArticle {
  slug: string;
  date: string;
  author: string;
  coverImage?: string;
  tags: string[];
  title: Record<string, string>;
  description: Record<string, string>;
  content: Record<string, string>;
}

export const articles: BlogArticle[] = [
  {
    slug: "hayalet-manken-efekti-ai-tekstil",
    date: "2026-06-13",
    author: "Renderhane",
    tags: ["Hayalet Manken", "Tekstil Fotoğrafı", "AI Görsel"],
    title: {
      tr: "Hayalet Manken (Ghost Mannequin) Efekti: Tekstil Ürünlerini AI ile Çekme",
      en: "Ghost Mannequin Effect: Shooting Apparel Products with AI",
    },
    description: {
      tr: "Hayalet manken efekti nedir, neden işe yarar ve AI ile nasıl uygulanır? Tekstil satıcıları için dürüst, uygulanabilir bir rehber.",
      en: "What the ghost mannequin effect is, why it works, and how to create it with AI. An honest, practical guide for apparel sellers.",
    },
    content: {
      tr: `## Hayalet Manken Efekti Nedir?

Hayalet manken (ghost mannequin) efekti, bir giysinin sanki görünmez biri tarafından giyiliyormuş gibi, üç boyutlu hacmiyle gösterildiği bir ürün fotoğrafı tekniğidir. Tişört düz bir masada serili durmaz; omuzları doldurulmuş, yakası açılmış, kolları formunu bulmuş halde havada durur. İçeri bakan kısımlar (yaka içi, manşet) da görünür. Sonuç, mankensiz ama bedenli bir görseldir.

Bu teknik tekstilde popüler çünkü iki dünyanın iyi yanını birleştirir: düz ürün (flat lay) görselinin sadeliği ile mankenli çekimin hacim hissi. Müşteri, ürünün vücutta nasıl oturacağını tahmin edebilir, ama dikkati bir modele kaymaz.

## Neden Pazaryerinde İşe Yarar?

Trendyol, Hepsiburada, Amazon ve Etsy gibi platformlarda ana görsel çoğunlukla beyaz arka plan ister. Hayalet manken efekti bu kurala doğal olarak uyar: temiz arka plan, net ürün formu, dikkat dağıtıcı unsur yok.

Giyimde en sık dönüş (iade) sebeplerinden biri beklenti farkıdır. Müşteri ürünün kesimini, hacmini ve oturuşunu net görebilirse, satın alma kararı daha bilinçli olur. Hayalet manken görseli, düz serili bir fotoğrafa göre bu bilgiyi daha iyi taşır. Burada kesin bir oran vermek doğru olmaz; etkisi ürüne, kategoriye ve görselin kalitesine göre değişir.

## Klasik Yöntem Nasıl İşler?

Geleneksel hayalet manken çekimi şöyle yapılır:

1. Giysi, kollarına ve gövdesine göre ayarlanabilen bir manken üzerine giydirilir.
2. Dış görünüm fotoğraflanır.
3. Yaka içini göstermek için, mankenin boyun kısmı çıkarılıp giysinin arkası ayrıca çekilir.
4. Post-prodüksiyonda manken silinir ve iç kısım dış kareyle birleştirilir (compositing).

Bu yöntem güvenilir sonuç verir ama zaman, stüdyo ve retuş emeği ister. Çok sayıda SKU'su olan satıcılar için bu maliyet hızla büyür.

## AI ile Yaklaşım

Yapay zeka, süreci iki yönden hafifletebilir:

### 1. Mevcut çekimden temizleme
Elinizde mankenli ya da askıda çekilmiş bir fotoğraf varsa, AI tabanlı araçlar mankeni veya askıyı ayırıp arka planı temizleyebilir. Bu, klasik compositing'in retuş kısmını hızlandırır.

### 2. Hacim ve form oluşturma
Düz serili (flat lay) bir görselden yola çıkarak, AI ürüne hacim hissi verebilir; omuz ve gövde formunu doldurarak hayalet manken görünümüne yaklaştırabilir. Renderhane gibi araçlar bu noktada, tek bir ürün fotoğrafından sahne ve form kurgusu üretmeye odaklanır.

Önemli bir dürüstlük notu: AI, gerçekte var olmayan bir detayı "icat edebilir". Düğme dizilimi, dikiş yönü, etiket veya desen tekrarı orijinalinden sapabilir. Bu yüzden AI çıktısı her zaman gerçek üründe doğrulanmalıdır.

## Adım Adım Pratik Akış

1. **İyi bir kaynak görsel çekin.** Giysiyi düz, kırışıksız ve dengeli aydınlatmayla çekin. AI ne kadar temiz girdi alırsa, çıktı o kadar tutarlı olur.
2. **Yaka içini ayrı yakalayın.** Mümkünse arka/iç görünümü de çekin; birleştirmede işinize yarar.
3. **Arka planı ayırın.** Mankeni, askıyı veya zemini temizleyin.
4. **Form/hacim ekleyin.** Hayalet manken görünümünü uygulayın.
5. **Doğrulayın.** Çıktıyı gerçek ürünle yan yana koyup renk, doku ve detay sapmalarını kontrol edin.
6. **Platform kuralına uydurun.** Kare oranı, çözünürlük ve arka plan rengini hedef pazaryerine göre ayarlayın.

## Sık Karşılaşılan Sorunlar

- **Renk kayması:** AI bazen renk tonunu hafifçe değiştirir. Marka rengi kritikse referans kart kullanın ve sonucu gözden geçirin.
- **Doku bulanıklığı:** Örgü, dantel veya ince kumaş detayı silinebilir. Yüksek çözünürlüklü kaynak görsel bu riski azaltır.
- **Asimetri:** İki kol veya yaka simetrik durmayabilir. Manuel düzeltme gerekebilir.
- **Sahte gerçekçilik:** Var olmayan kıvrım veya gölge eklenmesi ürünü yanlış tanıtabilir; bu, pazaryeri kuralları açısından da risklidir.

## Ne Zaman Tercih Edilmeli, Ne Zaman Edilmemeli?

Hayalet manken efekti; tişört, gömlek, sweatshirt, elbise gibi gövde formu olan ürünlerde güçlüdür. Düz aksesuarlarda (örneğin fular düz serildiğinde) çok az katkı sağlar.

Lüks veya yüksek detaylı ürünlerde, küçük bir hatanın bile güveni sarsabileceği durumlarda, AI çıktısını yalnızca taslak olarak kullanıp gerçek çekimle desteklemek daha güvenlidir. Hızlı katalog büyütmesi gereken, çok sayıda standart üründe ise AI ciddi zaman kazandırır.

## Özet

Hayalet manken efekti, tekstil ürününü sade arka planda hacimli göstererek müşteriye daha net bilgi verir. AI, bu görseli üretme veya temizleme sürecini hızlandırabilir; ama doğruluk sorumluluğu satıcıdadır. En sağlıklı yaklaşım, AI'yı hızlı bir ilk adım olarak kullanmak ve her çıktıyı gerçek ürünle doğrulamaktır.`,
      en: `## What Is the Ghost Mannequin Effect?

The ghost mannequin (or invisible mannequin) effect is a product photography technique where a garment is shown with its full three-dimensional volume, as if worn by an invisible person. A t-shirt isn't laid flat on a table; instead its shoulders are filled out, the collar is open, and the sleeves hold their shape in mid-air. Inner areas such as the neckline and cuffs are visible too. The result is a body-shaped image without an actual model.

The technique is popular in apparel because it combines the best of two worlds: the simplicity of a flat-lay shot and the sense of volume of a model shoot. The customer can imagine how the item sits on a body, but their attention isn't pulled toward a model.

## Why It Works on Marketplaces

On platforms like Trendyol, Hepsiburada, Amazon and Etsy, the main image usually requires a white background. The ghost mannequin effect fits this rule naturally: clean background, clear product form, no distractions.

One of the most common reasons for returns in clothing is the gap between expectation and reality. When a customer can clearly see a garment's cut, volume and fit, the purchase decision is more informed. A ghost mannequin image carries this information better than a flat shot. Giving a precise figure here would be misleading; the impact varies by product, category and image quality.

## How the Classic Method Works

A traditional ghost mannequin shoot typically goes like this:

1. The garment is dressed on an adjustable mannequin.
2. The exterior is photographed.
3. To show the inner neckline, the mannequin's neck piece is removed and the back of the garment is shot separately.
4. In post-production the mannequin is erased and the inner section is composited into the outer frame.

This method gives reliable results but takes time, studio space and retouching effort. For sellers with many SKUs, that cost adds up quickly.

## The AI Approach

AI can ease the process from two directions:

### 1. Cleaning up an existing shot
If you already have a photo on a mannequin or hanger, AI-based tools can separate the mannequin or hanger and clean the background. This speeds up the retouching part of classic compositing.

### 2. Creating volume and form
Starting from a flat-lay image, AI can give the product a sense of volume by filling out the shoulder and torso shape, approaching a ghost mannequin look. Tools like Renderhane focus on generating scene and form from a single product photo.

An honest note: AI can "invent" details that don't actually exist. Button placement, stitching direction, labels or pattern repeats may drift from the original. That's why AI output should always be verified against the real product.

## A Step-by-Step Practical Flow

1. **Capture a good source image.** Shoot the garment flat, wrinkle-free, with even lighting. The cleaner the input, the more consistent the output.
2. **Capture the inner neckline separately.** If possible, shoot the back/inside view too; it helps with compositing.
3. **Separate the background.** Remove the mannequin, hanger or floor.
4. **Add form/volume.** Apply the ghost mannequin look.
5. **Verify.** Place the output next to the real product and check for color, texture and detail drift.
6. **Match the platform rules.** Adjust aspect ratio, resolution and background color to the target marketplace.

## Common Problems

- **Color shift:** AI sometimes alters the tone slightly. If brand color is critical, use a reference card and review the result.
- **Texture blur:** Knit, lace or fine fabric detail can be smoothed away. A high-resolution source reduces this risk.
- **Asymmetry:** The two sleeves or the collar may not look symmetrical. Manual correction may be needed.
- **False realism:** Adding folds or shadows that don't exist can misrepresent the product, which is also risky under marketplace rules.

## When to Use It — and When Not To

The ghost mannequin effect is strong for items with a body shape: t-shirts, shirts, sweatshirts, dresses. For flat accessories (a scarf laid flat, for example) it adds little.

For luxury or highly detailed products, where even a small error can break trust, it's safer to treat AI output as a draft and back it up with a real shoot. For high-volume catalogs of standard products that need fast scaling, AI saves serious time.

## Summary

The ghost mannequin effect gives customers clearer information by showing an apparel item with volume on a clean background. AI can speed up producing or cleaning these images, but the responsibility for accuracy stays with the seller. The healthiest approach is to use AI as a fast first step and verify every output against the real product.`,
    },
  },
  {
    slug: "amazon-urun-gorseli-olculeri-kurallari-2026",
    date: "2026-06-13",
    author: "Renderhane",
    tags: ["Amazon", "Ürün Görseli", "Pazaryeri Optimizasyonu"],
    title: {
      tr: "Amazon Ürün Görseli Ölçüleri ve Kuralları 2026",
      en: "Amazon Product Image Dimensions and Rules 2026",
    },
    description: {
      tr: "Amazon ana görsel ve ek görsel kuralları: piksel ölçüleri, beyaz arka plan, %85 doluluk, zoom için minimum boyut ve sık yapılan hatalar.",
      en: "Amazon main and secondary image rules: pixel sizes, white background, 85% fill, minimum size for zoom and the most common listing mistakes.",
    },
    content: {
      tr: `## Amazon Görsel Kuralları Neden Trendyol'dan Farklı?

Amazon, ürün görsellerini sadece bir vitrin olarak değil, arama sıralaması ve dönüşümü etkileyen teknik bir varlık olarak ele alır. Trendyol veya Hepsiburada'da görsel kuralları daha esnekken, Amazon'da ana görselin teknik şartları katıdır ve kurala uymayan listelemeler arama sonuçlarında bastırılabilir veya yayından kaldırılabilir.

Bu makalede Amazon'un kendi seller yardım dokümanlarında belirttiği güncel görsel gereksinimlerini, sık karıştırılan noktaları ve pratik bir kontrol listesini bulacaksınız. Pazaryerine özgü kuralları farklı bir açıdan, ölçü ve teknik uyum tarafından ele alıyoruz.

## Ana Görsel (Main Image) Kuralları

Ana görsel, arama sonuçlarında ve ürün sayfasının en üstünde görünen ilk görseldir. Amazon bu görsel için en sıkı kuralları uygular:

- **Arka plan tamamen beyaz olmalıdır.** Amazon, saf beyaz değerini RGB 255, 255, 255 olarak tanımlar. Gri tonlu veya hafif kirli beyaz arka planlar reddedilebilir.
- **Ürün karenin en az %85'ini doldurmalıdır.** Çok küçük ya da kenarlara taşan ürünler kurala aykırıdır.
- **Sadece satılan ürün görünmelidir.** Pakete dahil olmayan aksesuar, prop, dekor veya insan modeli (giyilebilir ürünler hariç kategori kurallarına göre) ana görselde yer almamalıdır.
- **Metin, logo, filigran, çerçeve, rozet veya promosyon yazısı bulunamaz.** "İndirim", "ücretsiz kargo" gibi grafikler yasaktır.
- Görsel net, odakta ve gerçekçi renklerde olmalıdır.

## Piksel Ölçüleri ve Zoom

Amazon'da görsel boyutu doğrudan kullanıcı deneyimine bağlıdır:

- **Zoom özelliği için uzun kenar en az 1000 piksel olmalıdır.** Bu eşiğin altındaki görseller yakınlaştırma işlevini tetiklemez ve müşteri ürünü detaylı inceleyemez.
- **Pratikte önerilen değer 1600 piksel ve üzeridir.** Bu boyut, masaüstü ve mobilde keskin görüntü ve sorunsuz zoom sağlar.
- **En uzun kenar 10.000 pikseli aşmamalıdır.** Çok büyük dosyalar yüklenmeyebilir.
- **Kare en-boy oranı (1:1) önerilir.** Amazon görsel alanı kare temelli düzenlenir; dikey veya yatay görseller boşluklu görünebilir.

## Kabul Edilen Dosya Formatları

Amazon şu formatları kabul eder: JPEG (.jpg veya .jpeg), PNG (.png), TIFF (.tif) ve GIF (.gif). Pratikte **JPEG en yaygın ve önerilen formattır** çünkü dosya boyutu küçüktür ve hızlı yüklenir. Animasyonlu GIF'ler desteklenmez. Renk profili olarak sRGB veya CMYK kullanılması tavsiye edilir; sRGB web görüntüsü için daha tutarlı sonuç verir.

## Ek Görseller (Secondary Images)

Ana görsel dışındaki ek görsellerde kurallar daha esnektir. Burada ürünü farklı açılardan, kullanım sırasında, ölçek referansıyla veya yaşam tarzı (lifestyle) sahneleriyle gösterebilirsiniz. Ek görsellerde:

- Açıklayıcı metin, infografik ve ölçü bilgisi kullanılabilir.
- Beyaz arka plan zorunlu değildir; sahne ve dekor serbesttir.
- Birden fazla açı ve detay çekimi dönüşümü artırmaya yardımcı olur.

Kategoriye göre toplam görsel sayısı değişir; çoğu kategoride bir ana görsel ve birkaç ek görsel gösterilir. Tüm slotları doldurmak, müşteri sorularını görsel yoluyla yanıtladığı için genellikle faydalıdır.

## Sık Yapılan Hatalar

- **Kirli beyaz arka plan:** Telefonla çekilen ürünlerde arka plan tam beyaz görünse de RGB değeri 255 olmayabilir. Otomatik araçla saf beyaza taşımak gerekir.
- **Ürünün çok küçük olması:** %85 doluluk kuralı atlandığında ürün arama sonuçlarında zayıf görünür.
- **Düşük çözünürlük:** 1000 pikselin altındaki görseller zoom'u devre dışı bırakır ve algılanan kaliteyi düşürür.
- **Ana görselde metin/filigran:** En sık reddedilme nedenlerinden biridir.
- **Tek görselle yetinmek:** Ek görsellerin boş bırakılması dönüşüm potansiyelini sınırlar.

## Pratik Kontrol Listesi

1. Ana görsel arka planı saf beyaz (255, 255, 255) mi?
2. Ürün karenin en az %85'ini dolduruyor mu?
3. Uzun kenar en az 1000 piksel, tercihen 1600+ mı?
4. Ana görselde metin, logo veya prop var mı? (Olmamalı)
5. Format JPEG ve renk profili sRGB mi?
6. Ek görseller farklı açı ve kullanım senaryolarını gösteriyor mu?

## Görsel Üretimini Hızlandırmak

Tek bir ürün fotoğrafından kurallara uygun beyaz arka planlı ana görsel, farklı açılar ve sahne kurguları üretmek manuel olarak zaman alır. Renderhane gibi AI destekli araçlar; arka planı saf beyaza taşıma, ürünü kareye yerleştirme ve ek görseller için sahne kurgusu üretme adımlarını otomatikleştirerek bu süreci kısaltabilir. Yine de yayına almadan önce yukarıdaki kontrol listesini gözden geçirmek, kategoriye özel kuralları kaçırmamak için önemlidir.

Amazon görsel kuralları zamanla güncellenebildiğinden, listeleme öncesi Seller Central'daki güncel kategori şartlarını teyit etmenizi öneririz.`,
      en: `## Why Amazon's Image Rules Differ From Other Marketplaces

Amazon treats product images not just as a storefront, but as a technical asset that affects search ranking and conversion. While image rules on marketplaces like Trendyol or Hepsiburada are more flexible, Amazon enforces strict technical requirements for the main image, and non-compliant listings can be suppressed in search or removed entirely.

This article covers Amazon's current image requirements as stated in its own seller help documentation, the points sellers most often confuse, and a practical checklist. We approach marketplace-specific rules from a different angle: dimensions and technical compliance.

## Main Image Rules

The main image is the first one shown in search results and at the top of the product page. Amazon applies its strictest rules here:

- **The background must be pure white.** Amazon defines pure white as RGB 255, 255, 255. Greyish or slightly off-white backgrounds may be rejected.
- **The product must fill at least 85% of the frame.** Items that are too small or bleed off the edges violate the rule.
- **Only the product for sale should be visible.** Accessories not included in the package, props, decor, or human models (except for wearables, per category rules) should not appear in the main image.
- **No text, logos, watermarks, borders, badges, or promotional graphics.** Overlays like "sale" or "free shipping" are prohibited.
- The image must be sharp, in focus, and show realistic colors.

## Pixel Dimensions and Zoom

On Amazon, image size is directly tied to user experience:

- **For the zoom feature, the longest side must be at least 1000 pixels.** Images below this threshold do not trigger zoom, so customers can't inspect the product in detail.
- **In practice, 1600 pixels and above is recommended.** This size delivers sharp visuals and smooth zoom on both desktop and mobile.
- **The longest side should not exceed 10,000 pixels.** Overly large files may fail to upload.
- **A square (1:1) aspect ratio is recommended.** Amazon's image area is built around squares; vertical or horizontal images may show gaps.

## Accepted File Formats

Amazon accepts the following formats: JPEG (.jpg or .jpeg), PNG (.png), TIFF (.tif), and GIF (.gif). In practice, **JPEG is the most common and recommended format** because of its small file size and fast loading. Animated GIFs are not supported. sRGB or CMYK color profiles are advised; sRGB gives more consistent results for web display.

## Secondary Images

Rules for images beyond the main one are more relaxed. Here you can show the product from different angles, in use, with a scale reference, or in lifestyle scenes. For secondary images:

- Descriptive text, infographics, and dimension details are allowed.
- A white background is not required; scenes and decor are free.
- Multiple angles and detail shots help increase conversion.

The total number of images varies by category; most categories show one main image plus several secondary ones. Filling all available slots is usually worthwhile, since it answers customer questions visually.

## Common Mistakes

- **Off-white background:** In phone-shot products the background may look white but not measure RGB 255. An automated tool is needed to shift it to pure white.
- **Product too small:** Skipping the 85% fill rule makes the product look weak in search results.
- **Low resolution:** Images under 1000 pixels disable zoom and lower perceived quality.
- **Text/watermark on the main image:** One of the most frequent reasons for rejection.
- **Using only one image:** Leaving secondary slots empty limits conversion potential.

## Practical Checklist

1. Is the main image background pure white (255, 255, 255)?
2. Does the product fill at least 85% of the frame?
3. Is the longest side at least 1000 pixels, ideally 1600+?
4. Is there any text, logo, or prop on the main image? (There shouldn't be.)
5. Is the format JPEG with an sRGB color profile?
6. Do secondary images show different angles and use cases?

## Speeding Up Image Production

Producing a compliant white-background main image, multiple angles, and scene compositions from a single product photo takes time manually. AI-assisted tools like Renderhane can shorten this by automating steps such as shifting the background to pure white, centering the product in a square, and generating scene setups for secondary images. Still, reviewing the checklist above before publishing is important so you don't miss category-specific rules.

Because Amazon's image rules can change over time, we recommend confirming the current category requirements in Seller Central before listing.`,
    },
  },
  {
    slug: "trendyol-urun-gorseli-olculeri-kurallari-2026",
    date: "2026-06-13",
    author: "Renderhane",
    tags: ["Trendyol", "Pazaryeri Optimizasyonu", "Ürün Görseli"],
    title: {
      tr: "Trendyol Ürün Görseli Ölçüleri ve Kuralları 2026",
      en: "Trendyol Product Image Dimensions and Rules 2026",
    },
    description: {
      tr: "Trendyol ürün görselleri için doğru ölçü, oran, format ve içerik kuralları. Vitrin görseli gereksinimleri ve sık yapılan hatalar 2026 rehberi.",
      en: "Correct dimensions, aspect ratio, format and content rules for Trendyol product images. Cover image requirements and common mistakes in this 2026 guide.",
    },
    content: {
      tr: `## Neden Trendyol Görsel Kurallarını Ciddiye Almalısınız?

Trendyol'da bir ürün listelediğinizde, müşterinin sizinle kurduğu ilk temas görseldir. Açıklama, fiyat ve yorumlar daha sonra gelir. Bu yüzden Trendyol, görsel kalitesi konusunda belirli standartlar koyar. Kurallara uymayan görseller ya yüklenmez ya da listeleme sonrası reddedilebilir; bazı durumlarda ürün vitrine çıkmaz. Bu rehberde, 2026 itibarıyla genel kabul gören ölçü ve içerik kurallarını derledik.

Önemli bir uyarıyla başlayalım: Trendyol, görsel gereksinimlerini zaman zaman günceller ve bazı kurallar kategoriye göre değişir. Bu yazıdaki değerler genel referans niteliğindedir. Net ve güncel sayıları her zaman **Trendyol Satıcı Paneli** içindeki ürün yükleme ekranından veya kategori kılavuzundan doğrulayın.

## Önerilen Ölçü ve En-Boy Oranı

Trendyol, dikey (portrait) görselleri tercih eder. Bunun nedeni mobil ekranlarda ürünün daha büyük ve dolgun görünmesidir; trafiğin büyük kısmı mobil uygulamadan gelir.

### Çözünürlük

- Yaygın olarak önerilen ölçü **1200 x 1800 piksel** civarındadır.
- En-boy oranı **2:3** (dikey) şeklindedir.
- Daha yüksek çözünürlük (örneğin 2000 piksel üzeri uzun kenar) zoom kalitesini artırır; Trendyol görsele tıklandığında yakınlaştırma sunar.
- Çok düşük çözünürlüklü, bulanık veya pikselli görseller reddedilebilir.

### Format ve Dosya Boyutu

- Genellikle **JPG/JPEG** ve **PNG** kabul edilir.
- Dosya boyutunda üst sınır vardır; gereğinden büyük dosyaları yüklemeden önce makul bir boyuta optimize edin.
- Şeffaf (transparan) PNG yerine, ana görselde düz beyaz arka plan beklenir.

Kesin piksel ve megabayt değerleri kategoriye göre farklılaşabildiği için yükleme ekranındaki uyarıları dikkate almanızı öneririz.

## Vitrin (Ana) Görseli Kuralları

Vitrin görseli, arama sonuçlarında ve ürün kartında ilk görünen kareyezdir. En katı kurallar buraya uygulanır:

- **Arka plan düz beyaz** olmalıdır. Gölge, doku veya renkli zemin genellikle istenmez.
- Görselde **yalnızca satılan ürün** bulunmalıdır; sette olmayan ek aksesuarlar yanıltıcı sayılır.
- **Ürün kadrajı dolu** olmalı, çevresinde aşırı boşluk bırakılmamalıdır.
- Ürün net, odakta ve doğru renkte görünmelidir.

## İçerik Yasakları

Aşağıdaki unsurlar, özellikle ana görselde, genellikle yasaktır:

- **Logo, marka damgası, filigran (watermark)**
- **Yazı, fiyat etiketi, "indirim", "kargo bedava" gibi metinler**
- **Çerçeve, kenarlık, kolaj veya birden fazla görselin tek karede birleştirilmesi**
- **İletişim bilgisi, telefon, web adresi**
- **Rakip marka veya başka platform referansı**

Bu kurallar, pazaryerinde tutarlı ve adil bir vitrin sağlamak içindir. İçerik görsellerinde (galeri içindeki diğer kareler) bazı kategorilerde metin ve sahne kullanımına daha fazla esneklik tanınabilir, ancak yine de abartılı pazarlama metinlerinden kaçının.

## Birden Fazla Görsel Kullanımı

Tek vitrin görseliyle yetinmeyin. Birden çok açı, müşterinin sorularını yanıtlar ve iade oranını düşürür:

- Önden, yandan ve arkadan çekimler
- Detay/yakın plan (kumaş, doku, malzeme)
- Ölçek hissi veren kullanım karesi (kategori izin veriyorsa)
- Paket/içerik görseli

İlk kare beyaz arka plan kuralına uymalı; sonraki karelerde sahne kurgusuna daha çok alan vardır. Yine de kategori kılavuzunu kontrol edin.

## 2026'da Öne Çıkan Noktalar

Mobil trafiğin baskınlığı sürdüğü için dikey 2:3 oran daha da kritik. Ayrıca yüksek çözünürlüklü görseller, müşterinin zoom ile detayları incelemesini sağladığından dönüşüme olumlu katkı sunar. Görsellerinizi tek tek elle hazırlamak zaman alır; burada üretim araçları devreye girer.

**Renderhane** ile tek bir ürün fotoğrafından, pazaryeri kurallarına uygun beyaz arka planlı vitrin görselleri, farklı açılar ve sahne kurguları üretebilirsiniz. Doğru orana kırpma, temiz beyaz zemin ve yüksek çözünürlük çıktısı, manuel düzenlemeye göre süreci ciddi şekilde kısaltır. Yine de yüklemeden önce sonucu Trendyol'un güncel gereksinimleriyle karşılaştırmak sizin sorumluluğunuzdadır.

## Sık Yapılan Hatalar

- Yatay (landscape) fotoğraf yükleyip dikey alanda görselin kenarlardan kırpılması
- Ana görsele "%50 indirim" gibi metin eklemek ve listelemenin reddedilmesi
- Düşük çözünürlüklü, telefonla aceleyle çekilmiş bulanık kareler
- Ürünün çok küçük göründüğü, kenarlarda kocaman boşluk olan kadrajlar
- Her görselde farklı beyaz tonu kullanıp tutarsız bir galeri oluşturmak

## Özet

Trendyol görsellerinde temel formül nettir: dikey 2:3 oran, yüksek çözünürlük, ana görselde düz beyaz arka plan, yazı ve logo olmadan yalnızca ürün. Bu standartları sağladığınızda hem listelemeniz sorunsuz yayınlanır hem de ürününüz arama sonuçlarında daha profesyonel görünür. Kesin değerler için her zaman Satıcı Paneli'ndeki güncel kuralları esas alın.`,
      en: `## Why Trendyol's Image Rules Matter

When you list a product on Trendyol, the image is the first contact a shopper makes with you. Description, price and reviews come later. That is why Trendyol enforces specific standards for image quality. Images that break the rules either fail to upload or get rejected after listing; in some cases the product never reaches the storefront. This guide compiles the dimension and content rules that are generally accepted as of 2026.

Let's start with an important caveat: Trendyol updates its image requirements from time to time, and some rules vary by category. The values here are a general reference. Always confirm the exact, current numbers in the **Trendyol Seller Panel** product-upload screen or category guide.

## Recommended Dimensions and Aspect Ratio

Trendyol favors vertical (portrait) images, because products look larger and fuller on mobile screens — and most traffic comes from the mobile app.

### Resolution

- The commonly recommended size is around **1200 x 1800 pixels**.
- The aspect ratio is **2:3** (portrait).
- Higher resolution (for example a long edge above 2000 px) improves zoom quality; Trendyol offers zoom when an image is tapped.
- Very low-resolution, blurry or pixelated images may be rejected.

### Format and File Size

- **JPG/JPEG** and **PNG** are generally accepted.
- There is an upper limit on file size; optimize oversized files to a reasonable size before uploading.
- Instead of transparent PNGs, the main image is expected to have a solid white background.

Because exact pixel and megabyte values can differ by category, follow the warnings shown on the upload screen.

## Cover (Main) Image Rules

The cover image is the first frame seen in search results and on the product card. The strictest rules apply here:

- The **background must be solid white**. Shadows, textures or colored backdrops are usually not allowed.
- The image should contain **only the product being sold**; accessories not included in the set are considered misleading.
- The **product should fill the frame**, without excessive empty space around it.
- The product must appear sharp, in focus and in true color.

## Content Restrictions

The following elements, especially on the main image, are generally prohibited:

- **Logos, brand stamps, watermarks**
- **Text, price tags, words like "discount" or "free shipping"**
- **Frames, borders, collages, or multiple photos merged into one frame**
- **Contact details, phone numbers, web addresses**
- **References to competitor brands or other platforms**

These rules exist to keep the marketplace storefront consistent and fair. Gallery images (the other frames) may allow more flexibility for text and scenes in some categories, but still avoid exaggerated marketing copy.

## Using Multiple Images

Don't settle for a single cover image. Multiple angles answer shopper questions and reduce return rates:

- Front, side and back shots
- Detail/close-up (fabric, texture, material)
- A lifestyle frame that conveys scale (if the category permits)
- Packaging/contents image

The first frame must follow the white-background rule; later frames have more room for scene composition. Still, check the category guide.

## What Stands Out in 2026

With mobile traffic still dominant, the vertical 2:3 ratio is more critical than ever. High-resolution images also help conversion because shoppers can inspect details with zoom. Preparing images one by one manually takes time — and that is where production tools come in.

With **Renderhane**, you can generate marketplace-compliant white-background cover images, different angles and scene setups from a single product photo. Cropping to the correct ratio, a clean white backdrop and high-resolution output cut the process down significantly compared with manual editing. Even so, it remains your responsibility to compare the result against Trendyol's current requirements before uploading.

## Common Mistakes

- Uploading a landscape photo and having it cropped at the edges in the vertical slot
- Adding text like "50% off" to the main image and getting the listing rejected
- Low-resolution, blurry frames shot hastily with a phone
- Framing where the product looks tiny with huge empty margins
- Using a different shade of white in each image, creating an inconsistent gallery

## Summary

The core formula for Trendyol images is clear: vertical 2:3 ratio, high resolution, a solid white background on the main image, and only the product without text or logos. Meet these standards and your listing publishes smoothly while your product looks more professional in search results. For exact values, always rely on the current rules in the Seller Panel.`,
    },
  },
  {
    slug: "glb-webp-texture-sorunu",
    date: "2025-02-27",
    author: "Renderhane",
    tags: ["3D", "GLB", "WebP", "Teknik"],
    title: {
      tr: "GLB Dosyalarında WebP Texture Sorunu: Neden Oluşur ve Nasıl Çözülür?",
      en: "WebP Texture Issue in GLB Files: Why It Happens and How to Fix It",
    },
    description: {
      tr: "AI ile üretilen 3D modellerde sıkça karşılaşılan EXT_texture_webp uzantı hatasının nedenleri, etkilediği yazılımlar ve pratik çözüm yolları.",
      en: "Causes of the common EXT_texture_webp extension error in AI-generated 3D models, affected software, and practical solutions.",
    },
    content: {
      tr: `
## Sorun Ne?

AI tabanlı 3D model oluşturma araçlarıyla (örneğin Trellis, TripoSR gibi) üretilen GLB dosyalarını indirip bir 3D yazılımda açmak istediğinizde şu hatayla karşılaşabilirsiniz:

\`\`\`
glTF ayrıştırma hatası: Desteklenmeyen uzantı EXT_texture_webp
\`\`\`

Bu hata, 3D modelin içindeki doku (texture) dosyalarının **WebP** formatında kayıtlı olmasından kaynaklanır. Peki neden WebP?

## WebP Nedir ve Neden Kullanılıyor?

**WebP**, Google tarafından geliştirilen bir görsel sıkıştırma formatıdır. JPEG'e kıyasla **%25-35 daha küçük** dosya boyutu sunar ve PNG gibi şeffaflık (alpha channel) desteği sağlar.

AI 3D model oluşturucuları, ürettikleri GLB dosyalarında texture boyutunu minimize etmek için WebP formatını tercih eder. Bu sayede:

- **Daha küçük dosya boyutu** → Hızlı indirme ve transfer
- **Aynı görsel kalite** → Detay kaybı minimum
- **Web uyumluluğu** → Tüm modern tarayıcılar WebP destekler

## glTF ve EXT_texture_webp Uzantısı

**glTF** (GL Transmission Format), 3D modeller için açık standart bir dosya formatıdır. GLB ise glTF'nin binary (ikili) sürümüdür — tüm mesh, materyal ve texture verilerini tek bir dosyada paketler.

Standart glTF formatı texture'lar için yalnızca **JPEG** ve **PNG** formatlarını destekler. WebP kullanabilmek için **EXT_texture_webp** adlı bir uzantı (extension) tanımlanmıştır. Bu uzantıyı destekleyen yazılımlar WebP texture'ları sorunsuz okuyabilirken, desteklemeyenler yukarıdaki hatayı verir.

## Hangi Yazılımlar Destekliyor?

### ✅ Destekleyen Yazılımlar

| Yazılım | Sürüm | Not |
|---------|-------|-----|
| **Three.js** | r152+ | Web tabanlı 3D viewer'lar için standart |
| **Blender** | 4.0+ | Ücretsiz ve açık kaynak 3D editör |
| **Babylon.js** | 6.0+ | Web tabanlı 3D motor |
| **Modern Tarayıcılar** | Chrome, Firefox, Edge | WebGL üzerinden |

### ❌ Desteklemeyen Yazılımlar

| Yazılım | Not |
|---------|-----|
| **Windows 3D Görüntüleyici** | Microsoft'un varsayılan viewer'ı |
| **Paint 3D** | Windows yerleşik uygulaması |
| **Eski Blender Sürümleri** | 3.x ve altı |
| **Bazı CAD Yazılımları** | Endüstriyel CAD araçları |
| **Eski Oyun Motorları** | Güncellenmemiş sürümler |

## Çözüm Yolları

### 1. Doğru Yazılımı Kullanın

En basit çözüm: **Blender 4.0+** kullanın. Ücretsiz, açık kaynak ve EXT_texture_webp uzantısını tam destekler. [blender.org](https://www.blender.org) adresinden indirebilirsiniz.

### 2. Web Tabanlı Viewer Kullanın

GLB dosyalarını doğrudan tarayıcınızda görüntüleyebilirsiniz. Renderhane'nin yerleşik 3D görüntüleyicisi Three.js r183 kullanır ve WebP texture'ları sorunsuz işler.

### 3. Alternatif Format İndirin

Renderhane'de 3D model çıktılarınızı farklı formatlarda indirebilirsiniz:

- **STL** → Geometri-only format, texture içermez. 3D baskı için ideal.
- **OBJ** → Yaygın desteklenen format, texture ayrı dosya olarak gelir.
- **GLTF** → glTF'nin JSON sürümü, daha geniş uyumluluk.

### 4. Texture Dönüştürme (İleri Düzey)

Blender 4.0+ ile GLB dosyasını açıp texture'ları PNG formatına dönüştürebilir ve yeniden dışa aktarabilirsiniz:

1. Blender'da **File → Import → glTF 2.0** ile dosyayı açın
2. **Image Editor** panelinde texture'ları bulun
3. **Image → Save As** ile PNG formatında kaydedin
4. **File → Export → glTF 2.0** ile yeniden dışa aktarın

## Renderhane'de Bu Sorun Var mı?

**Hayır.** Renderhane'nin web tabanlı 3D görüntüleyicisi Three.js r183 kullanır ve EXT_texture_webp uzantısını doğal olarak destekler. Ürettiğiniz 3D modelleri site üzerinde sorunsuz görüntüleyebilir, döndürebilir ve inceleyebilirsiniz.

İndirme menüsünden **STL**, **OBJ** veya **GLTF** formatlarını seçerek uyumsuz yazılımlarla da çalışabilecek dosyalar elde edebilirsiniz.

## Sonuç

EXT_texture_webp hatası, AI ile üretilen 3D modellerin yaygınlaşmasıyla birlikte sıkça karşılaşılan bir sorundur. Temel nedeni, WebP formatının daha yeni olması ve tüm yazılımların henüz bu standardı benimsememiş olmasıdır. Doğru araçları kullanarak veya format dönüşümü yaparak bu sorunu kolayca aşabilirsiniz.
`,
      en: `
## What's the Problem?

When you download GLB files generated by AI-based 3D model creation tools (such as Trellis, TripoSR) and try to open them in a 3D application, you may encounter this error:

\`\`\`
glTF parsing error: Unsupported extension EXT_texture_webp
\`\`\`

This error occurs because the texture files inside the 3D model are stored in **WebP** format. So why WebP?

## What Is WebP and Why Is It Used?

**WebP** is an image compression format developed by Google. It offers **25-35% smaller** file sizes compared to JPEG and provides transparency (alpha channel) support like PNG.

AI 3D model generators prefer WebP format for textures in their GLB files to minimize texture size. This provides:

- **Smaller file size** → Faster downloads and transfers
- **Same visual quality** → Minimal detail loss
- **Web compatibility** → All modern browsers support WebP

## glTF and the EXT_texture_webp Extension

**glTF** (GL Transmission Format) is an open standard file format for 3D models. GLB is the binary version of glTF — it packages all mesh, material, and texture data into a single file.

The standard glTF format only supports **JPEG** and **PNG** formats for textures. To enable WebP usage, an extension called **EXT_texture_webp** was defined. Software that supports this extension can read WebP textures without issues, while unsupported software produces the error above.

## Which Software Supports It?

### ✅ Supported Software

| Software | Version | Note |
|----------|---------|------|
| **Three.js** | r152+ | Standard for web-based 3D viewers |
| **Blender** | 4.0+ | Free and open-source 3D editor |
| **Babylon.js** | 6.0+ | Web-based 3D engine |
| **Modern Browsers** | Chrome, Firefox, Edge | Via WebGL |

### ❌ Unsupported Software

| Software | Note |
|----------|------|
| **Windows 3D Viewer** | Microsoft's default viewer |
| **Paint 3D** | Windows built-in application |
| **Older Blender Versions** | 3.x and below |
| **Some CAD Software** | Industrial CAD tools |
| **Older Game Engines** | Non-updated versions |

## Solutions

### 1. Use the Right Software

The simplest solution: Use **Blender 4.0+**. It's free, open-source, and fully supports the EXT_texture_webp extension. Download it from [blender.org](https://www.blender.org).

### 2. Use a Web-Based Viewer

You can view GLB files directly in your browser. Renderhane's built-in 3D viewer uses Three.js r183 and processes WebP textures seamlessly.

### 3. Download in Alternative Formats

On Renderhane, you can download your 3D model outputs in different formats:

- **STL** → Geometry-only format, contains no textures. Ideal for 3D printing.
- **OBJ** → Widely supported format, textures come as separate files.
- **GLTF** → JSON version of glTF, broader compatibility.

### 4. Texture Conversion (Advanced)

With Blender 4.0+, you can open the GLB file, convert textures to PNG format, and re-export:

1. In Blender, open the file via **File → Import → glTF 2.0**
2. Find textures in the **Image Editor** panel
3. Save as PNG via **Image → Save As**
4. Re-export via **File → Export → glTF 2.0**

## Does Renderhane Have This Issue?

**No.** Renderhane's web-based 3D viewer uses Three.js r183 and natively supports the EXT_texture_webp extension. You can view, rotate, and inspect your generated 3D models on the site without any issues.

From the download menu, you can select **STL**, **OBJ**, or **GLTF** formats to get files that work with incompatible software.

## Conclusion

The EXT_texture_webp error is a commonly encountered issue as AI-generated 3D models become more widespread. The root cause is that WebP format is relatively new, and not all software has adopted this standard yet. By using the right tools or performing format conversion, you can easily overcome this issue.
`,
    },
  },
  {
    slug: "3d-urun-gorselleri-donusum-orani",
    date: "2025-03-01",
    author: "Renderhane",
    tags: ["3D", "E-Ticaret", "Dönüşüm"],
    title: {
      tr: "E-Ticaret'te 3D Ürün Görselleri: Dönüşüm Oranlarını %94-250 Artırmanın Yolu",
      en: "3D Product Visuals in E-Commerce: How to Boost Conversion Rates by 94-250%",
    },
    description: {
      tr: "3D ürün görselleri neden e-ticaret dönüşümlerini dramatik şekilde artırıyor? Araştırma verileri, uygulama örnekleri ve Renderhane ile nasıl başlayacağınız.",
      en: "Why do 3D product visuals dramatically increase e-commerce conversions? Research data, real examples, and how to get started with Renderhane.",
    },
    content: {
      tr: `## Neden 3D Ürün Görselleri?

Online alışverişin en büyük dezavantajı ürüne dokunamama, çevirememe ve gerçek boyutunu hissedememe sorunudur. 3D ürün görselleri tam olarak bu boşluğu dolduruyor.

Shopify'ın 2023 araştırmasına göre, 3D ve AR destekli ürün sayfaları **%94'e varan dönüşüm artışı** sağlıyor. Bazı kategorilerde bu oran **%250'ye** kadar çıkabiliyor.

## İstatistikler Ne Diyor?

3D görsellerin e-ticaretteki etkisini gösteren önemli veriler:

- Ürün iade oranlarında **%40'a kadar düşüş** — müşteriler ürünü daha iyi anladığı için
- Sayfa başına geçirilen sürede **%80 artış** — interaktif içerik kullanıcıyı tutuyor
- Sepete ekleme oranında **%35-65 artış** — güven duygusu satın alma kararını hızlandırıyor
- Mobil cihazlarda dönüşüm oranlarında **2x artış** — dokunmatik etkileşim avantajı

## Hangi Ürün Kategorileri Fayda Sağlıyor?

3D görseller her kategori için eşit değer yaratmaz. En yüksek dönüşüm artışı sağlayan kategoriler:

**Yüksek Etki:**
- Mobilya ve ev dekorasyon
- Ayakkabı ve çanta
- Elektronik cihazlar
- Takı ve aksesuar

**Orta Etki:**
- Giyim (özellikle detaylı parçalar)
- Mutfak gereçleri
- Spor ekipmanları

## Geleneksel Fotoğrafçılık vs 3D Model

| Kriter | Geleneksel Fotoğraf | AI 3D Model |
|--------|-------------------|-------------|
| Maliyet | ₺500-5.000/ürün | ₺2-20/ürün |
| Süre | 2-5 gün | 2-5 dakika |
| Açı sayısı | 4-8 fotoğraf | 360° sonsuz açı |
| Güncelleme | Yeniden çekim | Anında |
| AR desteği | Yok | Var |

## Renderhane ile 3D Model Nasıl Oluşturulur?

1. **Ürün fotoğrafınızı yükleyin** — tek bir fotoğraf yeterli
2. **"3D Model Üret" aracını seçin**
3. **2 dakika içinde** 360 derece döndürülebilir GLB model hazır
4. **E-ticaret sitenize** embed edin veya indirin

Beyaz veya düz arka planlı, net ışıklandırmalı tek ürün fotoğrafları en iyi sonuçları verir.

## Sonuç

3D ürün görselleri artık sadece büyük markaların erişebildiği bir lüks değil. AI teknolojisi sayesinde her ölçekteki e-ticaret mağazası, dakikalar içinde profesyonel 3D modeller oluşturabilir. Dönüşüm oranlarınızı artırmak için ilk adımı atmak hiç bu kadar kolay olmamıştı.
`,
      en: `## Why 3D Product Visuals?

The biggest disadvantage of online shopping is the inability to touch, rotate, and feel the real size of a product. 3D product visuals fill exactly this gap.

According to Shopify's 2023 research, product pages with 3D and AR support achieve **up to 94% conversion increase**. In some categories, this rate can reach **up to 250%**.

## What Do the Statistics Say?

Key data showing the impact of 3D visuals in e-commerce:

- **Up to 40% decrease** in product return rates — customers understand the product better
- **80% increase** in time spent per page — interactive content keeps users engaged
- **35-65% increase** in add-to-cart rates — trust accelerates purchase decisions
- **2x increase** in mobile conversion rates — touchscreen interaction advantage

## Which Product Categories Benefit Most?

3D visuals don't create equal value for every category. Categories with the highest conversion increase:

**High Impact:**
- Furniture and home decor
- Shoes and bags
- Electronic devices
- Jewelry and accessories

**Medium Impact:**
- Clothing (especially detailed pieces)
- Kitchenware
- Sports equipment

## Traditional Photography vs 3D Model

| Criteria | Traditional Photo | AI 3D Model |
|----------|-----------------|-------------|
| Cost | $50-500/product | $0.10-2/product |
| Time | 2-5 days | 2-5 minutes |
| Angle count | 4-8 photos | 360° infinite angles |
| Updates | Re-shoot | Instant |
| AR support | No | Yes |

## How to Create 3D Models with Renderhane

1. **Upload your product photo** — a single photo is enough
2. **Select the "Generate 3D Model" tool**
3. **Within 2 minutes**, your 360-degree rotatable GLB model is ready
4. **Embed it on your e-commerce site** or download it

Photos with white or plain backgrounds, clear lighting, and a single product give the best results.

## Conclusion

3D product visuals are no longer a luxury accessible only to big brands. Thanks to AI technology, e-commerce stores of any size can create professional 3D models in minutes. Taking the first step to boost your conversion rates has never been easier.
`,
    },
  },
  {
    slug: "arkaplan-kaldirma-ai-vs-photoshop",
    date: "2025-03-05",
    author: "Renderhane",
    tags: ["AI", "Fotoğraf Düzenleme", "E-Ticaret"],
    title: {
      tr: "Ürün Fotoğrafı Arka Plan Kaldırma: AI vs Photoshop Karşılaştırması",
      en: "Product Photo Background Removal: AI vs Photoshop Comparison",
    },
    description: {
      tr: "AI arka plan kaldırma araçları Photoshop'un yerini alabilir mi? Hız, kalite ve maliyet karşılaştırması ile doğru aracı seçin.",
      en: "Can AI background removal tools replace Photoshop? Choose the right tool with speed, quality, and cost comparisons.",
    },
    content: {
      tr: `## Arka Plan Kaldırma Neden Önemli?

E-ticarette ürün fotoğrafının profesyonel görünmesi satışları doğrudan etkiler. Pazaryerleri (Amazon, Trendyol, Hepsiburada) genellikle **beyaz veya düz arka plan** zorunluluğu getirir. Temiz bir arka plan:

- Ürüne odaklanmayı artırır
- Profesyonel bir izlenim yaratır
- Pazaryeri kurallarına uyum sağlar
- Farklı sahnelerde kullanım için temel oluşturur

## Photoshop ile Arka Plan Kaldırma

Adobe Photoshop onlarca yıldır endüstri standardı fotoğraf düzenleme aracıdır. Arka plan kaldırma için sunduğu araçlar:

- **Quick Selection Tool** — hızlı ama kaba seçim
- **Pen Tool** — hassas ama yavaş
- **Select Subject** — AI destekli otomatik seçim
- **Channels + Masks** — karmaşık saçlar için en iyi yöntem

**Avantajları:**
- Piksel düzeyinde kontrol
- Karmaşık kenarlar (saç, tüy) için gelişmiş seçenekler
- Büyük dosya desteği

**Dezavantajları:**
- Aylık abonelik maliyeti (₺500+)
- Öğrenme eğrisi yüksek
- Ürün başına 5-30 dakika
- Profesyonel eleman gerektirir

## AI ile Arka Plan Kaldırma

AI araçları derin öğrenme modelleri kullanarak ürünü arka plandan otomatik ayırır. Renderhane'nin arka plan kaldırma aracı:

- **1 saniyede** işlem tamamlanır
- **Sadece 1 kredi** — ₺1'den az maliyet
- Sürükle-bırak arayüz, eğitime gerek yok
- Toplu işlem desteği

## Detaylı Karşılaştırma

| Kriter | Photoshop | AI (Renderhane) |
|--------|-----------|-----------------|
| İşlem süresi | 5-30 dk/ürün | 1-3 saniye/ürün |
| Maliyet | ₺500+/ay | ₺1/ürün |
| Öğrenme süresi | Haftalar | 0 dakika |
| Kalite (basit bg) | Mükemmel | Mükemmel |
| Kalite (karmaşık bg) | Mükemmel | Çok iyi |
| Saç/tüy detayı | Mükemmel | İyi |
| Toplu işlem | Manuel | Otomatik |
| Tutarlılık | Kullanıcıya bağlı | Her zaman tutarlı |

## Ne Zaman Hangisini Kullanmalı?

**AI tercih edin:**
- Yüzlerce ürün fotoğrafı işlemeniz gerektiğinde
- Bütçeniz sınırlı olduğunda
- Hız önceliğiniz olduğunda
- Basit-orta karmaşıklıkta ürünlerde

**Photoshop tercih edin:**
- Çok karmaşık kenarları olan ürünlerde (dantel, saç)
- Piksel düzeyinde mükemmellik gerektiğinde
- Reklam kampanyası hero görseli hazırlarken

## Renderhane İpucu

En iyi sonuçlar için ürün fotoğrafını çekerken yüksek kontrast oluşturun. Açık renkli ürünlerde koyu arka plan, koyu ürünlerde açık arka plan kullanmak AI'ın kenar algılamasını kolaylaştırır.

Arka planı kaldırdıktan sonra **Sahne Üret** aracıyla ürününüze profesyonel bir ortam da ekleyebilirsiniz.
`,
      en: `## Why Is Background Removal Important?

In e-commerce, professional-looking product photos directly impact sales. Marketplaces (Amazon, eBay, Etsy) typically require **white or plain backgrounds**. A clean background:

- Increases focus on the product
- Creates a professional impression
- Ensures marketplace compliance
- Provides a base for use in different scenes

## Background Removal with Photoshop

Adobe Photoshop has been the industry-standard photo editing tool for decades. Tools it offers for background removal:

- **Quick Selection Tool** — fast but rough selection
- **Pen Tool** — precise but slow
- **Select Subject** — AI-powered automatic selection
- **Channels + Masks** — best method for complex hair

**Advantages:**
- Pixel-level control
- Advanced options for complex edges (hair, fur)
- Large file support

**Disadvantages:**
- Monthly subscription cost ($20+/month)
- Steep learning curve
- 5-30 minutes per product
- Requires professional skill

## AI Background Removal

AI tools use deep learning models to automatically separate the product from the background. Renderhane's background removal tool:

- **Completes in 1 second**
- **Only 1 credit** — less than $0.10 cost
- Drag-and-drop interface, no training needed
- Batch processing support

## Detailed Comparison

| Criteria | Photoshop | AI (Renderhane) |
|----------|-----------|-----------------|
| Processing time | 5-30 min/product | 1-3 sec/product |
| Cost | $20+/month | $0.10/product |
| Learning time | Weeks | 0 minutes |
| Quality (simple bg) | Excellent | Excellent |
| Quality (complex bg) | Excellent | Very good |
| Hair/fur detail | Excellent | Good |
| Batch processing | Manual | Automatic |
| Consistency | User-dependent | Always consistent |

## When to Use Which?

**Choose AI:**
- When you need to process hundreds of product photos
- When your budget is limited
- When speed is your priority
- For products with simple-to-medium complexity

**Choose Photoshop:**
- For products with very complex edges (lace, hair)
- When pixel-level perfection is required
- When preparing hero images for ad campaigns

## Renderhane Tip

For the best results, create high contrast when photographing your product. Using a dark background for light-colored products and a light background for dark products makes it easier for AI to detect edges.

After removing the background, you can also add a professional environment to your product using the **Generate Scene** tool.
`,
    },
  },
  {
    slug: "a-plus-icerik-nedir",
    date: "2025-03-10",
    author: "Renderhane",
    tags: ["A+ İçerik", "Amazon", "Pazaryeri"],
    title: {
      tr: "A+ İçerik Nedir? Amazon ve Trendyol'da Satışları Artırmanın Sırrı",
      en: "What Is A+ Content? The Secret to Boosting Sales on Amazon and Marketplaces",
    },
    description: {
      tr: "A+ (Enhanced Brand Content) içeriğin ne olduğu, pazaryerlerinde nasıl kullanıldığı ve AI ile nasıl üretebileceğiniz hakkında kapsamlı rehber.",
      en: "A comprehensive guide on what A+ (Enhanced Brand Content) is, how it's used on marketplaces, and how you can generate it with AI.",
    },
    content: {
      tr: `## A+ İçerik Nedir?

A+ İçerik (Amazon'da "A+ Content" veya "Enhanced Brand Content" olarak bilinir), standart ürün açıklamasının ötesinde zengin görsel ve metin içeriği sunmanıza olanak tanıyan bir pazaryeri özelliğidir.

Standart bir ürün sayfasında sadece metin ve birkaç fotoğraf varken, A+ içerikle:

- **Büyük, yüksek kaliteli görseller** ekleyebilirsiniz
- **Karşılaştırma tabloları** oluşturabilirsiniz
- **Marka hikayesi** anlatabilirsiniz
- **Özellik detaylarını** görsel olarak sunabilirsiniz
- **Yaşam tarzı görselleri** ile ürünü bağlamında gösterebilirsiniz

## Neden A+ İçerik Kullanmalısınız?

Amazon'un kendi verilerine göre A+ içerik kullanan ürünler:

- Satışlarda **%3-10 artış** (bazı kategorilerde %20'ye kadar)
- İade oranlarında **düşüş** — daha bilgilendirilmiş alıcılar
- Sayfa başına geçirilen sürede **artış**
- Marka algısında **güçlenme**

## Hangi Pazaryerlerinde Kullanılır?

| Pazaryeri | İsim | Durum |
|-----------|------|-------|
| Amazon | A+ Content | Aktif |
| Trendyol | Enhanced Content | Aktif |
| Hepsiburada | Gelişmiş İçerik | Aktif |
| N11 | Zengin İçerik | Aktif |

## A+ İçerik Modülleri

Tipik A+ içerik şablonları şunları içerir:

**1. Hero Banner**
Tam genişlikte, etkileyici ürün görseli. Marka mesajını vurgular.

**2. Özellik Vurgulama**
3-4 adet ikon + metin bloku. Her biri ürünün öne çıkan bir özelliğini anlatır.

**3. Karşılaştırma Tablosu**
Aynı markanın farklı ürünlerini veya modelin farklı varyantlarını karşılaştırır.

**4. Yaşam Tarzı Görseli**
Ürünün gerçek kullanım ortamında fotoğrafı. Alıcının kendini hayal etmesini sağlar.

**5. Teknik Detay**
Boyut, malzeme, kullanım talimatı gibi bilgilerin görsel sunumu.

## AI ile A+ İçerik Üretimi

Geleneksel yöntemle A+ içerik üretmek:
- Profesyonel fotoğraf çekimi: ₺2.000-10.000
- Grafik tasarım: ₺1.000-5.000
- Toplam süre: 1-2 hafta

Renderhane ile A+ içerik üretmek:
- **Tek fotoğraf yükleyin**
- **"A+ İçerik Üret" aracını seçin**
- **5 kredi** ile profesyonel A+ görseller hazır
- **2-3 dakika** içinde tamamlanır

AI, ürün fotoğrafınızdan farklı sahneler, yaşam tarzı görselleri ve profesyonel kompozisyonlar oluşturur.

## En İyi Uygulamalar

- Yüksek çözünürlüklü görseller kullanın (minimum 1000x1000 px)
- Her görselde tek bir mesaj verin
- Metin ve görsel dengesini koruyun
- Mobil uyumluluğu kontrol edin
- Marka renklerinizi tutarlı kullanın

## Sonuç

A+ içerik, pazaryerlerinde rekabetten sıyrılmanın en etkili yollarından biridir. AI teknolojisi sayesinde artık büyük bütçelere veya uzun sürelere ihtiyaç duymadan profesyonel A+ içerikler üretebilirsiniz.
`,
      en: `## What Is A+ Content?

A+ Content (known as "Enhanced Brand Content" on Amazon) is a marketplace feature that allows you to present rich visual and text content beyond the standard product description.

While a standard product page only has text and a few photos, with A+ content you can:

- Add **large, high-quality images**
- Create **comparison tables**
- Tell your **brand story**
- Present **feature details** visually
- Show the product in context with **lifestyle images**

## Why Should You Use A+ Content?

According to Amazon's own data, products using A+ content see:

- **3-10% increase** in sales (up to 20% in some categories)
- **Decrease** in return rates — better informed buyers
- **Increase** in time spent per page
- **Strengthened** brand perception

## Which Marketplaces Support It?

| Marketplace | Name | Status |
|-------------|------|--------|
| Amazon | A+ Content | Active |
| eBay | Enhanced Listings | Active |
| Walmart | Enhanced Content | Active |
| Etsy | Rich Descriptions | Partial |

## A+ Content Modules

Typical A+ content templates include:

**1. Hero Banner**
Full-width, impactful product image. Highlights the brand message.

**2. Feature Highlights**
3-4 icon + text blocks. Each describes a key feature of the product.

**3. Comparison Table**
Compares different products from the same brand or different variants of the model.

**4. Lifestyle Image**
Photo of the product in its real usage environment. Helps buyers envision themselves using it.

**5. Technical Detail**
Visual presentation of dimensions, materials, usage instructions, and other information.

## AI-Powered A+ Content Generation

Traditional A+ content creation:
- Professional photography: $200-1,000
- Graphic design: $100-500
- Total time: 1-2 weeks

Creating A+ content with Renderhane:
- **Upload a single photo**
- **Select the "Generate A+ Content" tool**
- **5 credits** for professional A+ visuals
- **Completed in 2-3 minutes**

AI creates different scenes, lifestyle images, and professional compositions from your product photo.

## Best Practices

- Use high-resolution images (minimum 1000x1000 px)
- Convey a single message per image
- Maintain a balance between text and visuals
- Check mobile compatibility
- Use your brand colors consistently

## Conclusion

A+ content is one of the most effective ways to stand out from competition on marketplaces. Thanks to AI technology, you can now produce professional A+ content without large budgets or long timelines.
`,
    },
  },
  {
    slug: "ai-urun-videosu-olusturma",
    date: "2025-03-15",
    author: "Renderhane",
    tags: ["Video", "AI", "E-Ticaret"],
    title: {
      tr: "AI ile Ürün Videosu Oluşturma: Statik Fotoğraftan Tanıtım Filmine",
      en: "Creating Product Videos with AI: From Static Photo to Promotional Film",
    },
    description: {
      tr: "Tek bir ürün fotoğrafından AI ile profesyonel tanıtım videoları nasıl oluşturulur? Video pazarlama trendleri ve pratik rehber.",
      en: "How to create professional promotional videos from a single product photo using AI. Video marketing trends and practical guide.",
    },
    content: {
      tr: `## Video Pazarlamanın Yükselişi

E-ticarette videonun gücü inkar edilemez. Güncel veriler:

- Alıcıların **%73'ü** video izledikten sonra satın alma kararı veriyor
- Video içeren ürün sayfaları **%80 daha yüksek** dönüşüm oranına sahip
- Sosyal medyada video içerikler **3x daha fazla** paylaşılıyor
- Mobil kullanıcıların **%85'i** ürün videoları izliyor

## Geleneksel Ürün Videosu Üretimi

Profesyonel bir ürün tanıtım videosu çekmek genellikle şunları gerektirir:

- **Stüdyo kiralama**: ₺1.000-5.000/gün
- **Kameraman ve ekipman**: ₺2.000-10.000
- **Post-prodüksiyon**: ₺1.000-5.000
- **Toplam süre**: 3-7 gün
- **Toplam maliyet**: ₺5.000-20.000+

Bu maliyetler, özellikle çok sayıda ürüne sahip mağazalar için ciddi bir yük oluşturur.

## AI Video Üretimi Nasıl Çalışır?

AI video üretimi, derin öğrenme modellerini kullanarak statik bir görüntüden hareket ve derinlik bilgisi çıkarır ve bunu tutarlı bir video sekansına dönüştürür.

Temel adımlar:

1. **Görüntü analizi** — AI, ürünün şeklini, dokusunu ve ışığını analiz eder
2. **Hareket tahmini** — Doğal kamera hareketi veya ürün rotasyonu planlanır
3. **Kare üretimi** — Her bir video karesi tutarlı şekilde üretilir
4. **Video birleştirme** — Kareler akıcı bir video haline getirilir

## Renderhane ile Video Oluşturma

Renderhane'nin "Video Oluştur" aracı bu süreci tamamen otomatikleştirir:

1. **Ürün fotoğrafını yükleyin**
2. **"Video Oluştur" aracını seçin**
3. İsteğe bağlı olarak **prompt yazın** (örn: "Yumuşak kamera hareketi ile zarif ürün tanıtımı")
4. **10 kredi** ile profesyonel video hazır
5. **MP4 formatında** indirin

## Video Türleri

AI ile oluşturabileceğiniz video türleri:

**Ürün Tanıtım Videosu**
Ürünün farklı açılardan gösterildiği, zarif kamera hareketli kısa videolar. Ürün sayfaları için ideal.

**Sosyal Medya İçeriği**
Instagram Reels, TikTok ve YouTube Shorts için dikkat çekici kısa videolar.

**Reklam Materyali**
Facebook ve Google reklamları için kullanılabilecek profesyonel ürün videoları.

## En İyi Sonuçlar İçin İpuçları

- **Yüksek çözünürlüklü** fotoğraf kullanın (minimum 512x512, ideal 1024x1024)
- **Net ve keskin** ürün fotoğrafları tercih edin
- **Basit arka plan** en iyi sonuçları verir
- **İyi aydınlatılmış** fotoğraflar daha doğal video üretir
- Prompt ile **kamera hareketini** yönlendirebilirsiniz

## Sonuç

AI video üretimi, e-ticaret pazarlamasında devrim yaratıyor. Tek bir fotoğraftan dakikalar içinde profesyonel tanıtım videoları oluşturmak artık mümkün. Video içerik stratejinize AI'ı dahil ederek rakiplerinizin önüne geçebilirsiniz.
`,
      en: `## The Rise of Video Marketing

The power of video in e-commerce is undeniable. Current data:

- **73% of buyers** make purchasing decisions after watching a video
- Product pages with video have **80% higher** conversion rates
- Video content on social media gets **3x more** shares
- **85% of mobile users** watch product videos

## Traditional Product Video Production

Shooting a professional product promotional video typically requires:

- **Studio rental**: $100-500/day
- **Camera operator and equipment**: $200-1,000
- **Post-production**: $100-500
- **Total time**: 3-7 days
- **Total cost**: $500-2,000+

These costs create a significant burden, especially for stores with many products.

## How AI Video Generation Works

AI video generation uses deep learning models to extract motion and depth information from a static image and convert it into a consistent video sequence.

Key steps:

1. **Image analysis** — AI analyzes the product's shape, texture, and lighting
2. **Motion estimation** — Natural camera movement or product rotation is planned
3. **Frame generation** — Each video frame is produced consistently
4. **Video compilation** — Frames are assembled into a smooth video

## Creating Videos with Renderhane

Renderhane's "Create Video" tool fully automates this process:

1. **Upload your product photo**
2. **Select the "Create Video" tool**
3. Optionally **write a prompt** (e.g., "Elegant product showcase with gentle camera movement")
4. **10 credits** for a professional video
5. **Download in MP4 format**

## Video Types

Types of videos you can create with AI:

**Product Showcase Video**
Short videos showing the product from different angles with elegant camera movements. Ideal for product pages.

**Social Media Content**
Eye-catching short videos for Instagram Reels, TikTok, and YouTube Shorts.

**Ad Material**
Professional product videos that can be used for Facebook and Google ads.

## Tips for Best Results

- Use **high-resolution** photos (minimum 512x512, ideal 1024x1024)
- Prefer **sharp and clear** product photos
- **Simple backgrounds** give the best results
- **Well-lit** photos produce more natural video
- You can guide **camera movement** with prompts

## Conclusion

AI video generation is revolutionizing e-commerce marketing. Creating professional promotional videos from a single photo in minutes is now possible. By incorporating AI into your video content strategy, you can stay ahead of your competitors.
`,
    },
  },
  {
    slug: "e-ticaret-urun-fotografciligi-rehberi",
    date: "2025-03-20",
    author: "Renderhane",
    tags: ["Fotoğrafçılık", "E-Ticaret", "Rehber"],
    title: {
      tr: "E-Ticaret Ürün Fotoğrafçılığı Rehberi: Profesyonel Sonuçlar İçin İpuçları",
      en: "E-Commerce Product Photography Guide: Tips for Professional Results",
    },
    description: {
      tr: "Telefonunuzla bile profesyonel ürün fotoğrafları çekebilirsiniz. Işık, arka plan, kompozisyon ipuçları ve AI ile iyileştirme rehberi.",
      en: "You can take professional product photos even with your phone. Tips on lighting, backgrounds, composition, and AI enhancement guide.",
    },
    content: {
      tr: `## Neden İyi Ürün Fotoğrafları Önemli?

E-ticarette ürün fotoğrafı, mağazanızın vitrinidir. Araştırmalara göre:

- Alıcıların **%93'ü** satın alma kararında görseli en önemli faktör olarak görüyor
- Kalitesiz fotoğraflar **%22 daha yüksek** iade oranına neden oluyor
- Profesyonel görseller güven duygusunu **%60** artırıyor

## Temel Ekipman

Başlamak için pahalı ekipmana ihtiyacınız yok:

**Minimum Gereksinimler:**
- Akıllı telefon (2020 ve sonrası model yeterli)
- Beyaz karton veya kumaş (arka plan)
- Doğal ışık kaynağı (pencere)

**İdeal Kurulum:**
- DSLR veya aynasız kamera
- Softbox veya LED panel (2 adet)
- Fotoğraf çadırı (lightbox)
- Tripod

## Işık Ayarları

Işık, fotoğraf kalitesinin en önemli faktörüdür.

**Doğal Işık Kullanımı:**
- Büyük bir pencerenin yanında çekim yapın
- Direkt güneş ışığından kaçının (gölge oluşturur)
- Bulutlu günler en iyi doğal ışığı sağlar
- Beyaz karton ile ışığı yansıtarak gölgeleri yumuşatın

**Yapay Işık Kullanımı:**
- İki ışık kaynağını 45 derece açıyla yerleştirin
- Softbox veya difüzör kullanarak sert gölgeleri önleyin
- Renk sıcaklığını tutarlı tutun (5500K gün ışığı)

## Arka Plan Seçimi

- **Beyaz arka plan**: Pazaryerleri için standart, temiz ve profesyonel
- **Gri arka plan**: Beyaz ürünler için kontrast sağlar
- **Yaşam tarzı**: Ürünü kullanım ortamında gösterir (AI ile de oluşturabilirsiniz)

## Kompozisyon Kuralları

- Ürünü karenin merkezine yerleştirin
- Çevresinde yeterli boşluk bırakın (%20-30 marj)
- Birden fazla açıdan çekin: ön, arka, yan, detay
- Ölçek referansı verin (gerektiğinde)

## Telefon ile Çekim İpuçları

- **HDR modunu** kapatın (doğal renk için)
- **Portre modunu** kullanmayın (arka plan bulanıklığı istenmeyen)
- **Grid çizgilerini** açın (kompozisyon için)
- **Zamanlayıcı** kullanın (titreşimi önlemek için)
- **RAW format** destekleniyorsa tercih edin

## AI ile Fotoğraf İyileştirme

Çektiğiniz fotoğrafları Renderhane'nin AI araçlarıyla profesyonel seviyeye taşıyabilirsiniz:

1. **Arka Plan Kaldırma** (1 kredi) — Dağınık arka planları anında temizleyin
2. **Görsel İyileştirme** (2 kredi) — Düşük çözünürlüklü fotoğrafları netleştirin
3. **Sahne Üretimi** (3 kredi) — Ürüne profesyonel bir ortam ekleyin
4. **3D Model** (10 kredi) — 360° görüntülenebilir model oluşturun

## Yaygın Hatalar

- **Düşük çözünürlük**: Minimum 1000x1000 piksel kullanın
- **Kötü ışık**: Karanlık veya sert gölgeli fotoğraflardan kaçının
- **Tutarsız stil**: Tüm ürünlerde aynı ışık ve arka planı kullanın
- **Çok fazla düzenleme**: Doğal görünümü koruyun
- **Yanlış renk**: Monitör kalibrasyonu yapın

## Sonuç

İyi bir ürün fotoğrafı çekmek karmaşık veya pahalı olmak zorunda değil. Temel kuralları uygulayarak ve AI araçlarıyla destekleyerek, profesyonel stüdyo kalitesinde görseller elde edebilirsiniz. Önemli olan tutarlılık ve ürünün en iyi şekilde temsil edilmesidir.
`,
      en: `## Why Are Good Product Photos Important?

In e-commerce, product photography is your store's window display. According to research:

- **93% of buyers** consider visuals the most important factor in purchasing decisions
- Low-quality photos cause **22% higher** return rates
- Professional visuals increase trust by **60%**

## Basic Equipment

You don't need expensive equipment to get started:

**Minimum Requirements:**
- Smartphone (2020 or newer model is sufficient)
- White cardboard or fabric (background)
- Natural light source (window)

**Ideal Setup:**
- DSLR or mirrorless camera
- Softbox or LED panel (2 units)
- Photo tent (lightbox)
- Tripod

## Lighting Setup

Lighting is the most important factor in photo quality.

**Using Natural Light:**
- Shoot near a large window
- Avoid direct sunlight (creates harsh shadows)
- Cloudy days provide the best natural light
- Use white cardboard to reflect light and soften shadows

**Using Artificial Light:**
- Position two light sources at 45-degree angles
- Use softboxes or diffusers to prevent hard shadows
- Keep color temperature consistent (5500K daylight)

## Background Selection

- **White background**: Standard for marketplaces, clean and professional
- **Gray background**: Provides contrast for white products
- **Lifestyle**: Shows the product in its usage environment (can also be created with AI)

## Composition Rules

- Place the product at the center of the frame
- Leave sufficient space around it (20-30% margin)
- Shoot from multiple angles: front, back, side, detail
- Provide scale reference (when needed)

## Phone Photography Tips

- **Turn off HDR** mode (for natural color)
- **Don't use Portrait** mode (unwanted background blur)
- **Enable grid lines** (for composition)
- **Use a timer** (to prevent shake)
- **Prefer RAW format** if supported

## AI Photo Enhancement

You can elevate your photos to professional level with Renderhane's AI tools:

1. **Background Removal** (1 credit) — Instantly clean up messy backgrounds
2. **Image Enhancement** (2 credits) — Sharpen low-resolution photos
3. **Scene Generation** (3 credits) — Add a professional environment to your product
4. **3D Model** (10 credits) — Create a 360° viewable model

## Common Mistakes

- **Low resolution**: Use minimum 1000x1000 pixels
- **Poor lighting**: Avoid dark or harsh-shadowed photos
- **Inconsistent style**: Use the same lighting and background for all products
- **Over-editing**: Maintain a natural look
- **Wrong colors**: Calibrate your monitor

## Conclusion

Taking a good product photo doesn't have to be complicated or expensive. By applying basic rules and enhancing with AI tools, you can achieve professional studio-quality visuals. What matters is consistency and representing your product in the best possible way.
`,
    },
  },
];

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): BlogArticle[] {
  return [...articles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

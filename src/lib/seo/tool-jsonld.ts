/**
 * Schema.org JSON-LD generators for tool pages (FAQPage + HowTo).
 *
 * Usage in layout.tsx:
 *   import { TOOL_SEO } from "@/lib/seo/tool-jsonld";
 *   const seo = TOOL_SEO["arka-plan-kaldirma"];
 *   // render seo.jsonLd(locale) in <script type="application/ld+json">
 */

const BASE_URL = "https://www.renderhane.com";

/* ── Types ──────────────────────────────────── */

interface FAQ {
  q: { tr: string; en: string };
  a: { tr: string; en: string };
}

interface HowToStep {
  name: { tr: string; en: string };
  text: { tr: string; en: string };
}

interface ToolSEOConfig {
  slug: string;
  name: { tr: string; en: string };
  description: { tr: string; en: string };
  faqs: FAQ[];
  steps: HowToStep[];
}

/* ── Generator ──────────────────────────────── */

function buildJsonLd(config: ToolSEOConfig, locale: string) {
  const tr = locale === "tr";
  const url = `${BASE_URL}/${locale}/araclar/${config.slug}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: config.faqs.map((faq) => ({
          "@type": "Question",
          name: tr ? faq.q.tr : faq.q.en,
          acceptedAnswer: {
            "@type": "Answer",
            text: tr ? faq.a.tr : faq.a.en,
          },
        })),
      },
      {
        "@type": "HowTo",
        name: tr ? config.name.tr : config.name.en,
        description: tr ? config.description.tr : config.description.en,
        url,
        totalTime: "PT2M",
        tool: { "@type": "SoftwareApplication", name: "Renderhane" },
        step: config.steps.map((s, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: tr ? s.name.tr : s.name.en,
          text: tr ? s.text.tr : s.text.en,
        })),
      },
    ],
  };
}

/* ── Tool Data ──────────────────────────────── */

const toolConfigs: ToolSEOConfig[] = [
  // ─── Arka Plan Kaldırma ───
  {
    slug: "arka-plan-kaldirma",
    name: {
      tr: "AI ile Arka Plan Kaldırma",
      en: "AI Background Removal",
    },
    description: {
      tr: "Fotoğraflardan arka planı saniyeler içinde kaldırın",
      en: "Remove backgrounds from photos in seconds",
    },
    faqs: [
      {
        q: { tr: "Arka plan kaldırma ücretsiz mi?", en: "Is background removal free?" },
        a: {
          tr: "Evet, günde 3 adet ücretsiz kullanım hakkınız var. Kayıt olmadan hemen kullanabilirsiniz.",
          en: "Yes, you get 3 free uses per day. You can use it immediately without signing up.",
        },
      },
      {
        q: { tr: "Hangi dosya formatları destekleniyor?", en: "What file formats are supported?" },
        a: {
          tr: "JPG ve PNG formatları desteklenir. Maksimum dosya boyutu 5MB'dir. Sonuç şeffaf arka planlı PNG olarak indirilir.",
          en: "JPG and PNG formats are supported. Maximum file size is 5MB. Results are downloaded as transparent PNG.",
        },
      },
      {
        q: {
          tr: "Arka planı kaldırılmış görseli nerede kullanabilirim?",
          en: "Where can I use the background-removed image?",
        },
        a: {
          tr: "E-ticaret ürün görselleri, sosyal medya içerikleri, grafik tasarım projeleri, pazaryeri listeleme görselleri ve sunumlarda kullanabilirsiniz.",
          en: "You can use it for e-commerce product photos, social media content, graphic design projects, marketplace listings, and presentations.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Fotoğraf yükleyin", en: "Upload your photo" },
        text: {
          tr: "Arka planını kaldırmak istediğiniz fotoğrafı sürükleyip bırakın veya dosya seçici ile yükleyin. JPG veya PNG, maksimum 5MB.",
          en: "Drag and drop or use the file picker to upload the photo you want to remove the background from. JPG or PNG, max 5MB.",
        },
      },
      {
        name: { tr: "AI işlemesini bekleyin", en: "Wait for AI processing" },
        text: {
          tr: "AI modelimiz fotoğraftaki nesneyi otomatik olarak algılar ve arka planı temizler. İşlem birkaç saniye sürer.",
          en: "Our AI model automatically detects the object in the photo and removes the background. Processing takes a few seconds.",
        },
      },
      {
        name: { tr: "Sonucu indirin", en: "Download the result" },
        text: {
          tr: "Şeffaf arka planlı PNG dosyasını indirin. Doğrudan e-ticaret sitenizde veya tasarım projelerinizde kullanın.",
          en: "Download the transparent PNG file. Use it directly on your e-commerce site or design projects.",
        },
      },
    ],
  },

  // ─── 3D Model ───
  {
    slug: "3d-model",
    name: {
      tr: "Fotoğraftan 3D Model Oluşturma",
      en: "Photo to 3D Model Generation",
    },
    description: {
      tr: "Tek fotoğraftan AI ile profesyonel 3D model oluşturun",
      en: "Create professional 3D models from a single photo with AI",
    },
    faqs: [
      {
        q: { tr: "Tek fotoğraftan 3D model yapılabilir mi?", en: "Can I create a 3D model from a single photo?" },
        a: {
          tr: "Evet, AI modelimiz tek bir ürün fotoğrafından detaylı 3D model oluşturabilir. Daha iyi sonuç için birden fazla açıdan fotoğraf da yükleyebilirsiniz.",
          en: "Yes, our AI can create detailed 3D models from a single product photo. For better results, you can also upload photos from multiple angles.",
        },
      },
      {
        q: { tr: "3D modeli hangi formatta indirebilirim?", en: "What format can I download the 3D model in?" },
        a: {
          tr: "Modeller GLB formatında indirilir. GLB, web tarayıcıları, Unity, Unreal Engine, Blender ve 3D yazıcılar ile uyumludur.",
          en: "Models are downloaded in GLB format. GLB is compatible with web browsers, Unity, Unreal Engine, Blender, and 3D printers.",
        },
      },
      {
        q: { tr: "3D model oluşturmak kaç kredi harcar?", en: "How many credits does 3D model generation cost?" },
        a: {
          tr: "Model kalitesine göre 5 ile 30 kredi arasında değişir. Hızlı model 5, standart 15, premium kalite 30 kredi harcar. Kayıt olunca 50 ücretsiz kredi hediye edilir.",
          en: "It ranges from 5 to 30 credits depending on quality. Fast model costs 5, standard 15, premium quality 30 credits. You get 50 free credits on signup.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Ürün fotoğrafını yükleyin", en: "Upload product photo" },
        text: {
          tr: "Ürününüzün net, iyi aydınlatılmış bir fotoğrafını yükleyin. Tek veya çoklu açıdan fotoğraf kabul edilir.",
          en: "Upload a clear, well-lit photo of your product. Single or multi-angle photos are accepted.",
        },
      },
      {
        name: { tr: "AI modelini seçin", en: "Choose AI model" },
        text: {
          tr: "Hızlı (5 kredi), standart (15 kredi) veya premium (30 kredi) kalite seviyesinden birini seçin.",
          en: "Select from fast (5 credits), standard (15 credits), or premium (30 credits) quality tiers.",
        },
      },
      {
        name: { tr: "3D modeli oluşturun", en: "Generate the 3D model" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI, fotoğrafınızı analiz ederek birkaç dakika içinde 3D model üretir.",
          en: "Click generate. AI analyzes your photo and produces a 3D model within a few minutes.",
        },
      },
      {
        name: { tr: "GLB olarak indirin", en: "Download as GLB" },
        text: {
          tr: "Tamamlanan modeli 360 derece önizleyin ve GLB formatında indirin. E-ticaret, oyun motoru veya 3D yazıcıda kullanın.",
          en: "Preview the completed model in 360 degrees and download in GLB format. Use in e-commerce, game engines, or 3D printers.",
        },
      },
    ],
  },

  // ─── AI Görsel Üret ───
  {
    slug: "ai-gorsel-uret",
    name: {
      tr: "AI ile Görsel Üretme",
      en: "AI Image Generation",
    },
    description: {
      tr: "Metin açıklamasından profesyonel görseller oluşturun",
      en: "Create professional images from text descriptions",
    },
    faqs: [
      {
        q: { tr: "Metin açıklamasını nasıl yazmalıyım?", en: "How should I write the text prompt?" },
        a: {
          tr: "Ne istediğinizi detaylı ve net bir şekilde yazın. Renk, stil, kompozisyon gibi detaylar eklemek daha iyi sonuçlar verir. Hem Türkçe hem İngilizce kullanabilirsiniz.",
          en: "Write what you want in detail and clearly. Adding specifics like color, style, and composition gives better results. You can use both Turkish and English.",
        },
      },
      {
        q: { tr: "Hangi görsel stilleri mevcut?", en: "What image styles are available?" },
        a: {
          tr: "Fotogerçekçi, illüstrasyon, dijital sanat, suluboya, çizim ve daha fazlası. FLUX AI modeli ile yüksek kaliteli sonuçlar üretilir.",
          en: "Photorealistic, illustration, digital art, watercolor, sketch and more. High-quality results are produced with the FLUX AI model.",
        },
      },
      {
        q: { tr: "Üretilen görselleri ticari olarak kullanabilir miyim?", en: "Can I use generated images commercially?" },
        a: {
          tr: "Evet, Renderhane ile ürettiğiniz görseller ticari projelerde kullanılabilir. E-ticaret, sosyal medya, reklamlar ve web siteleri için uygundur.",
          en: "Yes, images generated with Renderhane can be used in commercial projects. Suitable for e-commerce, social media, ads, and websites.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Metin açıklaması yazın", en: "Write a text prompt" },
        text: {
          tr: "Oluşturmak istediğiniz görseli detaylı olarak tanımlayın. Stil, renk ve kompozisyon bilgisi ekleyin.",
          en: "Describe the image you want to create in detail. Add style, color, and composition information.",
        },
      },
      {
        name: { tr: "Stil ve ayarları seçin", en: "Choose style and settings" },
        text: {
          tr: "Görsel boyutunu ve stil tercihlerinizi belirleyin.",
          en: "Set the image dimensions and your style preferences.",
        },
      },
      {
        name: { tr: "Görseli oluşturun", en: "Generate the image" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI birkaç saniye içinde görselinizi üretir.",
          en: "Click generate. AI produces your image within seconds.",
        },
      },
      {
        name: { tr: "İndirin ve kullanın", en: "Download and use" },
        text: {
          tr: "Sonucu beğendiyseniz yüksek çözünürlükte indirin. E-ticaret, sosyal medya veya tasarım projelerinizde kullanın.",
          en: "If you like the result, download in high resolution. Use in your e-commerce, social media, or design projects.",
        },
      },
    ],
  },

  // ─── A+ İçerik ───
  {
    slug: "aplus-icerik",
    name: {
      tr: "A+ İçerik Oluşturma",
      en: "A+ Content Generation",
    },
    description: {
      tr: "Amazon ve pazaryerleri için profesyonel A+ ürün görselleri oluşturun",
      en: "Create professional A+ product visuals for Amazon and marketplaces",
    },
    faqs: [
      {
        q: { tr: "A+ içerik nedir?", en: "What is A+ content?" },
        a: {
          tr: "A+ içerik, Amazon ve pazaryerlerinde ürün sayfalarını zenginleştiren profesyonel görseller ve düzenlerdir. Dönüşüm oranlarını ortalama %5-10 artırdığı bilinmektedir.",
          en: "A+ content refers to professional visuals and layouts that enrich product pages on Amazon and marketplaces. It is known to increase conversion rates by an average of 5-10%.",
        },
      },
      {
        q: { tr: "Hangi pazaryerleri için kullanılabilir?", en: "Which marketplaces is it compatible with?" },
        a: {
          tr: "Amazon, Trendyol, Hepsiburada ve diğer pazaryerleri için uygun boyut ve formatta görseller üretilir.",
          en: "Images are generated in suitable sizes and formats for Amazon, Trendyol, Hepsiburada, and other marketplaces.",
        },
      },
      {
        q: { tr: "Kaç farklı varyasyon oluşturulur?", en: "How many variations are created?" },
        a: {
          tr: "Her işlemde farklı sahne ve açılarla profesyonel ürün görselleri oluşturulur. Birden fazla varyasyon üreterek en uygun olanı seçebilirsiniz.",
          en: "Professional product visuals are created with different scenes and angles in each process. You can generate multiple variations and choose the best one.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Ürün fotoğrafını yükleyin", en: "Upload product photo" },
        text: {
          tr: "Ürününüzün arka planı temiz bir fotoğrafını yükleyin. AI ürünü otomatik algılar.",
          en: "Upload a clean background photo of your product. AI automatically detects the product.",
        },
      },
      {
        name: { tr: "Sahne ve stil seçin", en: "Choose scene and style" },
        text: {
          tr: "Hazır sahne şablonlarından birini seçin veya özel sahne açıklaması yazın.",
          en: "Select from ready-made scene templates or write a custom scene description.",
        },
      },
      {
        name: { tr: "A+ görseli oluşturun", en: "Generate A+ visual" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI ürününüzü profesyonel bir sahneye yerleştirir.",
          en: "Click generate. AI places your product into a professional scene.",
        },
      },
      {
        name: { tr: "İndirin ve listelemeye ekleyin", en: "Download and add to listing" },
        text: {
          tr: "Sonucu indirin ve pazaryeri ürün sayfanıza yükleyin.",
          en: "Download the result and upload it to your marketplace product page.",
        },
      },
    ],
  },

  // ─── Görsel Düzenle ───
  {
    slug: "gorsel-duzenle",
    name: {
      tr: "AI ile Görsel Düzenleme",
      en: "AI Image Editing",
    },
    description: {
      tr: "FLUX AI modeli ile fotoğraflarınızı profesyonelce düzenleyin",
      en: "Edit your photos professionally with FLUX AI model",
    },
    faqs: [
      {
        q: { tr: "Ne tür düzenlemeler yapabilirim?", en: "What kind of edits can I make?" },
        a: {
          tr: "Renk değiştirme, nesne ekleme/çıkarma, stil transferi, metin ekleme ve daha fazlası. Metinle tarif ettiğiniz değişiklikler AI tarafından uygulanır.",
          en: "Color changes, object addition/removal, style transfer, text overlay, and more. Changes you describe in text are applied by AI.",
        },
      },
      {
        q: { tr: "Orijinal fotoğraf bozulur mu?", en: "Does the original photo get damaged?" },
        a: {
          tr: "Hayır, orijinal fotoğrafınız korunur. AI düzenlenmiş yeni bir kopya oluşturur. İstediğiniz kadar farklı düzenleme deneyebilirsiniz.",
          en: "No, your original photo is preserved. AI creates a new edited copy. You can try as many different edits as you want.",
        },
      },
      {
        q: { tr: "FLUX modeli nedir?", en: "What is the FLUX model?" },
        a: {
          tr: "FLUX, yüksek kaliteli görsel düzenleme yapabilen gelişmiş bir AI modelidir. Doğal dil komutlarıyla hassas düzenlemeler yapabilir.",
          en: "FLUX is an advanced AI model capable of high-quality image editing. It can make precise edits using natural language commands.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Fotoğrafı yükleyin", en: "Upload your photo" },
        text: {
          tr: "Düzenlemek istediğiniz fotoğrafı yükleyin.",
          en: "Upload the photo you want to edit.",
        },
      },
      {
        name: { tr: "Düzenleme talimatı yazın", en: "Write editing instructions" },
        text: {
          tr: "Yapmak istediğiniz değişikliği metin olarak tarif edin. Orn: 'Arka planı mavi yap' veya 'Ürünün rengini kırmızıya çevir'.",
          en: "Describe the change you want as text. E.g., 'Make the background blue' or 'Change the product color to red'.",
        },
      },
      {
        name: { tr: "Sonucu kontrol edin", en: "Review the result" },
        text: {
          tr: "AI düzenlenmiş görseli oluşturur. Beğenmezseniz talimatı değiştirip tekrar deneyin.",
          en: "AI generates the edited image. If you don't like it, modify the instructions and try again.",
        },
      },
    ],
  },

  // ─── Görsel İyileştir ───
  {
    slug: "gorsel-iyilestir",
    name: {
      tr: "AI ile Görsel İyileştirme",
      en: "AI Image Enhancement",
    },
    description: {
      tr: "Düşük çözünürlüklü görselleri AI ile yüksek kaliteye taşıyın",
      en: "Upscale low-resolution images to high quality with AI",
    },
    faqs: [
      {
        q: { tr: "Çözünürlük ne kadar artırılır?", en: "How much is the resolution increased?" },
        a: {
          tr: "AI modelimiz görselleri 4 kata kadar büyütebilir. 500x500 piksellik bir görsel 2000x2000 piksele çıkarılabilir, detaylar korunarak.",
          en: "Our AI model can upscale images up to 4x. A 500x500 pixel image can be upscaled to 2000x2000 pixels while preserving details.",
        },
      },
      {
        q: { tr: "Bulanık fotoğraflar düzelir mi?", en: "Can blurry photos be fixed?" },
        a: {
          tr: "Evet, AI bulanıklığı azaltır ve eksik detayları akıllıca tamamlar. Ancak çok düşük kaliteli veya aşırı bulanık görsellerde sonuç sınırlı olabilir.",
          en: "Yes, AI reduces blur and intelligently fills in missing details. However, results may be limited for very low quality or extremely blurry images.",
        },
      },
      {
        q: { tr: "Hangi dosya formatları destekleniyor?", en: "What file formats are supported?" },
        a: {
          tr: "JPG ve PNG formatları desteklenir. Sonuç yüksek çözünürlüklü PNG olarak indirilir.",
          en: "JPG and PNG formats are supported. Results are downloaded as high-resolution PNG.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Görseli yükleyin", en: "Upload your image" },
        text: {
          tr: "İyileştirmek istediğiniz düşük çözünürlüklü görseli yükleyin.",
          en: "Upload the low-resolution image you want to enhance.",
        },
      },
      {
        name: { tr: "AI iyileştirmesini başlatın", en: "Start AI enhancement" },
        text: {
          tr: "İyileştir butonuna tıklayın. AI görseli analiz eder ve detayları artırarak büyütür.",
          en: "Click enhance. AI analyzes the image and upscales it while adding details.",
        },
      },
      {
        name: { tr: "HD sonucu indirin", en: "Download HD result" },
        text: {
          tr: "İyileştirilmiş yüksek çözünürlüklü görseli indirin. E-ticaret, baskı veya web projeleri için kullanın.",
          en: "Download the enhanced high-resolution image. Use for e-commerce, print, or web projects.",
        },
      },
    ],
  },

  // ─── Konuşan Avatar ───
  {
    slug: "konusan-avatar",
    name: {
      tr: "AI Konuşan Avatar Oluşturma",
      en: "AI Talking Avatar Creation",
    },
    description: {
      tr: "Fotoğraftan konuşan avatar videosu oluşturun",
      en: "Create talking avatar videos from photos",
    },
    faqs: [
      {
        q: { tr: "Avatar sesli mi konuşuyor?", en: "Does the avatar speak with audio?" },
        a: {
          tr: "Evet, yüklediğiniz ses dosyasına veya yazdığınız metne göre avatar gerçekçi dudak hareketleriyle konuşur.",
          en: "Yes, the avatar speaks with realistic lip movements based on your uploaded audio file or typed text.",
        },
      },
      {
        q: { tr: "Kendi fotoğrafımı kullanabilir miyim?", en: "Can I use my own photo?" },
        a: {
          tr: "Evet, herhangi bir portre fotoğrafı yükleyebilirsiniz. AI yüz ifadelerini ve dudak hareketlerini otomatik oluşturur.",
          en: "Yes, you can upload any portrait photo. AI automatically generates facial expressions and lip movements.",
        },
      },
      {
        q: { tr: "Video süresi ne kadar?", en: "What is the video duration?" },
        a: {
          tr: "Ses dosyanızın süresine göre değişir. Kısa tanıtımlardan uzun sunumlara kadar farklı uzunluklarda video oluşturabilirsiniz.",
          en: "It varies based on your audio file duration. You can create videos of different lengths from short introductions to long presentations.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Portre fotoğrafı yükleyin", en: "Upload portrait photo" },
        text: {
          tr: "Konuşturmak istediğiniz kişinin net bir portre fotoğrafını yükleyin. Yüz açıkça görünmeli.",
          en: "Upload a clear portrait photo of the person you want to animate. The face should be clearly visible.",
        },
      },
      {
        name: { tr: "Ses veya metin ekleyin", en: "Add audio or text" },
        text: {
          tr: "Konuşma ses dosyası yükleyin veya metinden sese çevrim kullanın.",
          en: "Upload a speech audio file or use text-to-speech conversion.",
        },
      },
      {
        name: { tr: "Videoyu oluşturun", en: "Generate the video" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI fotoğrafa gerçekçi dudak ve yüz hareketleri ekleyerek video üretir.",
          en: "Click generate. AI produces video by adding realistic lip and facial movements to the photo.",
        },
      },
      {
        name: { tr: "Videoyu indirin", en: "Download the video" },
        text: {
          tr: "Tamamlanan konuşan avatar videosunu MP4 formatında indirin.",
          en: "Download the completed talking avatar video in MP4 format.",
        },
      },
    ],
  },

  // ─── Logo Tasarla ───
  {
    slug: "logo-tasarla",
    name: {
      tr: "AI ile Logo Tasarlama",
      en: "AI Logo Design",
    },
    description: {
      tr: "Marka adınızdan profesyonel logo tasarımları oluşturun",
      en: "Create professional logo designs from your brand name",
    },
    faqs: [
      {
        q: { tr: "Logo PNG mi yoksa SVG mi oluşturuluyor?", en: "Are logos created as PNG or SVG?" },
        a: {
          tr: "Her iki format da desteklenir. PNG şeffaf arka planlı olarak, SVG ise vektörel ve sonsuz ölçeklenebilir formatta indirilebilir.",
          en: "Both formats are supported. PNG is available with transparent background, SVG is downloadable as vector and infinitely scalable format.",
        },
      },
      {
        q: { tr: "Sektör seçimi ne işe yarıyor?", en: "What does the industry selection do?" },
        a: {
          tr: "Sektör seçimi, AI'ın logo stilini sektörünüze uygun tasarlamasını sağlar. Teknoloji, gıda, moda gibi sektörlere özel stil önerileri üretir.",
          en: "Industry selection helps AI design the logo style suited to your sector. It generates style suggestions specific to sectors like technology, food, fashion.",
        },
      },
      {
        q: { tr: "Logoyu ticari olarak kullanabilir miyim?", en: "Can I use the logo commercially?" },
        a: {
          tr: "Evet, Renderhane ile oluşturduğunuz logolar ticari projelerde serbestçe kullanılabilir.",
          en: "Yes, logos created with Renderhane can be freely used in commercial projects.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Marka adını girin", en: "Enter brand name" },
        text: {
          tr: "Logosunu tasarlamak istediğiniz marka veya şirket adını yazın.",
          en: "Type the brand or company name you want to design a logo for.",
        },
      },
      {
        name: { tr: "Sektör ve stil seçin", en: "Choose industry and style" },
        text: {
          tr: "Sektörünüzü ve tercih ettiğiniz logo stilini (minimalist, modern, vintage, 3D) seçin. Renk paleti belirleyin.",
          en: "Select your industry and preferred logo style (minimalist, modern, vintage, 3D). Choose a color palette.",
        },
      },
      {
        name: { tr: "Logoyu oluşturun", en: "Generate the logo" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI markanıza özel profesyonel logo tasarımı üretir.",
          en: "Click generate. AI creates a professional logo design customized for your brand.",
        },
      },
      {
        name: { tr: "PNG veya SVG olarak indirin", en: "Download as PNG or SVG" },
        text: {
          tr: "Beğendiğiniz logoyu şeffaf arka planlı PNG veya vektörel SVG formatında indirin.",
          en: "Download the logo you like as transparent PNG or vector SVG format.",
        },
      },
    ],
  },

  // ─── QR Kod ───
  {
    slug: "qr-kod",
    name: {
      tr: "Ücretsiz QR Kod Oluşturma",
      en: "Free QR Code Generator",
    },
    description: {
      tr: "Tamamen ücretsiz, kayıt gerektirmeyen, sınırsız QR kod oluşturucu",
      en: "Completely free, no registration required, unlimited QR code generator",
    },
    faqs: [
      {
        q: { tr: "QR kod oluşturmak gerçekten ücretsiz mi?", en: "Is QR code generation really free?" },
        a: {
          tr: "Evet, Renderhane QR kod oluşturucu tamamen ücretsizdir. Kayıt gerekmez, günlük limit yoktur, sınırsız QR kod oluşturabilirsiniz. Gizli ücret veya kredi harcaması yoktur.",
          en: "Yes, Renderhane QR code generator is completely free. No registration required, no daily limit, unlimited QR code creation. No hidden fees or credit charges.",
        },
      },
      {
        q: { tr: "Ücretsiz QR kodda hangi içerik türleri destekleniyor?", en: "What content types are supported in free QR codes?" },
        a: {
          tr: "URL, düz metin, vCard (kartvizit), Wi-Fi bağlantısı ve e-posta adresi dahil tüm içerik türleri ücretsiz olarak desteklenir. Hiçbir özellik ücretli değildir.",
          en: "All content types including URL, plain text, vCard (business card), Wi-Fi connection, and email address are supported for free. No features are behind a paywall.",
        },
      },
      {
        q: { tr: "Ücretsiz QR kodu ticari projelerimde ve baskıda kullanabilir miyim?", en: "Can I use free QR codes in my commercial projects and print?" },
        a: {
          tr: "Evet, oluşturduğunuz QR kodlar yüksek çözünürlüklü PNG formatında indirilir ve hem dijital hem baskı projelerinde serbestçe kullanılabilir. Kartvizit, etiket, poster ve ambalajlar için idealdir.",
          en: "Yes, your QR codes are downloaded as high-resolution PNG and can be freely used in both digital and print projects. Ideal for business cards, labels, posters, and packaging.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "İçerik türünü seçin", en: "Select content type" },
        text: {
          tr: "URL, metin, vCard veya Wi-Fi gibi QR kodun içereceği içerik türünü seçin.",
          en: "Choose the content type for your QR code: URL, text, vCard, or Wi-Fi.",
        },
      },
      {
        name: { tr: "İçeriği girin", en: "Enter content" },
        text: {
          tr: "Bağlantı adresini, metni veya iletişim bilgilerini girin.",
          en: "Enter the link URL, text, or contact information.",
        },
      },
      {
        name: { tr: "QR kodu indirin", en: "Download QR code" },
        text: {
          tr: "Oluşturulan QR kodu yüksek çözünürlüklü PNG olarak indirin. Dijital veya baskı projelerinizde kullanın.",
          en: "Download the generated QR code as high-resolution PNG. Use in your digital or print projects.",
        },
      },
    ],
  },

  // ─── Sahne Oluştur ───
  {
    slug: "sahne-olustur",
    name: {
      tr: "AI Ürün Sahnesi Oluşturma",
      en: "AI Product Scene Generation",
    },
    description: {
      tr: "Ürün fotoğraflarınızı profesyonel sahnelere yerleştirin",
      en: "Place your product photos into professional scenes",
    },
    faqs: [
      {
        q: { tr: "Ürün sahnesi nedir?", en: "What is a product scene?" },
        a: {
          tr: "Ürün sahnesi, ürününüzü profesyonel bir ortamda (mutfak tezgahı, ofis masası, doğa vb.) gösteren yapay görselledir. Stüdyo çekimi yapmadan profesyonel ürün fotoğrafları elde edersiniz.",
          en: "A product scene is an AI-generated visual showing your product in a professional setting (kitchen counter, office desk, nature, etc.). Get professional product photos without studio shoots.",
        },
      },
      {
        q: { tr: "Hazır sahne şablonları var mı?", en: "Are there ready-made scene templates?" },
        a: {
          tr: "Evet, farklı kategorilerde (ev, ofis, doğa, stüdyo) hazır sahne şablonları mevcuttur. Ayrıca kendi sahne açıklamanızı da yazabilirsiniz.",
          en: "Yes, ready-made scene templates are available in different categories (home, office, nature, studio). You can also write your own scene description.",
        },
      },
      {
        q: { tr: "E-ticaret listelemeleri için uygun mu?", en: "Is it suitable for e-commerce listings?" },
        a: {
          tr: "Kesinlikle. Amazon, Trendyol, Hepsiburada gibi pazaryerleri ve kendi e-ticaret siteniz için optimize edilmiş görseller oluşturabilirsiniz.",
          en: "Absolutely. You can create optimized visuals for marketplaces like Amazon, Trendyol, Hepsiburada, and your own e-commerce site.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Ürün fotoğrafını yükleyin", en: "Upload product photo" },
        text: {
          tr: "Ürününüzün net bir fotoğrafını yükleyin. Tercihen arka planı sade olmalı.",
          en: "Upload a clear photo of your product. Preferably with a plain background.",
        },
      },
      {
        name: { tr: "Sahne seçin veya tanımlayın", en: "Select or describe a scene" },
        text: {
          tr: "Hazır sahne şablonlarından birini seçin veya istediğiniz ortamı metin olarak tarif edin.",
          en: "Choose from ready-made scene templates or describe the environment you want as text.",
        },
      },
      {
        name: { tr: "Sahneyi oluşturun", en: "Generate the scene" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI ürününüzü seçtiğiniz sahneye doğal bir şekilde yerleştirir.",
          en: "Click generate. AI naturally places your product into the selected scene.",
        },
      },
      {
        name: { tr: "Sonucu indirin", en: "Download the result" },
        text: {
          tr: "Profesyonel ürün sahne görselini indirin ve pazaryeri veya web sitenizde kullanın.",
          en: "Download the professional product scene image and use it on your marketplace or website.",
        },
      },
    ],
  },

  // ─── Sosyal Medya Paketi ───
  {
    slug: "sosyal-medya-paketi",
    name: {
      tr: "AI Sosyal Medya Paketi Oluşturma",
      en: "AI Social Media Kit Generation",
    },
    description: {
      tr: "Tek ürün fotoğrafından dört farklı sahne görseli ve kısa ürün videosu oluşturun",
      en: "Create four distinct scene images and a short product video from one product photo",
    },
    faqs: [
      {
        q: { tr: "Social Kit paketinde neler var?", en: "What is included in a Social Kit?" },
        a: {
          tr: "Paket dört farklı ürün sahnesi ve yaklaşık beş saniyelik bir 720p ürün tanıtım videosu oluşturur.",
          en: "The kit creates four distinct product scenes and an approximately five-second 720p product showcase video.",
        },
      },
      {
        q: { tr: "Tek seferde kaç varyasyon üretilir?", en: "How many variations are produced at once?" },
        a: {
          tr: "Stüdyo, yaşam tarzı, flat lay ve mevsimsel yaklaşımlarla dört ayrı sahne işi başlatılır.",
          en: "Four scene jobs are started with studio, lifestyle, flat lay, and seasonal creative directions.",
        },
      },
      {
        q: { tr: "Platforma özel boyutlar oluşturuluyor mu?", en: "Does it create platform-specific sizes?" },
        a: {
          tr: "Hayır. Mevcut sürüm yaratıcı sahne varyasyonları ve kısa video üretir; platforma özel yeniden boyutlandırma sunmaz.",
          en: "No. The current version creates creative scene variations and a short video; it does not provide platform-specific resizing.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Ürün fotoğrafını yükleyin", en: "Upload product photo" },
        text: {
          tr: "Sosyal medya içeriği oluşturmak istediğiniz ürünün fotoğrafını yükleyin.",
          en: "Upload the photo of the product you want to create social media content for.",
        },
      },
      {
        name: { tr: "Paketi başlatın", en: "Start the kit" },
        text: {
          tr: "Dört sahne görseli ve bir kısa video işini tek işlemle başlatın.",
          en: "Start four scene-image jobs and one short-video job in one action.",
        },
      },
      {
        name: { tr: "İşlemleri takip edin", en: "Track processing" },
        text: {
          tr: "Görsel ve video işleri paralel olarak işlenirken proje ekranından durumlarını izleyin.",
          en: "Follow the image and video jobs from the project screen while they process in parallel.",
        },
      },
      {
        name: { tr: "Çıktıları indirin", en: "Download outputs" },
        text: {
          tr: "Tamamlanan sahne görsellerini ve videoyu proje çıktılarından ayrı ayrı indirin.",
          en: "Download completed scene images and the video individually from the project outputs.",
        },
      },
    ],
  },

  // ─── Video Oluştur ───
  {
    slug: "video-olustur",
    name: {
      tr: "AI ile Video Oluşturma",
      en: "AI Video Generation",
    },
    description: {
      tr: "Tek fotoğraftan profesyonel ürün tanıtım videosu oluşturun",
      en: "Create professional product promo videos from a single photo",
    },
    faqs: [
      {
        q: { tr: "Tek fotoğraftan video oluşturulabilir mi?", en: "Can I create a video from a single photo?" },
        a: {
          tr: "Evet, AI tek bir ürün fotoğrafından hareket, kamera açısı ve geçişler ekleyerek profesyonel video oluşturur.",
          en: "Yes, AI creates professional video from a single product photo by adding motion, camera angles, and transitions.",
        },
      },
      {
        q: { tr: "Video süresi ne kadar?", en: "What is the video duration?" },
        a: {
          tr: "Standart videolar 4-5 saniye sürer. Kısa tanıtım videoları, Instagram Reels ve TikTok için ideal uzunluktadır.",
          en: "Standard videos are 4-5 seconds long. Ideal length for short promo videos, Instagram Reels, and TikTok.",
        },
      },
      {
        q: { tr: "Hangi platformlar için uygun?", en: "Which platforms is it suitable for?" },
        a: {
          tr: "Instagram Reels, TikTok, YouTube Shorts, Facebook ve e-ticaret ürün sayfaları için kullanılabilir. MP4 formatında indirilir.",
          en: "Can be used for Instagram Reels, TikTok, YouTube Shorts, Facebook, and e-commerce product pages. Downloaded in MP4 format.",
        },
      },
    ],
    steps: [
      {
        name: { tr: "Ürün fotoğrafını yükleyin", en: "Upload product photo" },
        text: {
          tr: "Video oluşturmak istediğiniz ürünün net bir fotoğrafını yükleyin.",
          en: "Upload a clear photo of the product you want to create a video for.",
        },
      },
      {
        name: { tr: "Video stilini seçin", en: "Choose video style" },
        text: {
          tr: "360 derece dönüş, zoom efekti veya yaşam tarzı sahnesi gibi video stillerinden birini seçin.",
          en: "Select from video styles like 360-degree spin, zoom effect, or lifestyle scene.",
        },
      },
      {
        name: { tr: "Videoyu oluşturun", en: "Generate the video" },
        text: {
          tr: "Oluştur butonuna tıklayın. AI fotoğrafınızdan profesyonel video üretir. İşlem birkaç dakika sürebilir.",
          en: "Click generate. AI produces a professional video from your photo. Processing may take a few minutes.",
        },
      },
      {
        name: { tr: "MP4 olarak indirin", en: "Download as MP4" },
        text: {
          tr: "Tamamlanan videoyu MP4 formatında indirin ve sosyal medya veya e-ticaret sitenizde paylaşın.",
          en: "Download the completed video in MP4 format and share on social media or your e-commerce site.",
        },
      },
    ],
  },
];

/* ── Export map ──────────────────────────────── */

type ToolSlug = string;

export const TOOL_SEO: Record<ToolSlug, { jsonLd: (locale: string) => object }> =
  Object.fromEntries(
    toolConfigs.map((cfg) => [
      cfg.slug,
      { jsonLd: (locale: string) => buildJsonLd(cfg, locale) },
    ])
  );

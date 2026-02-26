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
];

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): BlogArticle[] {
  return [...articles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

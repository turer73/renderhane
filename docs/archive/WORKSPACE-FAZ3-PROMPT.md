# Renderhane Workspace — Faz 3: Bug Fix + Eksik Tamamlama

## Proje
- **Repo:** F:\projelerim\renderhane
- **Sayfa:** /tr/app/workspace (auth) + /tr/workspace-test (test)
- **Dosyalar:** src/components/workspace/ altında 8 dosya

## Faz 2'de Yapılanlar (TAMAMLANDI ama eksikli)
- Mock simülasyon kaldırıldı, gerçek API entegrasyonu yapıldı
- Supabase Storage upload + signed URL
- POST /api/jobs/submit + useJobPolling entegrasyonu
- Gerçek output gösterimi (img/video/GLB placeholder)
- Hata handling (402/429/500/failed)
- promptText binding (6 textarea + 4 input)

## Faz 2'nin DÜRÜSTÇe Eksikleri

### KRİTİK — API 400 Hata Verecek Durumlar

#### 1. `imageUrls` array hiç gönderilmiyor
**Sorun:** `GeneratePayload` sadece `imageUrl?: string` (tekil) taşıyor. API ise `3d-model` ve `virtual-tryon` için `imageUrls: string[]` (dizi) bekliyor. Bu araçlarla üretim yapmaya çalışan kullanıcı 400 hatası alacak.

**Etkilenen tablar:**
- `img-to-3d` → 3d-model (TOOLS_MULTI_IMAGE) → `"imageUrls array is required"` hatası
- `texture` → 3d-model → aynı hata
- `virtual-tryon` → virtual-tryon (TOOLS_MULTI_IMAGE) → aynı hata

**Çözüm:**
1. `GeneratePayload`'a `imageUrls?: string[]` ekle
2. `workspace-layout.tsx` `handleGenerate`'de `imageUrls` gönder
3. `tool-form-panel.tsx`'de img-to-3d ve texture tabları için tek görsel yüklendiğinde `imageUrls: [url]` olarak sarmalama yap
4. virtual-tryon için iki upload zone (kıyafet + model) ekle

**Referans (mevcut çalışan pattern):**
```typescript
// src/components/app/photo-upload.tsx, line 407-409
if (activeIsMulti) {
  uploadedImageUrls = [url]; // tek görseli array'e sar
}
```

#### 2. `text-to-3d` yanlış model/tier gönderiyor
**Sorun:** text-to-3d tabındaki AI model select `defaultValue="meshy-6"` kullanıyor (uncontrolled). `handleGenerate` ise `currentModel3D` state'ini okuyor ki bu `selectedModel` (varsayılan: "trellis-v1"). Yani kullanıcı Meshy 6 seçili görse de API'ye trellis-v1 tier gönderiliyor.

**Çözüm:** text-to-3d tabı için ayrı controlled state veya `selectedModel`'ı bu tab için de kullan.

#### 3. `talking-avatar` TTS pipeline eksik
**Sorun:** omnihuman modeli `audio_url` bekliyor. Workspace ise metin gönderiyar. Metin → ses dönüşümü (TTS) yapılmıyor.

**Çözüm:** Bu tab şimdilik devre dışı bırakılabilir veya server-side TTS adımı eklenmeli.

---

### YÜKSEK — Kullanıcı Deneyimini Bozan Eksikler

#### 4. Submit öncesi validasyon yok
**Sorun:** Kullanıcı görsel yüklemeden "Üret"e basabilir. Prompt yazmadan text-to-image gönderebilir.

**Çözüm:** `handleGenerate` başında:
```typescript
const needsImage = !["text-to-3d", "text-to-image", "text-to-video", "logo", "qr-code"].includes(activeTab);
if (needsImage && !uploadedImageUrl) {
  showToast("Lütfen önce bir görsel yükle", "error");
  return;
}
const needsPrompt = ["text-to-3d", "text-to-image", "text-to-video", "logo", "qr-code"].includes(activeTab);
if (needsPrompt && !promptText.trim()) {
  showToast("Lütfen bir açıklama yaz", "error");
  return;
}
```

#### 5. Galeri dropdown aksiyonları tamamen sahte
**Sorun:** İndir, Sil, Paylaş, Kopyala, Önizle, Yeniden Üret — hepsi `showToast()`.

**Yapılacak:**
- İndir → `window.open(output_url)` veya `<a download>`
- Linki Kopyala → `navigator.clipboard.writeText(output_url)`
- Sil → `DELETE /api/jobs/{id}` (API route yoksa ekle)
- Önizle → output_url'yi modal veya yeni tab'da aç
- Yeniden Üret → aynı parametrelerle yeni submit
- Paylaş → şimdilik "yakında" toast bırakılabilir

#### 6. Galeri'de failed job'lar "processing" görünüyor
**Sorun:** `result-gallery.tsx` satır 337: `j.status === "completed" ? "completed" : "processing"`. Failed job'lar "İşleniyor" spinner'ı ile gösteriliyor.

**Çözüm:**
```typescript
status: j.status === "completed" ? "completed" as const 
     : j.status === "failed" ? "completed" as const  // veya yeni "failed" status
     : "processing" as const,
// + failed badge göstermek için error flag ekle
```

#### 7. GLB 3D viewer placeholder — inline viewer yok
**Sorun:** Tamamlanan 3D model sadece Box ikonu + indirme butonu gösteriyor. Inline 3D görüntüleyici yok.

**Çözüm:** `@google/model-viewer` web component veya mevcut `processing-modal.tsx`'deki lazy-loaded Three.js viewer'ı kullan.

**Referans:** `src/components/app/processing-modal.tsx` içinde lazy-loaded ModelViewer var.

---

### ORTA — Form Verileri API'ye İletilmiyor

#### 8. Tüm "gelişmiş ayarlar" dekoratif
**Sorun:** Aşağıdaki switch/select'ler state'e bağlı değil ve API'ye gönderilmiyor:
- `enhanceImage` (Switch) — state var ama payload'a eklenmemiş
- `multiView` (Switch) — state var ama payload'a eklenmemiş
- `autoRig` (Switch) — state var ama payload'a eklenmemiş
- `editAction` (aksiyon kartları) — state var ama payload'a eklenmemiş
- Çıktı formatı (select: PNG/Beyaz/Özel) — uncontrolled
- Büyütme oranı (select: 2x/4x) — uncontrolled
- Gürültü azaltma (Switch) — uncontrolled
- Yüz iyileştirme (Switch) — uncontrolled
- Sanat stili (select: Gerçekçi/Karikatür/vb.) — uncontrolled
- Negatif prompt (Switch) — uncontrolled
- PBR materyal (Switch) — uncontrolled
- Doku çözünürlüğü (select: 1K/2K/4K) — uncontrolled
- Video süresi (select) — uncontrolled
- Kamera hareketi (select) — uncontrolled
- En-boy oranı (select) — uncontrolled
- Ses seçimi (select) — uncontrolled
- Sahne tipi (select) — uncontrolled
- Platform (select) — uncontrolled
- Logo stili (select) — uncontrolled
- QR hata düzeltme (select) — uncontrolled
- QR stil açıklaması (Input) — uncontrolled, promptText'e BAĞLI DEĞİL

**Karar noktası:** Bunların çoğu fal.ai model parametrelerine karşılık gelmiyor. Hangilerinin gerçekten API'ye gönderilmesi gerektiğine karar ver:
- `tier` → zaten gönderiliyor ✓
- `prompt` → zaten gönderiliyor ✓
- Diğerleri → API'nin `submitJob` fonksiyonu bunları kabul etmiyor. API genişletilmedikçe bu switch'ler kozmetik kalacak.

**Önerim:** API'nin kabul etmediği seçenekleri kaldır veya "yakında" badge'i ekle. Kullanıcıya yanlış beklenti verme.

#### 9. Logo prompt'u yanlış compose ediliyor
**Sorun:** Logo tabı `promptText`'i "Slogan" input'una bağlamış. Ama recraft-v3 modeli tam bir prompt bekliyor. Marka adı (projectName) prompt'a dahil edilmiyor.

**Çözüm:** `handleGenerate`'de logo için özel prompt composition:
```typescript
if (apiTool === "logo") {
  payload.prompt = `Logo for "${projectName}". ${promptText ? `Tagline: ${promptText}.` : ""} Professional, clean design.`;
}
```

#### 10. QR kod hedef URL'i eksik
**Sorun:** QR tab'ında `projectName` "Hedef URL" input'una bağlı. Ama bu değer `prompt` olarak gönderilmiyor — sadece `name` olarak gidiyor. QR modeli URL'yi `prompt` parametresinde bekliyor olabilir.

---

### DÜŞÜK — Temizlik ve İyileştirme

#### 11. Dead code: SVG thumbnail constant'ları
**Dosya:** `workspace-layout.tsx` satır 96-107
**Sorun:** `RESULT_THUMB_3D`, `RESULT_THUMB_IMAGE`, `RESULT_THUMB_ECOMMERCE`, `RESULT_THUMB_BATCH`, `RESULT_THUMB_DESIGN`, `RESULT_THUMB_VIDEO` — hiçbir yerde kullanılmıyor. ~100 satır gereksiz SVG string.
**Çözüm:** Sil.

#### 12. Preview temizlendiğinde upload state temizlenmiyor
**Sorun:** Kullanıcı X butonuyla preview'ı kaldırdığında `setPreview(null)` çağrılıyor ama `uploadedFile` ve `uploadedImageUrl` temizlenmiyor. Stale URL API'ye gönderilir.

**Çözüm:** Preview X butonundaki onClick'e ekle:
```typescript
onClick={(e) => {
  e.stopPropagation();
  if (preview) URL.revokeObjectURL(preview);
  setPreview(null);
  setUploadedFile(null);
  setUploadedImageUrl(null);
}}
```

#### 13. Toast stacking — üst üste biniyor
**Sorun:** Hızlı toast'lar aynı pozisyonda üst üste biniyor.
**Çözüm:** Basit: her yeni toast'ta eski toast'ları kaldır.

#### 14. Galeri'de model adı yerine tool adı gösteriliyor
**Sorun:** Gerçek job'larda `model: j.tool` kullanılıyor ("3d-model" yazdırıyor, "TRELLIS v1" yerine).
**Çözüm:** PolledJob'da model bilgisi yok. Ya API'ye model field ekle ya da TOOL_DISPLAY_NAMES kullan.

#### 15. Batch işleme tamamen sahte
**Sorun:** Dosyalar sayılıyor ama yüklenmiyor. API tek dosya için çağrılıyor.
**Çözüm:** Faz 3'te implement etme, "yakında" badge'i ekle veya batch tab'ı gizle.

#### 16. social-kit workspace'te yok
**Sorun:** VALID_TOOLS'da var ama workspace'te tab yok.
**Çözüm:** Faz 5'te eklenmişti (proje hafızasında var). Ayrı iş.

---

## Dosya Haritası

### Değiştirilecek dosyalar:
1. `src/components/workspace/tool-form-panel.tsx` — imageUrls, validasyon, uncontrolled fix, preview cleanup
2. `src/components/workspace/workspace-layout.tsx` — imageUrls gönderimi, dead code temizliği
3. `src/components/workspace/result-gallery.tsx` — failed status, gerçek dropdown aksiyonları
4. `src/components/workspace/workspace-preview.tsx` — GLB viewer (opsiyonel), download fix
5. `src/components/workspace/workspace-toast.tsx` — stacking fix (opsiyonel)

### Referans dosyalar:
- `src/app/api/jobs/submit/route.ts` — VALID_TOOLS, TOOLS_MULTI_IMAGE, validation logic
- `src/lib/fal/models.ts` — TOOLS_MULTI_IMAGE, TOOLS_TEXT_ONLY, TOOLS_WITH_PROMPT
- `src/components/app/photo-upload.tsx` — imageUrls array sarmalama pattern
- `src/components/app/processing-modal.tsx` — GLB viewer lazy-load pattern

## Önerilen Uygulama Sırası

### Faz 3A — Kritik Bug Fix (API'yi bozmayacak hale getir)
1. ✅ `imageUrls` array desteği ekle (img-to-3d, texture, virtual-tryon)
2. ✅ text-to-3d model select'i controlled state yap
3. ✅ Submit öncesi validasyon ekle
4. ✅ Preview X butonu upload state'i temizlesin
5. ✅ Dead SVG thumbnail'ları sil

### Faz 3B — UX İyileştirme (kullanıcı deneyimi)
6. ✅ Galeri failed job gösterimi
7. ✅ Galeri indirme → gerçek download
8. ✅ Galeri link kopyalama → gerçek clipboard
9. ✅ Logo/QR prompt composition düzelt
10. ✅ "Dekoratif" seçeneklere "yakında" badge'i veya kaldır

### Faz 3C — Büyük Feature (opsiyonel)
11. GLB inline 3D viewer
12. Multi-image upload UI (3D çoklu açı)
13. Batch işleme gerçek implementasyonu
14. talking-avatar TTS pipeline

## Teknik Notlar
- react-resizable-panels PanelGroup direction TS hatası pre-existing, ignore
- React 19 event delegation: preview tool ile tab tıklamaları test edilemez
- fal.ai job'ları progress yüzdesi döndürmez — asymptotic estimation kullanılıyor
- Supabase Storage signed URL 3600s (1 saat) TTL — uzun süren job'larda expire olabilir
- workspace-test sayfası (marketing route) ayrı JobPollingProvider gerektirir

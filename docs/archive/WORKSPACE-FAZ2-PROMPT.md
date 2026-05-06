# Renderhane Workspace — Faz 2: Gerçek API Entegrasyonu

## Proje
- **Repo:** F:\projelerim\renderhane
- **Sayfa:** /tr/app/workspace (auth gerektirir)
- **Dosyalar:** src/components/workspace/ altında 8 dosya

## Faz 1'de Yapılanlar (TAMAMLANDI)
- 6 araç kategorisi tam çalışıyor: 3D Model, Görüntü, Video, E-ticaret, Tasarım, Toplu İşlem
- Her araçta: tab sistemi + form + progress ring simülasyonu + tamamlanma ekranı + galeri
- Responsive layout: CSS-based dual render (mobile `md:hidden` + desktop `hidden md:flex`)
- Auth entegrasyonu: `/app/workspace` route auth layout içinde, AppShell full-screen mode
- Sidebar: "Workspace" linki + "Yeni Üretim" CTA → workspace'e yönlendir
- Header: gerçek kredi bakiyesi (`/api/credits/balance`) + gerçek kullanıcı avatarı
- 17 bug düzeltildi (kod review'dan): interval leak, DOM scraping→controlled state, XSS, blob leak, vb.
- Galeri otomatik ekleme: üretim tamamlanınca mock data'nın üstüne eklenir

## Faz 2'de Yapılacaklar

### 1. Dosya Yükleme → Gerçek R2 Upload
**Şu an:** `handleFile()` sadece blob URL oluşturup preview gösteriyor, dosya hiçbir yere yüklenmiyor.
**Yapılacak:** Dosya seçildiğinde R2'ye yükle, dönen URL'i form state'te tut.

**Mevcut upload akışı (referans):**
- `src/components/app/photo-upload.tsx` — mevcut dashboard upload bileşeni
- Upload → R2 presigned URL al → PUT ile yükle → `assets.renderhane.com/{key}` URL'i döner
- `src/app/api/upload/route.ts` veya `src/app/api/upload-from-url/route.ts` kontrol et

**Değiştirilecek dosya:** `src/components/workspace/tool-form-panel.tsx`
- `handleFile()` fonksiyonu — blob preview + R2 upload paralel yapılmalı
- `uploadedImageUrl` state ekle — bu URL job submit'e gönderilecek
- Upload progress indicator ekle (opsiyonel ama iyi olur)

### 2. handleGenerate → Gerçek POST /api/jobs/submit
**Şu an:** `workspace-layout.tsx` içinde `handleGenerate()` sadece simülasyon başlatıyor (setInterval ile fake progress).
**Yapılacak:** Gerçek API çağrısı yap, job ID al, polling başlat.

**Mevcut job submit API:**
```
POST /api/jobs/submit
Body: { tool, tier?, imageUrl?, imageUrls?, prompt?, projectId? }
Response: { jobId, requestId, creditCost, estimatedTime }
```

**Değişiklik planı:**
1. `tool-form-panel.tsx` → `onGenerate` callback'ine `imageUrl` ve `prompt` de ekle
2. `workspace-layout.tsx` → `handleGenerate` içinde:
   - Simülasyon yerine `fetch("/api/jobs/submit", { method: "POST", body: ... })`
   - Başarılıysa `window.dispatchEvent(new Event("job-submitted"))` (kredi güncelleme)
   - `activeJob` state'i gerçek job verisiyle set et
   - Hata durumu handle et (402 yetersiz kredi, 429 rate limit)

### 3. Simülasyon Progress → Gerçek Job Polling
**Şu an:** `setInterval(300ms)` ile fake progress (STAGES array, %2-5 artış).
**Yapılacak:** `useJobPolling()` hook'unu kullan veya job-specific polling yap.

**Mevcut polling sistemi:**
- `src/hooks/use-job-polling.tsx` — `JobPollingProvider` context
- `useJobPolling()` → `{ jobs, loading, refetch }` döner
- 2.5s aralıkla `GET /api/jobs/status` çağırır
- Sadece active job varsa poll eder

**Entegrasyon seçenekleri:**
- **Seçenek A:** Mevcut `useJobPolling()` kullan — workspace layout zaten `JobPollingProvider` içinde (`app/layout.tsx`)
- **Seçenek B:** Workspace-specific polling yap (daha granüler kontrol)
- **Öneri:** Seçenek A — `useJobPolling()` kullan, `jobs` array'den aktif workspace job'ı filtrele

**Dikkat:** Gerçek fal.ai job'ları progress yüzdesi döndürmez — sadece `pending → processing → completed/failed`. Progress ring'i "indeterminate" moda çevirmek veya stage-based estimation yapmak gerekebilir.

### 4. Mock Galeri → Gerçek Job Sonuçları
**Şu an:** `result-gallery.tsx` hardcoded `JOBS_3D`, `JOBS_IMAGE` vb. mock data gösteriyor + `generatedJobs` prop ile tamamlanan simülasyonları ekliyor.
**Yapılacak:** `useJobPolling()` verisiyle gerçek job listesi göster.

**Değişiklik:**
- `ResultGallery`'ye `polledJobs` prop ekle (veya doğrudan `useJobPolling()` çağır)
- `PolledJob` → `MockJob` format dönüşümü yap
- `output_url` varsa thumbnail olarak göster
- `status: "failed"` durumu handle et (hata badge'i)
- Mock data'yı tamamen kaldır veya `polledJobs` boşken fallback olarak göster

### 5. Tamamlanma Ekranı → Gerçek Sonuç Gösterimi
**Şu an:** Tamamlanınca SVG placeholder thumbnail gösteriyor.
**Yapılacak:** Gerçek `output_url`'den görsel/video/3D model göster.

**Değişiklikler:**
- `workspace-preview.tsx` completed state:
  - `output_type === "glb"` → Three.js ModelViewer (mevcut: `src/components/app/processing-modal.tsx` içinde lazy-loaded)
  - `output_type === "image"` → `<img src={output_url} />`
  - `output_type === "video"` → `<video src={output_url} controls />`
- İndirme butonları → gerçek `output_url`'den indir

### 6. Hata Durumları
**Şu an:** Hiç hata handling yok.
**Yapılacak:**
- Yetersiz kredi → UpgradeModal göster veya kredi satın alma sayfasına yönlendir
- Rate limit → "Çok hızlı, biraz bekle" toast
- fal.ai hata → "Üretim başarısız, kredin iade edildi" toast + retry butonu
- Network hata → genel hata toast

## Mevcut API Referansı

### Job Submit
```
POST /api/jobs/submit
Headers: Cookie (auth session)
Body: {
  tool: "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus" | "image-edit" | "text-to-image" | "qr-code" | "talking-avatar" | "logo" | "virtual-tryon",
  tier?: "fast" | "standard" | "premium",
  imageUrl?: string,      // assets.renderhane.com URL
  imageUrls?: string[],   // multi-image (3D)
  prompt?: string,
  projectId?: string      // auto-creates if missing
}
```

### Job Status
```
GET /api/jobs/status
Response: { jobs: PolledJob[] }   // max 25, newest first
```

### Credit Balance
```
GET /api/credits/balance
Response: { balance: number, useCase: string }
```

## Dosya Haritası

### Değiştirilecek dosyalar:
1. `src/components/workspace/tool-form-panel.tsx` — R2 upload + onGenerate genişlet
2. `src/components/workspace/workspace-layout.tsx` — Gerçek API submit + polling entegrasyonu
3. `src/components/workspace/result-gallery.tsx` — Mock → gerçek job verisi
4. `src/components/workspace/workspace-preview.tsx` — Gerçek output gösterimi
5. `src/app/[locale]/(app)/app/workspace/page.tsx` — useJobPolling bağlantısı

### Referans dosyalar (OKUMALI, değiştirme):
- `src/hooks/use-job-polling.tsx` — PolledJob interface + polling logic
- `src/app/api/jobs/submit/route.ts` — Submit API (tool, tier, imageUrl, prompt)
- `src/app/api/jobs/status/route.ts` — Status API
- `src/lib/jobs/submit.ts` — submitJob business logic
- `src/lib/fal/models.ts` — AI model configs, ToolType, ModelTier
- `src/lib/credits/engine.ts` — reserve/confirm/refund
- `src/components/app/photo-upload.tsx` — Mevcut upload akışı (R2 pattern)
- `src/components/app/processing-modal.tsx` — Mevcut sonuç gösterimi (3D viewer pattern)

## Teknik Notlar
- react-resizable-panels v4: defaultSize string "55%" kullan
- Radix Select React 19'da bozuk → native <select> kullan
- React 19 event delegation: preview tool ile sidebar/tab tıklamaları test edilemez
- fal.ai job'ları progress yüzdesi döndürmez — sadece status geçişleri
- workspace route AppShell'de full-screen mode kullanır (sidebar/topbar yok)
- Supabase auth cookie-based — API route'lar session'dan user alır

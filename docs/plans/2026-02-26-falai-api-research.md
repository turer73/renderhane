# fal.ai API & SDK Araştırma Raporu

**Tarih:** 2026-02-26
**Bağlam:** Photo-to-3D SaaS platformu (3d-labx) için fal.ai entegrasyon araştırması
**Kaynak:** https://docs.fal.ai/ — 200+ sayfa resmi dokümantasyon

---

## 1. Platform Genel Bakış

fal.ai üç farklı hizmet sunuyor:

| Hizmet | Açıklama | Bizim İlgimiz |
|--------|----------|---------------|
| **Model APIs** | 600+ hazır AI modeli (serverless) | **Birincil** — TRELLIS, Hunyuan3D |
| **Serverless** | Kendi modelini deploy et | Gelecekte self-hosted geçiş |
| **Compute** | Dedicated GPU cluster | İleri aşama ölçeklendirme |

### Base URL'ler
```
Queue (önerilen):  https://queue.fal.run/{model_id}
Sync:              https://fal.run/{model_id}
WebSocket:         wss://ws.fal.run/{model_id}
Platform API:      https://api.fal.ai/v1/...
```

> **NOT:** `api.fal.ai` sadece Platform API'ler için kullanılır. Model çağrıları `queue.fal.run` veya `fal.run` üzerinden yapılır.

---

## 2. JavaScript SDK — Next.js Entegrasyonu

### Kurulum
```bash
npm install @fal-ai/client @fal-ai/server-proxy
```

### Proxy Kurulumu (API anahtarını korumak için ZORUNLU)

**App Router** (`src/app/api/fal/proxy/route.ts`):
```typescript
import { route } from "@fal-ai/server-proxy/nextjs";
export const { GET, POST } = route;
```

**Page Router** (`src/pages/api/fal/proxy.ts`):
```typescript
export { handler as default } from "@fal-ai/server-proxy/nextjs";
```

### Client Yapılandırması
```typescript
import { fal } from "@fal-ai/client";

fal.config({
  proxyUrl: "/api/fal/proxy",
});
```

### Ortam Değişkeni
```env
FAL_KEY="key_id:key_secret"
```

### Proxy Özelleştirme (Rate Limiting, Analytics)
```typescript
import { route } from "@fal-ai/server-proxy/nextjs";

export const POST = (req) => {
  // Analytics
  analytics.track("fal.ai request", {
    targetUrl: req.headers["x-fal-target-url"],
    userId: req.user.id,
  });

  // Rate limiting
  if (rateLimiter.shouldLimit(req)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
  }

  return route.POST(req);
};
export const GET = route.GET;
```

> **Kritik Bulgu:** Proxy'de `x-fal-target-url` header'ı ile hangi modele istek atıldığını görebiliyoruz. Bu, kullanıcı başına model bazlı maliyet takibi için kullanılabilir.

---

## 3. API Çağrı Kalıpları

### 3.1 fal.subscribe (Önerilen — Queue + Otomatik Polling)
```typescript
const result = await fal.subscribe("fal-ai/trellis-2", {
  input: {
    image_url: "https://example.com/photo.jpg",
    resolution: 1024,
  },
  pollInterval: 5000,    // 5sn aralıklarla durum kontrolü
  logs: true,            // İşlem loglarını al
  onQueueUpdate: (update) => {
    if (update.status === "IN_QUEUE") {
      console.log(`Sıra pozisyonu: ${update.queue_position}`);
    }
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});

// Sonuç
const glbUrl = result.data.model_glb.url;
```

### 3.2 fal.queue (Manuel Kontrol)
```typescript
// 1. İşi gönder
const { request_id } = await fal.queue.submit("fal-ai/trellis-2", {
  input: { image_url: "..." },
  webhookUrl: "https://myapp.com/api/webhook/fal", // opsiyonel
});

// 2. Durum kontrolü
const status = await fal.queue.status("fal-ai/trellis-2", {
  requestId: request_id,
  logs: true,
});

// 3. Sonucu al
const result = await fal.queue.result("fal-ai/trellis-2", {
  requestId: request_id,
});

// 4. İptal et
await fal.queue.cancel("fal-ai/trellis-2", {
  requestId: request_id,
});
```

### 3.3 fal.run (Senkron — Kısa işler için)
```typescript
const result = await fal.run("fal-ai/trellis", {
  input: { image_url: "..." },
});
```

### 3.4 Stream Status (SSE ile gerçek zamanlı)
```typescript
const stream = await fal.queue.streamStatus("fal-ai/trellis-2", {
  requestId: request_id,
});
// text/event-stream döner, bağlantı tamamlanana kadar açık kalır
```

---

## 4. Webhook Sistemi

### Yapılandırma
Webhook URL'si `fal_webhook` query parametresiyle gönderilir:

```bash
POST https://queue.fal.run/fal-ai/trellis-2?fal_webhook=https://myapp.com/api/webhook/fal
```

Veya SDK ile:
```typescript
await fal.queue.submit("fal-ai/trellis-2", {
  input: { image_url: "..." },
  webhookUrl: "https://myapp.com/api/webhook/fal",
});
```

### Webhook Payload
```json
{
  "request_id": "abc-123",
  "gateway_request_id": "gw-456",
  "status": "OK",        // veya "ERROR"
  "payload": {
    "model_glb": {
      "url": "https://v3b.fal.media/files/...",
      "content_type": "model/gltf-binary",
      "file_name": "trellis2_xxx.glb",
      "file_size": 1234567
    }
  }
}
```

### Güvenlik
- **IP Allowlisting:** `GET https://api.fal.ai/v1/meta` — webhook IP aralıkları
- **ED25519 İmza Doğrulama:**
  - Header'lar: `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp`, `X-Fal-Webhook-Signature`
  - Public key: `GET https://rest.alpha.fal.ai/.well-known/jwks.json` (24 saat cache)
  - Timestamp toleransı: ±5 dakika (replay attack koruması)

### Retry Politikası
- 15 saniye timeout
- Başarısız teslimat → 2 saat boyunca 10 retry
- **İdempotent handler yazılmalı** (aynı request_id birden fazla gelebilir)

---

## 5. Model API Detayları — 3D Modeller

### 5.1 TRELLIS v1 (`fal-ai/trellis`)

| Parametre | Tip | Varsayılan | Aralık |
|-----------|-----|-----------|--------|
| `image_url` | string | **zorunlu** | — |
| `seed` | integer | rastgele | — |
| `ss_guidance_strength` | float | 7.5 | 0-10 |
| `ss_sampling_steps` | integer | 12 | 1-50 |
| `slat_guidance_strength` | float | 3 | 0-10 |
| `slat_sampling_steps` | integer | 12 | 1-50 |
| `mesh_simplify` | float | 0.95 | 0.9-0.98 |
| `texture_size` | enum | 1024 | 512/1024/2048 |

**Çıktı:** `model_mesh` (GLB dosyası)
**Fiyat:** ~$0.02 | **GPU:** A100 | **Lisans:** MIT
**Multi-image:** `/multi` endpoint'i mevcut (`image_urls` array)

### 5.2 TRELLIS 2 (`fal-ai/trellis-2`)

| Parametre | Tip | Varsayılan | Aralık |
|-----------|-----|-----------|--------|
| `image_url` | string | **zorunlu** | — |
| `resolution` | enum | 1024 | 512/1024/1536 |
| `seed` | integer | rastgele | — |
| `ss_guidance_strength` | float | 7.5 | 0-10 |
| `ss_guidance_rescale` | float | 0.7 | 0-1 |
| `ss_sampling_steps` | integer | 12 | 1-50 |
| `shape_slat_guidance_strength` | float | 7.5 | 0-10 |
| `shape_slat_sampling_steps` | integer | 12 | 1-50 |
| `tex_slat_guidance_strength` | float | 1 | 0-10 |
| `tex_slat_sampling_steps` | integer | 12 | 1-50 |
| `decimation_target` | integer | 500000 | 5K-2M |
| `texture_size` | enum | 2048 | 1024/2048/4096 |
| `remesh` | boolean | true | — |

**Çıktı:** `model_glb` (textured GLB)
**Fiyat:** $0.25 (512p) / $0.30 (1024p) / $0.35 (1536p)
**GPU:** H100 (300 eş zamanlı istek) | **Lisans:** MIT

### 5.3 Hunyuan3D 2.1 (`fal-ai/hunyuan3d-v21`)

| Parametre | Tip | Varsayılan | Aralık |
|-----------|-----|-----------|--------|
| `input_image_url` | string | **zorunlu** | — |
| `seed` | integer | rastgele | — |
| `num_inference_steps` | integer | 50 | 1-50 |
| `guidance_scale` | float | 7.5 | 0-20 |
| `octree_resolution` | integer | 256 | 1-1024 |
| `textured_mesh` | boolean | false | — |

**Çıktı:** `model_glb`, `model_glb_pbr` (opsiyonel), `model_mesh`
**Fiyat:** ~$0.30 (white mesh, playground testi) | textured mesh = 3x fiyat (~$0.90?)
**GPU:** H100 | **Timeout:** 3600sn | **Lisans:** Tencent (ABD-dışı kısıtlamalar)

> **DİKKAT:** `input_image_url` — TRELLIS'ten farklı parametre adı! TRELLIS `image_url`, Hunyuan `input_image_url` kullanıyor.

---

## 6. Platform API'ler (Yönetim & İzleme)

### 6.1 Fiyat Sorgulama
```bash
GET https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/trellis-2
Authorization: Key $FAL_KEY
```
**Yanıt:**
```json
{
  "prices": [{
    "endpoint_id": "fal-ai/trellis-2",
    "unit_price": 0.30,
    "unit": "model",
    "currency": "USD"
  }]
}
```

### 6.2 Maliyet Tahmini
```bash
POST https://api.fal.ai/v1/models/pricing/estimate
Authorization: Key $FAL_KEY

{
  "estimate_type": "unit_price",
  "endpoints": {
    "fal-ai/trellis-2": { "unit_quantity": 100 }
  }
}
```
**Yanıt:** `{ "total_cost": 30.0, "currency": "USD" }`

### 6.3 Kullanım Takibi
```bash
GET https://api.fal.ai/v1/models/usage?expand=time_series,summary,auth_method&timeframe=day
Authorization: Key $FAL_KEY_ADMIN
```
**Yanıt:** Endpoint bazlı kullanım, maliyet, authentication method detayları.
- `auth_method` expansion ile hangi API key'in ne kadar harcadığı görülebilir
- Kullanıcı başına maliyet takibi yapılabilir (her kullanıcıya ayrı key atanırsa veya proxy'de label eklenerek)

### 6.4 API Key Yönetimi
```
POST /v1/keys/create  — Yeni API key oluştur
GET  /v1/keys/list    — Key listesi
DEL  /v1/keys/delete  — Key sil
```
**Scope'lar:** `API` (model erişimi) ve `ADMIN` (tam erişim)

---

## 7. Güvenilirlik & Hata Yönetimi

### Retry Mekanizması
- Queue tabanlı istekler otomatik olarak **10 kez** retry yapılır
- Retry tetikleyiciler: 503, 504, bağlantı hatası, 429 (rate limit)
- **Senkron istekler retry YAPILMAZ** — hata doğrudan döner
- Başarısız (5xx) istekler **ücretlendirilmez**

### Fallback Sistemi
- Birincil endpoint başarısız → 5 retry sonrası eşdeğer alternatif endpoint'e yönlendirme
- Varsayılan olarak açık, `x-app-fal-disable-fallbacks` header'ı ile kapatılabilir

### Timeout Kontrolü
```bash
# 30 saniye içinde başlamazsa iptal et
-H "X-Fal-Request-Timeout: 30"
```
- İşlem başladıktan sonra timeout uygulanmaz
- Timeout dolduğunda ek retry yapılmaz

### Hata Formatı
```json
{
  "detail": [{
    "loc": ["body", "image_url"],
    "msg": "URL of the input image is required",
    "type": "missing",
    "url": "https://docs.fal.ai/..."
  }]
}
```

### Kritik Hata Tipleri (3D için)
| Hata | Kod | Açıklama |
|------|-----|----------|
| `content_policy_violation` | 422 | NSFW içerik engeli |
| `image_load_error` | 422 | Bozuk/desteklenmeyen görsel |
| `file_download_error` | 422 | URL'den dosya indirilemedi |
| `generation_timeout` | 504 | İşlem zaman aşımı |
| `no_media_generated` | 422 | Model çıktı üretemedi |
| `image_too_small` / `image_too_large` | 422 | Boyut sınırı |

**`X-Fal-Retryable` header:** Hatanın yeniden denenebilir olup olmadığını belirtir.

---

## 8. Dosya Yönetimi

### Girdi Dosyaları
- **URL:** Doğrudan public URL verilebilir (`image_url: "https://..."`)
- **Upload:** `fal.storage.upload(file)` ile CDN'ye yüklenir, URL döner
- **Base64:** Data URL olarak gönderilebilir

### Çıktı Dosyaları (GLB)
- fal.ai CDN'inde saklanır: `https://v3b.fal.media/files/...`
- **Varsayılan saklama süresi: 30 gün**
- `X-Fal-Object-Lifecycle-Preference` header'ı ile özelleştirilebilir
- `X-Fal-Store-IO: 0` header'ı ile payload saklanması engellenebilir

### Dosya Silme
Platform API ile request payload'ları ve çıktı CDN dosyaları silinebilir.
Girdi CDN dosyaları silinmez (başka isteklerde kullanılıyor olabilir).

---

## 9. Workflow Endpoints (Model Zincirleme)

fal.ai "Workflows" ile birden fazla model zincirlenebilir:
```typescript
const stream = await fal.stream("workflows/{owner}/{workflow_name}", {
  input: { prompt: "..." }
});

for await (const event of stream) {
  // event.type: "submit" | "completion" | "output" | "error"
  if (event.type === "completion") {
    console.log(`Adım tamamlandı: ${event.node_id}`);
  }
  if (event.type === "output") {
    console.log("Final sonuç:", event.output);
  }
}
```

**Olay Tipleri:**
- `submit` — Bir adım başladı
- `completion` — Bir adım tamamlandı (ara sonuç)
- `output` — Tüm workflow tamamlandı (final sonuç)
- `error` — Bir adımda hata oluştu

> **SaaS için potansiyel:** Image preprocessing → Background removal → 3D generation → Post-processing workflow'u tek endpoint olarak sunulabilir.

---

## 10. 3D Progressive Rendering (Referans Uygulama)

fal.ai'de `deploy-3d-progressive-rendering` örneği mevcut (Manifold projesi):

### Mimari
1. Kullanıcı fotoğraf yükler
2. Groq LLM prompt optimize eder
3. fal-ai/z-image görsel üretir (~1sn)
4. SAM-3D H100'de SSE ile voxel stream eder
5. React Three Fiber gerçek zamanlı render eder

### SSE Event Formatı
```
loading → geometry (voxel xyz) → appearance (voxel xyz+rgb) → mesh_preview → glb_ready → complete
```

### Binary Voxel Encoding
- Her voxel = 6 byte (xyz + rgb, uint8)
- 10K voxel ≈ 60KB/frame + %33 base64 overhead
- Base64 encoded, SSE ile gönderilir

> **Uygulanabilirlik:** Bu mimari bizim "premium canlı önizleme" özelliğimiz için ilham kaynağı olabilir, ancak TRELLIS/Hunyuan3D farklı modeller kullandığından doğrudan uygulanamaz. Queue + polling/webhook yaklaşımımız daha uygun.

---

## 11. Vercel Deployment

### Otomatik Entegrasyon
Vercel Marketplace'te fal.ai entegrasyonu mevcut — tek tıkla `FAL_KEY` environment variable eklenir.

### Manuel Kurulum
1. fal.ai Dashboard → API Key oluştur (API scope)
2. Vercel → Project Settings → Environment Variables → `FAL_KEY` ekle
3. Redeploy

---

## 12. Mimari Öneriler (3d-labx SaaS)

### Önerilen Entegrasyon Akışı
```
[Kullanıcı] → [Next.js Frontend]
                    ↓
              [/api/fal/proxy] ← rate limit + kullanıcı tracking
                    ↓
              [fal.ai Queue API]
                    ↓
        ┌──────────┼──────────┐
        ↓          ↓          ↓
   TRELLIS v1  TRELLIS 2  Hunyuan3D 2.1
   (~$0.02)    (~$0.30)    (~$0.30)
        ↓          ↓          ↓
              [Webhook → /api/webhook/fal]
                    ↓
              [Supabase DB güncelle]
                    ↓
              [Cloudflare R2'ye GLB kopyala]
                    ↓
              [Kullanıcıya bildirim (Realtime)]
```

### Kritik Tasarım Kararları

**1. Proxy Katmanı (Rate Limiting + Maliyet Takibi)**
- fal.ai proxy'si `x-fal-target-url` header'ından hangi modele istek gittiğini gösterir
- Proxy'de kullanıcı ID + model + timestamp loglanmalı
- Kullanıcı kotası burada kontrol edilmeli

**2. Queue vs Sync**
- 3D modeller genellikle 15-120 saniye sürer → **Queue ZORUNLU**
- `fal.subscribe` en pratik yöntem (otomatik polling + log takibi)
- Batch işler için `fal.queue.submit` + webhook kombinasyonu

**3. Webhook vs Polling**
- **Webhook önerilen:** Sunucu kaynağını boşa harcamaz
- Webhook güvenliği: ED25519 imza doğrulama + IP allowlisting
- Webhook retry: 2 saat boyunca 10 deneme → idempotent handler şart
- **Fallback polling:** Webhook başarısız olursa client-side polling aktif olabilir

**4. Dosya Yönetimi**
- fal.ai CDN 30 gün saklar — yeterli geçici depolama
- Kullanıcının indirmek isteyeceği GLB'leri Cloudflare R2'ye kopyala
- Girdi fotoğrafları: kullanıcı yükleme → R2 → fal.ai'ye URL olarak ver

**5. Hata Yönetimi**
- `X-Fal-Retryable` header'ını kontrol et → otomatik retry sadece retryable hatalarda
- `content_policy_violation` → kullanıcıya "uygunsuz içerik" mesajı
- `generation_timeout` → "Yoğunluk nedeniyle zaman aşımı, tekrar deneyin"
- 5xx hatalar → fal.ai kendi retry'ını yapar, ücretlendirme yok

**6. Parametre Farkları**
- TRELLIS modelleri: `image_url` parametresi
- Hunyuan3D: `input_image_url` parametresi
- Smart Router bu farkı soyutlamalı

---

## 13. Sonuç

fal.ai, 3d-labx SaaS platformu için çok uygun bir altyapı sağlıyor:

**Güçlü Yönler:**
- Hazır Next.js proxy desteği → hızlı entegrasyon
- Queue + Webhook sistemi → asenkron 3D üretim için ideal
- Platform API'ler (pricing, usage, keys) → SaaS operasyonları için yeterli
- ED25519 webhook güvenliği → production-grade
- Otomatik retry + fallback → güvenilirlik

**Dikkat Edilmesi Gerekenler:**
- CDN dosyaları 30 gün sonra silinir → R2'ye kopyalama şart
- Model parametre isimleri tutarsız → abstraction layer gerekli
- Hunyuan3D lisans kısıtlamaları → coğrafi filtreleme gerekli
- Cold start sorunları → `X-Fal-Request-Timeout` ile kontrol

**Eksik Bilgiler (araştırılacak):**
- fal.ai rate limit rakamları (kaç istek/dakika?)
- Hunyuan3D 2.1 textured_mesh=true fiyatı (API'den $0.30 base, 3x = $0.90?)
- File upload boyut limitleri
- Workflow oluşturma süreci (dokümantasyon sınırlı)

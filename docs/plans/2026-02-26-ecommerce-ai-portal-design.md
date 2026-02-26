# 3d-labx — E-Ticaret AI Portal Tasarım Dokümanı

**Tarih:** 2026-02-26
**Durum:** Tasarım Onaylandı — Implementasyon Planı Bekleniyor
**Lansman Bölgesi:** Türkiye (Faz 1) → Global (Faz 2)

---

## 1. Vizyon

E-ticaret mağaza sahipleri için fal.ai altyapısı üzerine kurulu, sektöre özel AI araç portalı. Tek fotoğraftan 3D model, ürün sahnesi, video ve görsel iyileştirme — hepsi tek platformda.

**Tek Cümle:** "Ürün fotoğrafını yükle, gerisini AI yapsın."

**Temel Fark:** Rakipler ya sadece 2D (Photoroom, Pebblely) ya da sadece 3D (Tripo3D, Meshy). 3d-labx ikisini birleştirip e-ticaret iş akışına özel paketliyor.

---

## 2. Hedef Kitle

| Segment | Büyüklük | Profil |
|---------|----------|--------|
| **Birincil:** Bağımsız e-ticaret siteleri | ~43K (ETBİS) | Shopify/WooCommerce/IdeaSoft/Ticimax kullanıcıları |
| **İkincil:** Pazaryeri satıcıları | ~540K | Trendyol, Hepsiburada, N11, Etsy satıcıları |
| **Üçüncül:** Dijital ajanslar | ~5K | Müşterileri için toplu ürün görseli üreten ajanslar |

**SAM:** ~580K potansiyel müşteri (Türkiye)
**SOM:** İlk yıl %0.5 penetrasyon → ~2,900 aktif kullanıcı

---

## 3. Araç Paketi

| # | Araç | fal.ai Modeli | Maliyet | Kullanıcı Fiyatı | Marj |
|---|------|---------------|---------|-------------------|------|
| 1 | **3D Model Üretici** | TRELLIS v1/2 + Hunyuan3D 2.1 | $0.02-0.30 | 5-15 kredi (₺20-60) | %75-96 |
| 2 | **Arka Plan Kaldırıcı** | BiRefNet / RMBG | ~$0.01 | 1 kredi (₺4) | %90 |
| 3 | **Ürün Sahne Üretici** | FLUX + ControlNet | ~$0.03 | 3 kredi (₺12) | %90 |
| 4 | **Görsel İyileştirici** | Real-ESRGAN / AuraSR | ~$0.02 | 2 kredi (₺8) | %90 |
| 5 | **Ürün Videosu** | Kling / MiniMax Video | ~$0.10-0.30 | 10 kredi (₺40) | %67-90 |
| 6 | **A+ İçerik Üretici** | FLUX + inpainting | ~$0.05 | 5 kredi (₺20) | %90 |

**"Hepsini Yap" paketi:** 22 kredi (₺88) — %15 indirim ile 19 kredi (₺76). Maliyet ~$0.42, marj ~%77.

---

## 4. Gelir Modeli — Kredi Sistemi

### Kredi Paketleri (TL)

| Paket | Kredi | Fiyat | Kredi Başına | ~Kaç 3D Model |
|-------|-------|-------|-------------|----------------|
| Başlangıç | 50 | ₺199 | ₺3.98 | ~5 |
| Standart | 150 | ₺499 | ₺3.33 (%16↓) | ~15 |
| Profesyonel | 500 | ₺1,299 | ₺2.60 (%35↓) | ~50 |
| İşletme | 2000 | ₺3,999 | ₺2.00 (%50↓) | ~200 |

**İlk kayıt:** 20 ücretsiz kredi (2 adet 3D model deneme)
**Kur koruması:** Fiyatlar aylık dolar kuru ortalamasına göre güncellenir.

### Gelir Projeksiyonu (İlk Yıl — Türkiye)

| Metrik | Değer |
|--------|-------|
| Aktif kullanıcı (ay 12) | ~500 |
| Ortalama harcama | ₺400/ay/kullanıcı |
| MRR (ay 12) | ~₺200,000 (~$5,200) |
| Brüt marj | ~%80 |
| Yıllık gelir | ~₺1.5M (~$39K) |

> Not: Türkiye lansmanı gelir için değil **ürün-pazar uyumu testi** ve **referans müşteri kazanımı** içindir. Ana gelir Faz 2 global açılımda.

---

## 5. Kullanıcı Akışları

### Birincil Akış: Fotoğraftan Her Şey

```
1. Fotoğraf yükleme (drag & drop veya URL)
2. Otomatik ön işleme (ücretsiz)
   ├── Arka plan tespit
   ├── Nesne segmentasyonu
   └── Kalite analizi
3. Araç seçim ekranı
   ├── 3D Model Üret — 10 kredi
   ├── Sahne Değiştir — 3 kredi
   ├── Video Oluştur — 10 kredi
   ├── Görseli İyileştir — 2 kredi
   └── Hepsini Yap — 19 kredi (%15↓)
4. İşlem kuyruğu (gerçek zamanlı durum)
5. Sonuç galerisi
   ├── 3D model viewer (döndürme, zoom)
   ├── İndirme (GLB/GLTF/OBJ)
   ├── Embed kodu
   └── "Bunu da dene" önerileri
```

### İkincil Akışlar

- **Batch İşleme:** CSV/ZIP ile toplu ürün yükleme → toplu çıktı
- **Proje Yönetimi:** Ürün bazlı klasörleme, geçmiş çıktılar
- **API Erişimi:** REST API key, webhook (Faz 2)

### Sayfa Haritası

```
/                     → Landing page + demo
/app                  → Ana dashboard (fotoğraf yükle)
/app/projects         → Proje listesi
/app/project/:id      → Tek proje detay
/app/batch            → Toplu işlem
/app/credits          → Kredi satın al
/app/settings         → Hesap ayarları
/docs                 → API dokümantasyonu (Faz 2)
/embed/:id            → Public 3D viewer (iframe)
```

---

## 6. Teknik Mimari

### Tech Stack

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| Frontend | Next.js 15 (App Router) + TypeScript | fal.ai proxy desteği, SSR |
| 3D Viewer | React Three Fiber | GLB native, performans |
| UI | Tailwind CSS + shadcn/ui | Hızlı prototipleme |
| Auth | Supabase Auth | Google OAuth, magic link, RLS |
| DB | Supabase PostgreSQL | Realtime subscriptions, RLS |
| Ödeme (Faz 1) | iyzico | Türk kartları, taksit, ₺ settlement |
| Ödeme (Faz 2) | Stripe | Global, mükemmel DX |
| Depolama | Cloudflare R2 | S3 uyumlu, egress ücretsiz |
| AI Backend | fal.ai Queue API | Webhook + retry + güvenilirlik |
| Deploy | Vercel | Next.js native, fal.ai entegrasyonu |

### Sistem Şeması

```
Frontend (Next.js / Vercel)
    ├── /api/fal/proxy      → fal.ai istekleri + rate limit + loglama
    ├── /api/credits/*       → bakiye kontrol, harcama, iade
    ├── /api/webhook/fal     → fal.ai iş tamamlanma bildirimi
    └── /api/webhook/iyzico  → ödeme tamamlanma bildirimi

Supabase (PostgreSQL + Realtime)
    ├── users               → hesap, auth, profil
    ├── credits             → bakiye, işlem geçmişi
    ├── credit_transactions → her harcama/yükleme kaydı
    ├── projects            → proje klasörleri
    ├── jobs                → fal.ai request_id, durum, sonuç
    └── outputs             → GLB/görsel URL'leri, metadata

Harici Servisler
    ├── fal.ai Queue API    → TRELLIS, Hunyuan3D, FLUX, vb.
    ├── iyzico              → ₺ kredi paketi satışı
    ├── Cloudflare R2       → GLB/görsel kalıcı depolama
    └── Stripe (Faz 2)     → $ global satış
```

### Kritik Akış: Kredi Rezervasyon Sistemi

```
Kullanıcı "3D Model Üret" tıklar
  → Credit Engine: bakiye ≥ 10 kredi?
    → Hayır: "Kredi yetersiz" uyarısı
    → Evet: 10 kredi REZERVE ET (status: reserved)
  → Smart Router: görsel analiz → model seç
  → fal.ai Queue'ya gönder (webhook URL ile)
  → request_id → jobs tablosuna kaydet
  → Kullanıcıya realtime durum göster (Supabase Realtime)
  → fal.ai webhook gelir:
    → Başarılı: kredi HARCA (status: spent), GLB → R2, outputs güncelle
    → Hata: kredi İADE (status: refunded), kullanıcıya bildir
```

### Smart Router Mantığı

```
Girdi: kullanıcı tercihi + görsel özellikleri
  → "Hızlı" veya varsayılan:     TRELLIS v1   ($0.02, ~15sn, white mesh)
  → "Kaliteli":                   TRELLIS 2    ($0.30, ~2dk, textured)
  → "Premium" (Türkiye/ABD):      Hunyuan3D 2.1 ($0.30, ~74sn, PBR)
  → "Premium" (EU/UK/Kore):       TRELLIS 2    (Hunyuan lisans kısıtlaması)
```

Parametre farkı soyutlaması:
- TRELLIS: `image_url` parametresi
- Hunyuan3D: `input_image_url` parametresi
- Smart Router bu farkı gizler

---

## 7. Türkiye Lansmanı Özel Gereksinimleri

### Lokalizasyon (Çift Dil — Başlangıçtan)
- Arayüz: **Türkçe + İngilizce** (next-intl ile i18n, tarayıcı diline göre otomatik)
- Landing page: Her iki dilde SEO optimize (/tr + /en)
- Müşteri desteği: Türkçe + İngilizce
- İçerik: Çift dil blog + YouTube

### Hukuki
- **KVKK:** Aydınlatma metni + açık rıza mekanizması
- **ETBİS:** E-ticaret kaydı (lansmandan önce)
- **Şirket:** Türk Ltd. Şti. (Faz 1), Wyoming LLC (Faz 2)
- **Hunyuan3D lisans:** Türkiye'de serbest, EU/UK'de TRELLIS'e fallback

### Pazarlama
- Trendyol/Hepsiburada satıcı forumları
- YouTube Türkçe tutorial ("Shopify'da 3D ürün modeli")
- E-ticaret Facebook/Instagram grupları
- Google Ads: "ürün fotoğrafı", "3D ürün modeli"
- IdeaSoft/Ticimax eklenti ortaklığı

---

## 8. MVP Kapsamı (Faz 1)

### Dahil
- [ ] Landing page (Türkçe + İngilizce, next-intl)
- [ ] Auth (Supabase — Google + email/password)
- [ ] Fotoğraf yükleme + ön işleme
- [ ] 3D Model Üretici (TRELLIS v1 + TRELLIS 2)
- [ ] Arka Plan Kaldırıcı (BiRefNet)
- [ ] Görsel İyileştirici (Real-ESRGAN)
- [ ] 3D model viewer (React Three Fiber)
- [ ] Kredi sistemi (iyzico entegrasyonu)
- [ ] Proje yönetimi (basit)
- [ ] GLB indirme + embed kodu

### Dahil Değil (Faz 2+)
- Hunyuan3D 2.1 (lisans değerlendirmesi sonrası)
- Ürün video üretimi (Kling/MiniMax)
- A+ içerik üretici
- Ürün sahne üretici
- Batch işleme
- API erişimi (developer portal)
- Stripe entegrasyonu (global ödeme)
- Shopify/WooCommerce eklentisi

---

## 9. Başarı Kriterleri

| Metrik | Hedef (3 ay) | Hedef (6 ay) |
|--------|-------------|-------------|
| Kayıtlı kullanıcı | 500 | 2,000 |
| Aktif kullanıcı (aylık) | 100 | 500 |
| Üretilen 3D model | 1,000 | 10,000 |
| MRR | ₺20,000 | ₺100,000 |
| NPS | >40 | >50 |
| Ortalama işlem süresi | <2dk | <1.5dk |

---

## 10. Referanslar

- [Shopify 3D Commerce](https://www.shopify.com/blog/3d-ecommerce) — %94-250 dönüşüm artışı verisi
- [fal.ai Docs](https://docs.fal.ai/) — API & SDK dokümantasyonu
- [ETBİS İstatistikler](https://etbis.ticaret.gov.tr) — Türkiye e-ticaret site sayıları
- [iyzico Subscription API](https://docs.iyzico.com/en/products/subscription/) — Ödeme entegrasyonu
- Playground test sonuçları: `docs/plans/2026-02-25-3d-saas-feasibility.md` Bölüm 9
- fal.ai API araştırması: `docs/plans/2026-02-26-falai-api-research.md`

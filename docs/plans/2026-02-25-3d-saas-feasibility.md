# Photo-to-3D SaaS Platform — Fizibilite Raporu

**Tarih:** 2026-02-25 (Güncelleme: 2026-02-26)
**Durum:** Playground Testleri Tamamlandı — Tasarım Onayı Bekleniyor

---

## 1. Yönetici Özeti

Fotoğraftan 3D model üreten, e-ticaret odaklı bir SaaS platformu. Açık kaynak AI modelleri (TRELLIS.2, Hunyuan3D 2.1) üzerine inşa edilecek çoklu model pipeline'ı ile teknik farklılaşma sağlanacak. Embed widget + batch processing birleşimi ile e-ticaret entegrasyonuna odaklanılacak.

**Sonuç:** Uygulanabilir, ancak YALNIZCA teknik farklılaşma (multi-model pipeline + embed widget) ile. Saf Tripo3D reseller modeli sürdürülebilir değil.

---

## 2. Pazar Analizi

### Pazar Büyüklüğü
- 3D AI Generation pazarı: ~$316M (2025), %23.5 CAGR
- E-ticaret 3D içerik alt segmenti hızla büyüyor
- AR/VR entegrasyonu talebi artıyor

### Mevcut Rakipler
| Rakip | Model/Fiyat | Güçlü Yön | Zayıf Yön |
|-------|-------------|-----------|-----------|
| Tripo3D | Kendi modeli, $0.40-0.50/model | Kalite, API | Pahalı, tek model |
| Meshy AI | Kendi modeli, $20-60/ay | Kullanım kolaylığı | Sınırlı API |
| 3D AI Studio | Çoklu model, $12-60/ay | Fiyat | Kalite tutarsız |
| Kaedim | Manuel + AI, ~$10/model | İnsan QC | Yavaş, pahalı |
| CSM.ai | Kendi modeli | Oyun odaklı | Dar niş |

### Hedef Kitle
- **Birincil:** Orta ölçekli e-ticaret mağazaları (Shopify, WooCommerce)
- **İkincil:** Dijital ajanslar, iç mimar stüdyoları
- **Üçüncül:** Oyun/metaverse geliştiriciler

### Hedef Bölge
- **Lansman:** ABD + Avrupa (İngilizce)
- **Faz 2:** Türkiye + MENA (Türkçe)

---

## 3. Teknik Mimari

### 3.1 Multi-Model Pipeline

```
Fotoğraf Yükleme
    ↓
[Ön İşleme]
├── rembg (arka plan kaldırma) — MIT lisans, ücretsiz
├── Real-ESRGAN (AI upscaling) — BSD-3, ücretsiz
└── Normalizasyon (crop, resize, format)
    ↓
[Kalite Katmanı / Smart Router]
├── Fast Tier    → TRELLIS v1 (MIT)    → ~$0.02/model, ~15sn, white mesh
├── Standard     → TRELLIS 2 (MIT)     → ~$0.30/model, ~2dk, textured
└── Premium      → Hunyuan3D 2.1       → ~$0.30/model, ~74sn, PBR textured
    ↓
[Son İşleme]
├── Draco compression (web optimizasyon)
├── Auto-LOD (Level of Detail)
├── PBR material mapping
└── GLB export
    ↓
[Teslimat]
├── Embed Widget (iframe, React Three Fiber)
├── Direct Download (GLB/GLTF/OBJ/FBX)
└── AR Quick Look (USDZ)
```

### 3.2 AI Modelleri Karşılaştırma (Playground Test Sonuçları — 2026-02-25)

| Model | Lisans | Maliyet (fal.ai) | Kalite | PBR/Texture | Süre | Test Notu |
|-------|--------|-------------------|--------|-------------|------|-----------|
| TRELLIS v1 (Microsoft) | MIT | $0.02 | İyi | White mesh | ~15sn | Hızlı, güvenilir |
| TRELLIS 2 (Microsoft) | MIT | $0.25-0.35 (çözünürlüğe göre) | Çok iyi ("sahici") | Textured | ~2dk | 1024p=$0.30 |
| Hunyuan3D v2 (Tencent) | Tencent Mixed | $0.16 (mesh) / $0.48 (textured) | Test edilemedi | White mesh / opsiyonel texture | 4+ dk kuyruk | Cold start sorunu |
| Hunyuan3D 2.1 (Tencent) | Tencent Mixed | $0.30 | Mükemmel | PBR Textured dahil | ~74sn | En iyi kalite |
| TripoSR (Stability AI) | MIT | ~$0.02 | Orta | Hayır | 5sn | Test edilmedi |

> **DİKKAT:** Orijinal rapordaki TRELLIS.2=$0.02 ve Hunyuan3D=$0.16 fiyatları YANLIŞ idi.
> Bunlar sırasıyla TRELLIS v1 ve Hunyuan3D v2 (white mesh) fiyatlarıydı.
> Yeni nesil modeller (TRELLIS 2, Hunyuan3D 2.1) 15-17x daha pahalı.

### 3.3 Hunyuan3D 2.1 Lisans Uyarıları

- **Ticari kullanım:** Koşullu olarak izinli
- **SaaS/Hosted Service:** Kapsam dahilinde
- **1M+ MAU:** Tencent onayı gerekli
- **AB/İngiltere/Güney Kore:** Lisans GEÇERLİ DEĞİL (bölge kısıtlaması)
- **Çıktı sahipliği:** Tencent hak talep etmiyor
- **Risk:** Bazı kaynak dosyalarda "NON-COMMERCIAL" başlığı var — toplulukta kafa karışıklığı

**Karar:** AB müşterilerine hizmet verilecekse Hunyuan kullanılamaz. Yalnızca MIT lisanslı modellere (TRELLIS.2, TripoSR) dayanılmalı. ABD müşterileri için Hunyuan güvenli.

### 3.4 Tech Stack

| Katman | Teknoloji | Maliyet |
|--------|-----------|---------|
| Frontend | Next.js + React Three Fiber | - |
| Hosting | Vercel Pro | $20/ay |
| Veritabanı | Supabase Pro | $25/ay |
| Depolama | Cloudflare R2 | $0.015/GB, sıfır egress |
| Ödeme (Global) | Stripe | %2.9 + $0.30 |
| Ödeme (Türkiye) | Iyzico | ~%4.29 + 0.25 TL |
| AI API | fal.ai | Model başına değişken |
| GPU (ölçeklenme) | RunPod / Vast.ai | A100 $0.40-1.10/saat |

---

## 4. İş Modeli

### 4.1 Farklılaşma Stratejisi

**A) E-Ticaret Embed Widget** (birincil ürün)
- iframe ile herhangi bir siteye gömülebilir 3D görüntüleyici
- Otomatik oluşturulan embed kodu
- Marka özelleştirme (logo, renkler)
- Analytics (görüntülenme, etkileşim, dönüşüm)
- AR desteği (mobilde)

**B) Batch Processing** (ikincil ürün)
- CSV + ZIP yükleme → toplu 3D dönüşüm
- İlerleme takibi dashboard
- Webhook bildirimleri
- E-ticaret platformu entegrasyonları

### 4.2 Fiyatlandırma (MRR Tabanlı)

| Plan | Fiyat | Kredi | Embed Widget | Batch | Depolama |
|------|-------|-------|-------------|-------|----------|
| Starter | $29/ay | 50 model | 10 aktif | - | 5 GB |
| Growth | $79/ay | 200 model | 100 aktif | Evet | 25 GB |
| Enterprise | $199/ay | 1000 model | Sınırsız | Evet + API | 100 GB |

Ek model: $0.50-1.00/adet (plana göre)

### 4.3 Maliyet vs Gelir Analizi (Aylık, 100 müşteri senaryosu)

**Gelir (100 müşteri karışımı):**
- 60 Starter × $29 = $1,740
- 30 Growth × $79 = $2,370
- 10 Enterprise × $199 = $1,990
- **Toplam MRR: ~$6,100**

**Sabit Maliyetler:**
- Vercel Pro: $20
- Supabase Pro: $25
- Domain + SSL: ~$5
- Monitoring (Sentry vb): ~$30
- **Toplam: ~$80/ay**

**Değişken Maliyetler (tahmini 8,000 model/ay) — DÜZELTİLMİŞ FİYATLAR:**
- TRELLIS v1 (%60): 4,800 × $0.02 = $96
- TRELLIS 2 (%25): 2,000 × $0.30 = $600
- Hunyuan3D 2.1 (%15): 1,200 × $0.30 = $360
- Cloudflare R2 (50 GB): ~$0.75
- **Toplam: ~$1,057/ay**

**Özet (düzeltilmiş):**
- Gelir: $6,100
- Maliyet: $1,137
- **Brüt Kâr: ~$4,963 (%81.4 marj)**

> Not: Önceki rapora göre marj %89.5'ten %81.4'e düştü ama hala çok sağlıklı.
> Anahtar strateji: TRELLIS v1'i Fast tier olarak kullanıp maliyeti düşük tutmak.

### 4.4 Alternatif Senaryolar

**Senaryo A — Sadece TRELLIS v1 (minimum maliyet):**
- 8,000 × $0.02 = $160 → Brüt Kâr: $5,860 (%96 marj)
- Kalite orta, texture yok — ön izleme/hızlı dönüşüm için uygun

**Senaryo B — Self-hosted GPU (ölçekleme):**
- SaladCloud RTX 4090: Hunyuan3D 2.1 @ ~$0.01-0.015/model
- 8,000 × $0.015 = $120 + GPU kirası → çok yüksek marj
- Dezavantaj: DevOps yükü, cold start yönetimi

**Senaryo C — Tripo3D Reseller (kıyaslama):**
- 8,000 × $0.45 = $3,600
- Brüt Kâr: $2,420 (%39.7 marj)
- **Multi-model pipeline ile 2x daha kârlı**

---

## 5. Yasal Gereklilikler

### 5.1 Türkiye
- **KVKK:** Kişisel veri (fotoğraf) işleme izni, açık rıza, VERBİS kaydı
- **Dijital Hizmet Vergisi:** 20M TL altında muaf
- **Şirket Türü:** Şahıs şirketi veya Limited Şirket
- **Fatura:** e-Fatura / e-Arşiv zorunluluğu (mükellefiyet durumuna göre)

### 5.2 ABD (Önerilen: Wyoming LLC)
- **Kuruluş:** Stripe Atlas ($500) — En hızlı ve entegre yol
- **Alternatifler:** Firstbase ($399), doola ($297)
- **Yıllık maliyet:** ~$600 (ilk yıl), ~$400 (sonraki)
- **Vergi:** Form 5472 zorunlu, Türkiye-ABD çifte vergilendirme anlaşması var
- **Avantaj:** Stripe tam erişim, global bankacılık, yatırımcı uyumluluğu

### 5.3 AB/GDPR
- Kişisel veri (fotoğraf) işleme → GDPR uyumu gerekli
- Data Processing Agreement (DPA) hazırlanmalı
- Hunyuan3D AB'de kullanılamaz (lisans kısıtlaması)

---

## 6. Fiziki Yapılacaklar Listesi (Faz 0)

### Hukuki/İdari
- [ ] Wyoming LLC kuruluşu (Stripe Atlas)
- [ ] EIN (Employer Identification Number) alımı
- [ ] Mercury veya Relay bank hesabı açılışı
- [ ] Türkiye'de vergi mükellefiyet durumu değerlendirmesi
- [ ] CPA (muhasebeci) bulunması — Türk-ABD çifte vergi konusunda deneyimli

### Teknik Hazırlık
- [ ] Domain satın alma
- [ ] Tripo3D developer hesabı açma (yedek olarak)
- [ ] fal.ai hesabı + API key
- [ ] Cloudflare hesabı + R2 bucket oluşturma
- [ ] Supabase projesi oluşturma
- [ ] Vercel hesabı

### İçerik/Pazarlama
- [ ] Landing page tasarımı
- [ ] 10-20 demo 3D model oluşturma
- [ ] Kullanım videosu/tutorial hazırlama

---

## 7. Risk Analizi

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| AI model kalitesi yetersiz | Orta | Yüksek | Multi-model → düşük kaliteliyi eleme |
| Hunyuan lisans sorunu | Düşük | Yüksek | MIT modellere (TRELLIS) ağırlık ver |
| Tripo3D/fal.ai fiyat artışı | Orta | Orta | Self-hosted GPU'ya geçiş planı |
| Rakip pivot | Yüksek | Orta | Embed widget = moat, hız avantajı |
| Düşük talep | Orta | Yüksek | Ücretsiz tier + content marketing |
| KVKK/GDPR ihlali | Düşük | Çok Yüksek | Hukuki danışman, DPA, açık rıza |

---

## 8. Önerilen Faz Planı

### Faz 0: Kuruluş (Hafta 1-2)
- LLC kuruluşu, banka hesabı, domain
- Developer hesapları (fal.ai, Cloudflare, Supabase)

### Faz 1: MVP (Hafta 3-6)
- Tek fotoğraf → 3D model (TRELLIS.2)
- Basit embed widget (iframe + R3F viewer)
- Stripe ödeme entegrasyonu
- Landing page + waitlist

### Faz 2: Multi-Model + Batch (Hafta 7-10)
- Smart router (kalite katmanları)
- Hunyuan3D 2.1 entegrasyonu (ABD müşterileri)
- Batch upload (CSV + ZIP)
- Dashboard + analytics

### Faz 3: Ölçekleme (Hafta 11-16)
- E-ticaret platform entegrasyonları (Shopify, WooCommerce)
- AR desteği (USDZ export)
- White-label API
- Self-hosted GPU geçişi (maliyet optimizasyonu)

---

## 9. Playground Test Sonuçları (2026-02-25)

fal.ai playground üzerinden 4 model test edildi:

| Model | Maliyet | Süre | Çıktı | Kalite Değerlendirmesi |
|-------|---------|------|-------|------------------------|
| TRELLIS v1 | $0.02 | 14.92sn | GLB (white mesh) | İyi — hızlı prototipleme için ideal |
| TRELLIS 2 (1024p) | $0.30 | ~2dk | GLB (textured) | Çok iyi — "sahici" çıktı |
| Hunyuan3D v2 | $0.16 | 4+ dk kuyruk (timeout) | Test edilemedi | Cold start sorunu — playground'da güvenilmez |
| Hunyuan3D 2.1 | $0.30 | 73.55sn | GLB (PBR textured) | Mükemmel — en iyi kalite, PBR dahil |

**Önemli Bulgular:**
1. TRELLIS v1 hız/fiyat oranında açık ara lider ($0.02, 15sn)
2. Hunyuan3D 2.1, $0.30'a PBR tekstürlü model veriyor — v2'de aynısı $0.48
3. TRELLIS 2 ve Hunyuan3D 2.1 aynı fiyatta ($0.30) ama farklı güçleri var
4. fal.ai playground'da Hunyuan modelleri cold start sorunlu — API'de daha stabil olur
5. MIT lisanslı TRELLIS modelleri bölge kısıtlaması olmadan her yerde kullanılabilir

**Önerilen Pipeline (test sonrası revize):**
- **Fast Tier:** TRELLIS v1 @ $0.02 — hızlı ön izleme, düşük maliyet
- **Premium Tier:** Hunyuan3D 2.1 @ $0.30 — PBR tekstürlü son çıktı (ABD)
- **AB Premium:** TRELLIS 2 @ $0.30 — MIT lisans, bölge kısıtlaması yok

---

## 10. Sonuç ve Tavsiye

**Bu iş yapılabilir mi?** Evet — playground testleri bunu doğruladı.

1. **Saf reseller OLMAYIN.** Tripo3D'yi doğrudan satmak sürdürülebilir değil.
2. **Multi-model pipeline gerçek IP'niz.** TRELLIS v1 (hız) + Hunyuan3D 2.1 (kalite) kombinasyonu = güçlü farklılaşma.
3. **Embed widget moat'ınız.** Bir kere entegre edilince geçiş maliyeti yüksek.
4. **MVP'de TRELLIS v1 ile başlayın.** $0.02/model, MIT lisans, 15sn — en risksiz başlangıç.
5. **AB için TRELLIS 2 kullanın.** MIT lisans, bölge kısıtlaması yok, $0.30 ama yüksek kalite.
6. **ABD müşterileri için Hunyuan3D 2.1 ekleyin.** PBR çıktı büyük avantaj.
7. **ABD LLC tercih edin.** Global SaaS için en uygun yapı.

**Tahmini başlangıç yatırımı:** ~$1,500-2,000 (LLC + hosting + ilk 3 ay)
**Break-even noktası:** ~30-40 ücretli müşteri (~$1,500-2,000 MRR)
**Tahmini süre:** 3-6 ay (MVP'den ilk gelire)

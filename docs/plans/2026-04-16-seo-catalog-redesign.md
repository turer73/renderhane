# SEO Optimizasyonu + Projelerim Katalog Tasarimi

## Faz 1: SEO (Oncelikli)

### 1a. Kritik: 12 Arac Sayfasi Metadata
Her biri icin `layout.tsx` olustur (qr-kod pattern'i):
- generateMetadata: title, description, keywords (TR+EN)
- OG image, canonical, alternates/hreflang
- Sayfalar: 3d-model, sahne-olustur, video-olustur, aplus-icerik,
  gorsel-iyilestir, gorsel-duzenle, sosyal-medya-paketi,
  ai-gorsel-uret, konusan-avatar, logo-tasarla, kiyafet-giydirme, nesne-silme

### 1b. Yuksek: robots.txt
- `/tr/app/` ve `/en/app/` disallow ekle

### 1c. Yuksek: Hreflang tutarliligi
- Legal sayfalara alternates ekle (privacy, terms, kvkk, cookie-policy)
- Login sayfasina alternates ekle
- x-default hreflang ekle

### 1d. Yuksek: Blog BASE_URL
- `renderhane.com` -> `www.renderhane.com` duzelt

### 1e. Orta: Schema.org
- Arac sayfalarina FAQPage + HowTo JSON-LD
- BreadcrumbList tum sayfalara

### 1f. Orta: Performans
- preconnect hint'leri
- Marketing raw img -> next/image

## Faz 2: Projelerim Katalog

### Cikti bazli filtrelenebilir grid
- Veri: outputs tablosu (proje join)
- Filtre sekmeleri: Tumu / 3D / Gorsel / Video / Tasarim
- Arama: proje adina gore
- Siralama: yeni->eski (varsayilan)
- Kart: thumbnail + tip badge + proje adi + tarih + sil butonu
- Silme: tek cikti silme (onay dialog)

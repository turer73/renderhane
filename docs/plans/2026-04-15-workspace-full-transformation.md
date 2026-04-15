# Workspace Tam Donusum Tasarimi

**Tarih:** 2026-04-15
**Durum:** Onaylandi
**Prensip:** Tek sistem, sifir duplikasyon

## Ozet

Eski tool sayfa sistemi (12 ayri PhotoUpload sayfasi) tamamen kaldirilip tek workspace arayuzune gecis. Social-kit haric tum araclar workspace uzerinden calisacak. Eski URL'ler middleware redirect ile geriye uyumlu kalacak.

## Mevcut Durum

- 12 tool sayfasi `/app/tools/*` altinda (simdi redirect)
- 1 social-kit ozel sayfasi (pipeline API)
- PhotoUpload componenti dashboard'da "Hizli Yukle" olarak kullaniliyor
- Workspace tamamen calisiyor: 6 kategori, 17 tab, deep link destegi
- Registry href'leri zaten `/app/workspace?tool=X` olarak guncellendi

## Hedef Durum

```
/app/workspace              → Ana arac arayuzu (6 kategori, 17 tab)
/app/workspace?tool=X       → Deep link (kategori + tab otomatik secilir)
/app/tools/social-kit       → Kalir (ozel pipeline sayfasi)
/app/tools/*  (diger)       → Middleware redirect → workspace
Dashboard                   → ToolGrid + Workspace CTA (PhotoUpload yok)
```

## Silinecek Dosyalar (14)

1. `src/app/[locale]/(app)/app/tools/bg-remove/page.tsx`
2. `src/app/[locale]/(app)/app/tools/scene/page.tsx`
3. `src/app/[locale]/(app)/app/tools/aplus/page.tsx`
4. `src/app/[locale]/(app)/app/tools/3d-model/page.tsx`
5. `src/app/[locale]/(app)/app/tools/enhance/page.tsx`
6. `src/app/[locale]/(app)/app/tools/video/page.tsx`
7. `src/app/[locale]/(app)/app/tools/image-edit/page.tsx`
8. `src/app/[locale]/(app)/app/tools/text-to-image/page.tsx`
9. `src/app/[locale]/(app)/app/tools/talking-avatar/page.tsx`
10. `src/app/[locale]/(app)/app/tools/logo/page.tsx`
11. `src/app/[locale]/(app)/app/tools/virtual-tryon/page.tsx`
12. `src/app/[locale]/(app)/app/tools/qr-code/page.tsx`
13. `src/app/[locale]/(app)/app/tools/layout.tsx`
14. `src/components/app/photo-upload.tsx`

## Degistirilecek Dosyalar

### Middleware (yeni ekleme)
`src/middleware.ts` — Eski `/app/tools/*` URL'lerini workspace'e redirect et (social-kit haric).

### Dashboard
`src/components/app/dashboard-content.tsx` — PhotoUpload import/kullanimi kaldirilir, yerine workspace CTA eklenir.

### Top Bar
`src/components/app/top-bar.tsx` — `getPageTitle()` icine workspace route basligi eklenir.

### Yorum Guncellemeleri
- `src/components/app/processing-modal.tsx`
- `src/app/api/health/status/route.ts`
- `src/hooks/use-job-polling.tsx`
- `src/lib/resize-image.ts`

### E2E Testler
- `e2e/tool-grid.spec.ts` — href'ler workspace URL'ine
- `e2e/tool-pages.spec.ts` — workspace URL dogrudan test + redirect testi
- `e2e/tool-submit.spec.ts` — URL'ler workspace'e
- `e2e/login.spec.ts` — auth redirect zinciri guncelleme
- `e2e/workspace-deep-link.spec.ts` — YENI: her tool icin deep link kontrolu

## Metrikler

| Metrik | Deger |
|--------|-------|
| Silinen dosya | 14 |
| Eklenen dosya | 1 (test) |
| Guncellenen dosya | ~10 |
| Net satir degisimi | ~-800 |
| Geriye uyumluluk | Middleware redirect ile tam |

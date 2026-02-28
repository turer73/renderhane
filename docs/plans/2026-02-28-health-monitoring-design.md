# Renderhane — fal.ai Health Monitoring System

## Problem
fal.ai servis kesintileri kullanıcılara teknik hata mesajları olarak yansıyor. Kullanıcılar ne olduğunu anlamıyor, admin'in haberi olmuyor. Proaktif izleme yok.

## Çözüm
Vercel Cron ile 12 saatte bir fal.ai'ye ping atarak servis durumunu kontrol eden, sorun varsa admin'e e-posta gönderen ve kullanıcılara dostça bakım mesajı gösteren bir sağlık izleme sistemi.

## Mimari

```
Vercel Cron (12h / 30min recovery)
       │
       ▼
/api/cron/health
       │
       ├─ fal.queue.submit() + cancel() → ping
       │
       ├─ system_status tablosu güncelle
       ├─ system_health_logs'a kayıt ekle
       └─ Durum değişikliğinde → Resend ile admin e-posta

PhotoUpload → /api/health/status → system_status kontrol
       │
       └─ Servis down ise → işlem engelle + bakım mesajı göster
```

## Yeni DB Tabloları

### system_status
| Sütun | Tip | Açıklama |
|-------|-----|----------|
| id | text PK | 'fal-ai' (tek satır) |
| is_healthy | boolean | Servis sağlıklı mı |
| last_check_at | timestamptz | Son kontrol zamanı |
| last_down_at | timestamptz? | Son kesinti zamanı |
| consecutive_failures | int | Arka arkaya başarısız kontrol sayısı |
| last_error | text? | Son hata mesajı |

### system_health_logs
| Sütun | Tip | Açıklama |
|-------|-----|----------|
| id | uuid PK | |
| service | text | 'fal-ai' |
| status | text | 'ok' / 'error' |
| response_time_ms | int? | Yanıt süresi |
| error_message | text? | Hata detayı |
| created_at | timestamptz | Kontrol zamanı |

## Yeni Dosyalar

1. `src/lib/auth/admin-check.ts` — Admin e-posta kontrolü (ENV bazlı)
2. `src/app/api/cron/health/route.ts` — Cron health check endpoint
3. `src/app/api/health/status/route.ts` — Client-side durum sorgusu
4. `src/lib/email/health-alerts.ts` — Resend ile uyarı e-postaları

## Değiştirilecek Dosyalar

1. `src/components/app/photo-upload.tsx` — Sağlık kontrolü + bakım mesajı
2. `src/messages/tr.json` — Türkçe çeviriler
3. `src/messages/en.json` — İngilizce çeviriler
4. `vercel.json` — Cron yapılandırması

## Güvenlik
- Cron endpoint: CRON_SECRET ile korumalı (Vercel otomatik gönderir)
- Admin e-posta: ADMIN_EMAILS env değişkeni
- Client status endpoint: Hassas bilgi döndürmez (sadece boolean)

## Zamanlama
- Normal mod: 12 saatte bir kontrol
- Recovery mod: Servis down ise 30 dakikada bir kontrol
- Otomatik recovery: Servis düzelince otomatik aç + admin'e "recovered" e-posta

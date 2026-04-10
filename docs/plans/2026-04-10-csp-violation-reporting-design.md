# CSP Violation Reporting System — Design

**Date:** 2026-04-10
**Status:** Approved
**Scope:** All 5 sites (renderhane, bilgearena, kokenakademi, panola, 3d-labx)

## Problem

CSP header'a yeni external servis eklendiğinde whitelist atlanabiliyor.
Renderhane'de analytics.panola.app 20 gun boyunca CSP tarafindan engellendi, kimse fark etmedi.

## Solution

Merkezi CSP violation collector: VPS'te micro-service + Klipper SQLite + Slack bildirim.

## Architecture

```
Browser CSP violation
  → POST csp.panola.app/csp-report (VPS collector)
    → Rate limit + dedup
    → Her 5dk Klipper SQLite sync
    → Yeni violation = aninda Slack
    → Tekrar eden = gunluk ozet
```

## Data Model (Klipper claude_memory.db)

```sql
CREATE TABLE csp_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  directive TEXT NOT NULL,
  blocked_uri TEXT NOT NULL,
  source_file TEXT,
  disposition TEXT DEFAULT 'enforce',
  user_agent TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  resolved INTEGER DEFAULT 0,
  UNIQUE(site, directive, blocked_uri)
);
```

## Components

1. **VPS csp-collector** — Python FastAPI, port 8899, Docker
2. **Klipper API** — /api/v1/csp/* endpoints
3. **Cloudflare DNS** — csp.panola.app CNAME
4. **Slack webhook** — #alerts channel
5. **Site middleware** — report-uri + Report-To headers

## Implementation Steps

1. Klipper: csp_violations tablo + API
2. VPS: csp-collector Docker service
3. DNS: csp.panola.app subdomain
4. Slack webhook + bildirim
5. Tum sitelere report-uri header ekle

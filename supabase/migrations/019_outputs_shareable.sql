-- 019_outputs_shareable.sql
-- Renderhane -> Panola-Social share-attribution akisi icin kolon eklemeleri.
--
-- KAYNAK NOTU (2026-05-06): Orijinal taslak klipper /tmp/'de hazirlanmisti
-- (session 290, 2026-05-05). Reboot sonrasi /tmp temizlendigi icin orijinal
-- dosya kayboldu. Bu dosya merkezi hafiza ozetindeki kolon listesi + default
-- degerleri ve 001_initial_schema.sql'deki outputs/profiles tip semasi
-- temel alinarak yeniden insa edildi. Apply etmeden once kolon adlarinin
-- panola-social tarafindaki tuketici kod ile uyustugunu dogrula.

BEGIN;

-- outputs: paylasilabilir isaretleme + sosyal medya gonderim takibi
ALTER TABLE public.outputs
  ADD COLUMN IF NOT EXISTS is_shareable    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shareable_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shared_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shared_post_id  TEXT;

-- profiles: kullanicinin paylasimda gozukmek istedigi handle + consent
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_attribution_handle  TEXT,
  ADD COLUMN IF NOT EXISTS share_attribution_consent BOOLEAN NOT NULL DEFAULT FALSE;

-- panola-social tarama listesi: shareable=true ve henuz paylasilmamis kayitlar
CREATE INDEX IF NOT EXISTS idx_outputs_shareable
  ON public.outputs (shareable_at)
  WHERE is_shareable = TRUE AND shared_at IS NULL;

COMMIT;

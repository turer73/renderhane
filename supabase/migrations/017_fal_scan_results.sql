-- fal.ai model scanner results table
-- Stores periodic scan results comparing our model configs against fal.ai's current catalog

CREATE TABLE IF NOT EXISTS public.fal_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),

  -- Summary counts
  total_models_checked int NOT NULL DEFAULT 0,
  active_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  new_models_found int NOT NULL DEFAULT 0,

  -- Detailed results as JSONB arrays
  -- Each item: { endpoint, status, responseTime?, error? }
  endpoint_checks jsonb NOT NULL DEFAULT '[]',
  -- Each item: { name, endpoint, category, source }
  new_models jsonb NOT NULL DEFAULT '[]',
  -- Each item: { endpoint, issue, detail }
  alerts jsonb NOT NULL DEFAULT '[]',

  -- Whether admin has reviewed this scan
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id)
);

-- Index for quick "latest scan" lookup
CREATE INDEX IF NOT EXISTS idx_fal_scan_results_scanned_at
  ON public.fal_scan_results (scanned_at DESC);

-- RLS: Only admins can read/write (enforced at API level, table is accessed via admin client)
ALTER TABLE public.fal_scan_results ENABLE ROW LEVEL SECURITY;

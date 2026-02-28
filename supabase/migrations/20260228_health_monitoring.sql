-- Health Monitoring: system_status + system_health_logs tables
-- Run this in Supabase SQL Editor

-- Single-row status table for each monitored service
CREATE TABLE IF NOT EXISTS system_status (
  id TEXT PRIMARY KEY,
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  last_check_at TIMESTAMPTZ DEFAULT now(),
  last_down_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

-- Insert default fal-ai row
INSERT INTO system_status (id, is_healthy) VALUES ('fal-ai', true)
ON CONFLICT (id) DO NOTHING;

-- Health check log for historical tracking
CREATE TABLE IF NOT EXISTS system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL DEFAULT 'fal-ai',
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient querying of recent logs
CREATE INDEX IF NOT EXISTS idx_health_logs_service_created
  ON system_health_logs (service, created_at DESC);

-- No RLS needed: these tables are only accessed by adminClient (service role)
-- which bypasses RLS entirely.
ALTER TABLE system_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_logs ENABLE ROW LEVEL SECURITY;

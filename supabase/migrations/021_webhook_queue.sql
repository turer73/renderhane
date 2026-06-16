-- Webhook Queue: reliable async processing for fal.ai webhooks
-- Run this in Supabase SQL Editor

-- Queue table for pending webhook events
CREATE TABLE IF NOT EXISTS webhook_queue (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB NOT NULL,
  job_id TEXT,
  tx_id TEXT,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  visible_after TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_pending
  ON webhook_queue (visible_after, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_queue_job_id
  ON webhook_queue (job_id)
  WHERE job_id IS NOT NULL;

-- Enqueue a webhook event
CREATE OR REPLACE FUNCTION public.enqueue_webhook(
  p_payload JSONB,
  p_job_id TEXT DEFAULT NULL,
  p_tx_id TEXT DEFAULT NULL,
  p_signature TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO webhook_queue (payload, job_id, tx_id, signature)
  VALUES (p_payload, p_job_id, p_tx_id, p_signature)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Dequeue next batch of pending webhooks
CREATE OR REPLACE FUNCTION public.dequeue_webhooks(
  p_batch_size INTEGER DEFAULT 5,
  p_visibility_timeout INTEGER DEFAULT 60
) RETURNS TABLE(
  id BIGINT,
  payload JSONB,
  job_id TEXT,
  tx_id TEXT,
  signature TEXT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE webhook_queue
  SET
    status = 'processing',
    started_at = now(),
    attempts = attempts + 1,
    visible_after = now() + (p_visibility_timeout || ' seconds')::INTERVAL
  WHERE id IN (
    SELECT id FROM webhook_queue
    WHERE status = 'pending'
      AND visible_after <= now()
      AND attempts < max_attempts
    ORDER BY id ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    id,
    payload,
    job_id,
    tx_id,
    signature,
    attempts;
END;
$$;

-- Mark webhook as completed
CREATE OR REPLACE FUNCTION public.complete_webhook(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE webhook_queue
  SET status = 'completed', completed_at = now()
  WHERE id = p_id AND status = 'processing';
  RETURN FOUND;
END;
$$;

-- Mark webhook as failed
CREATE OR REPLACE FUNCTION public.fail_webhook(p_id BIGINT, p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE webhook_queue
  SET status = 'failed', completed_at = now(), error_message = p_error
  WHERE id = p_id AND status = 'processing';
  RETURN FOUND;
END;
$$;

-- RLS: only service_role access
ALTER TABLE webhook_queue ENABLE ROW LEVEL SECURITY;

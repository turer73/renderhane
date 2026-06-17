-- Fix: dequeue_webhooks "column reference \"id\" is ambiguous" (prod 500)
--
-- 021_webhook_queue.sql'deki dequeue_webhooks, RETURNS TABLE(id, ..., attempts)
-- OUT-parametreleriyle webhook_queue kolonlarını (id, attempts) çakıştırıyordu.
-- UPDATE ... WHERE id IN (...) RETURNING id ifadesinde `id` hem OUT-param hem
-- kolon olarak çözülebildiğinden PostgreSQL "ambiguous" hatası verip fonksiyon
-- HER çağrıda 500 atıyordu (process-webhooks cron'u hiç çalışmadı).
--
-- Çözüm: UPDATE hedefine tablo alias (wq) ver, tüm kolon referanslarını qualify
-- et; alt-sorguda ayrı alias (wq2). CREATE OR REPLACE -> idempotent, prod'da
-- güvenli replay.

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
  UPDATE webhook_queue AS wq
  SET
    status = 'processing',
    started_at = now(),
    attempts = wq.attempts + 1,
    visible_after = now() + (p_visibility_timeout || ' seconds')::INTERVAL
  WHERE wq.id IN (
    SELECT wq2.id FROM webhook_queue AS wq2
    WHERE wq2.status = 'pending'
      AND wq2.visible_after <= now()
      AND wq2.attempts < wq2.max_attempts
    ORDER BY wq2.id ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING wq.id, wq.payload, wq.job_id, wq.tx_id, wq.signature, wq.attempts;
END;
$$;

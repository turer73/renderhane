-- Add unique constraint on outputs.job_id for webhook idempotency.
-- This ensures upsert (ON CONFLICT job_id) works correctly
-- and prevents duplicate output records from webhook retries.

-- First remove any existing duplicates (keep the latest one)
DELETE FROM public.outputs a
USING public.outputs b
WHERE a.job_id = b.job_id
  AND a.created_at < b.created_at;

-- Now add unique constraint
ALTER TABLE public.outputs
  ADD CONSTRAINT outputs_job_id_unique UNIQUE (job_id);

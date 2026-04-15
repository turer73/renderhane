-- 016: Add original_request column to jobs table
-- Stores the original user request (imageUrl, imageUrls, prompt, tier, tool)
-- before any processing (bg-remove, routing). Used by regenerate endpoint
-- to re-submit with fresh URLs instead of expired fal.ai CDN URLs.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS original_request JSONB DEFAULT '{}';

COMMENT ON COLUMN public.jobs.original_request IS
  'Original user request params before processing. Keys: imageUrl, imageUrls, prompt, tier, tool.';

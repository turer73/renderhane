-- Add virtual-tryon to jobs.tool check constraint
-- The API route already accepts it but the DB rejects it, causing job INSERT failures

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_tool_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_tool_check
  CHECK (tool IN (
    '3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus',
    'image-edit', 'social-kit', 'text-to-image', 'talking-avatar',
    'logo', 'qr-code', 'virtual-tryon'
  ));

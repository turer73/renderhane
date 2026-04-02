-- Add new tools to jobs.tool check constraint
-- New tools: image-edit, social-kit, text-to-image, talking-avatar, logo, qr-code

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_tool_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_tool_check
  CHECK (tool IN (
    '3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus',
    'image-edit', 'social-kit', 'text-to-image', 'talking-avatar', 'logo', 'qr-code'
  ));

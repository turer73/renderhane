-- 018: Fix job submission failures
-- 1) Ensure original_request column exists (migration 016 may not have been applied)
-- 2) Add inpainting and object-removal to tool CHECK constraint

-- Safe: IF NOT EXISTS won't fail if column already exists
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS original_request JSONB DEFAULT '{}';

-- Drop old constraint and recreate with all current tools
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_tool_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_tool_check
  CHECK (tool IN (
    '3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus',
    'image-edit', 'social-kit', 'text-to-image', 'talking-avatar',
    'logo', 'qr-code', 'virtual-tryon', 'inpainting', 'object-removal'
  ));

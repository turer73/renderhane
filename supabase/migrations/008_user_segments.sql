-- 008: Add user segment/use-case field to profiles
-- Supports: ecommerce, gaming (game/metaverse 3D), 3dprint (3D printing)
-- NULL = not yet selected (triggers onboarding)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS use_case TEXT DEFAULT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_use_case_check
  CHECK (use_case IS NULL OR use_case IN ('ecommerce', 'gaming', '3dprint'));

-- 20260915_srt_voiceover.sql
-- SRT Seslendirme (MiniMax): yeni tool + audio output tipi.
-- Run in Supabase SQL Editor (renderhane convention). Idempotent (re-runnable).
--
-- 1) jobs.tool CHECK'e 'srt-voiceover' eklenir (018'deki listenin aynısı + yeni tool).
-- 2) outputs.type CHECK'e 'audio' eklenir (cue sesleri + istemci mix çıktısı için).
--    outputs_job_id_unique aynen kalır: job başına TEK outputs satırı; cue
--    listesi metadata.tracks JSONB içinde saklanır.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_tool_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_tool_check
  CHECK (tool IN (
    '3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus',
    'image-edit', 'social-kit', 'text-to-image', 'talking-avatar',
    'logo', 'qr-code', 'virtual-tryon', 'inpainting', 'object-removal',
    'srt-voiceover'
  ));

ALTER TABLE public.outputs DROP CONSTRAINT IF EXISTS outputs_type_check;
ALTER TABLE public.outputs ADD CONSTRAINT outputs_type_check
  CHECK (type IN ('glb', 'image', 'video', 'audio'));

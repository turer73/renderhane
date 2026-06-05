import { describe, it, expect } from 'vitest';
import {
  MODELS, TOOL_MODELS, TOOL_CREDITS, TOOLS_WITH_PROMPT, TOOLS_MULTI_IMAGE,
  TOOLS_TEXT_ONLY, MAX_MULTI_IMAGES, type ToolType,
} from '../models';

/** All 15 tools in the platform */
const ALL_TOOLS: ToolType[] = [
  '3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus',
  'image-edit', 'inpainting', 'object-removal', 'text-to-image', 'qr-code',
  'talking-avatar', 'logo', 'virtual-tryon',
];

/** Helper models that are not user-facing (0 credit cost is valid) */
const HELPER_MODELS = ['f5-tts'];

describe('MODELS', () => {
  it('has all expected model keys', () => {
    const keys = Object.keys(MODELS);
    // Core models
    expect(keys).toContain('trellis-v1');
    expect(keys).toContain('birefnet');
    expect(keys).toContain('aura-sr');
    expect(keys).toContain('wan-i2v');
    expect(keys).toContain('hunyuan3d-v3');
    // New Faz 1-3 models
    expect(keys).toContain('flux-kontext');
    expect(keys).toContain('flux-pro');
    expect(keys).toContain('flux-schnell');
    expect(keys).toContain('qr-code-ai');
    expect(keys).toContain('omnihuman');
    expect(keys).toContain('recraft-v4');
    expect(keys).toContain('recraft-v4-svg');
    expect(keys).toContain('f5-tts');
    // New models
    expect(keys).toContain('flux-kontext-max');
    expect(keys).toContain('flux-fill');
    expect(keys).toContain('object-removal');
    expect(keys).toContain('hyper3d-rodin');
    expect(keys).toContain('kling-i2v');
  });

  it('every model has required fields', () => {
    for (const [key, model] of Object.entries(MODELS)) {
      expect(model.id, `${key}.id`).toBeTruthy();
      expect(model.displayName.tr, `${key}.displayName.tr`).toBeTruthy();
      expect(model.displayName.en, `${key}.displayName.en`).toBeTruthy();
      // Helper models (e.g. f5-tts) can have 0 credits
      if (HELPER_MODELS.includes(key)) {
        expect(model.creditCost, `${key}.creditCost`).toBeGreaterThanOrEqual(0);
      } else {
        expect(model.creditCost, `${key}.creditCost`).toBeGreaterThan(0);
      }
      expect(model.imageParamKey, `${key}.imageParamKey`).toBeTruthy();
      expect(['fast', 'standard', 'premium']).toContain(model.tier);
    }
  });

  it('trellis-v1 is fast tier with 5 credits', () => {
    expect(MODELS['trellis-v1'].tier).toBe('fast');
    expect(MODELS['trellis-v1'].creditCost).toBe(5);
  });

  it('hunyuan3d-v3 is standard tier', () => {
    expect(MODELS['hunyuan3d-v3'].tier).toBe('standard');
    expect(MODELS['hunyuan3d-v3'].creditCost).toBe(20);
  });

  it('hunyuan3d-v31-pro is premium tier', () => {
    expect(MODELS['hunyuan3d-v31-pro'].tier).toBe('premium');
    expect(MODELS['hunyuan3d-v31-pro'].creditCost).toBe(40);
  });

  it('f5-tts is a free helper model for talking avatar pipeline', () => {
    expect(MODELS['f5-tts'].creditCost).toBe(0);
    expect(MODELS['f5-tts'].id).toBe('fal-ai/f5-tts');
  });

  it('omnihuman costs 25 credits for talking avatar', () => {
    expect(MODELS['omnihuman'].creditCost).toBe(25);
  });

  it('recraft-v4 costs 8 credits for logo generation', () => {
    expect(MODELS['recraft-v4'].creditCost).toBe(8);
  });

  it('object-removal costs 3 credits', () => {
    expect(MODELS['object-removal'].creditCost).toBe(3);
  });

  it('hyper3d-rodin is premium tier', () => {
    expect(MODELS['hyper3d-rodin'].tier).toBe('premium');
    expect(MODELS['hyper3d-rodin'].creditCost).toBe(35);
  });

  it('triposr costs 3 credits (updated from 2)', () => {
    expect(MODELS['triposr'].creditCost).toBe(3);
  });
});

describe('TOOL_MODELS', () => {
  it('maps all tool types to model arrays (social-kit excluded — orchestration)', () => {
    for (const tool of ALL_TOOLS) {
      expect(TOOL_MODELS[tool], `${tool} missing from TOOL_MODELS`).toBeDefined();
      expect(TOOL_MODELS[tool].length, `${tool} has no models`).toBeGreaterThan(0);
    }
  });

  it('3d-model has multiple models', () => {
    expect(TOOL_MODELS['3d-model'].length).toBeGreaterThanOrEqual(3);
  });

  it('text-to-image has fast and quality tiers', () => {
    expect(TOOL_MODELS['text-to-image']).toContain('flux-pro');
    expect(TOOL_MODELS['text-to-image']).toContain('flux-schnell');
  });

  it('all referenced models exist in MODELS', () => {
    for (const [tool, models] of Object.entries(TOOL_MODELS)) {
      for (const key of models) {
        expect(MODELS[key], `${key} (from ${tool}) missing from MODELS`).toBeDefined();
      }
    }
  });
});

describe('TOOL_CREDITS', () => {
  it('aplus overrides to 32', () => {
    expect(TOOL_CREDITS['aplus']).toBe(32);
  });

  it('bg-remove matches bria-rmbg cost', () => {
    expect(TOOL_CREDITS['bg-remove']).toBe(MODELS['bria-rmbg'].creditCost);
  });

  it('all tool types have credit costs', () => {
    for (const tool of ALL_TOOLS) {
      expect(TOOL_CREDITS[tool], `${tool} missing credit cost`).toBeGreaterThan(0);
    }
  });

  it('new tools have correct credit costs', () => {
    expect(TOOL_CREDITS['image-edit']).toBe(6);
    expect(TOOL_CREDITS['talking-avatar']).toBe(25);
    expect(TOOL_CREDITS['logo']).toBe(8);
    expect(TOOL_CREDITS['object-removal']).toBe(3);
    expect(TOOL_CREDITS['inpainting']).toBe(6);
  });
});

describe('Nano Banana Pro (Gemini 3 Pro Image)', () => {
  it('nano-banana-pro-edit is premium, 18 credits, edit endpoint (image_urls array)', () => {
    const m = MODELS['nano-banana-pro-edit'];
    expect(m.tier).toBe('premium');
    expect(m.creditCost).toBe(18);
    expect(m.id).toBe('fal-ai/nano-banana-pro/edit');
    expect(m.multiImage).toBe(true);
    expect(m.imageParamKey).toBe('image_urls');
    expect(m.promptParamKey).toBe('prompt');
  });

  it('nano-banana-pro is premium, 18 credits, generate endpoint', () => {
    const m = MODELS['nano-banana-pro'];
    expect(m.tier).toBe('premium');
    expect(m.creditCost).toBe(18);
    expect(m.id).toBe('fal-ai/nano-banana-pro');
    expect(m.promptParamKey).toBe('prompt');
  });

  it('is added to image-edit, scene, and text-to-image as a non-default (appended) option', () => {
    expect(TOOL_MODELS['image-edit']).toContain('nano-banana-pro-edit');
    expect(TOOL_MODELS['scene']).toContain('nano-banana-pro-edit');
    expect(TOOL_MODELS['text-to-image']).toContain('nano-banana-pro');
    // Default (first) model unchanged → base pricing preserved
    expect(TOOL_MODELS['image-edit'][0]).toBe('flux-kontext');
    expect(TOOL_MODELS['scene'][0]).toBe('bria-product-shot');
    expect(TOOL_MODELS['text-to-image'][0]).toBe('flux-pro');
  });

  it('does not change base tool credit costs (added as premium option, not default)', () => {
    expect(TOOL_CREDITS['image-edit']).toBe(6);
    expect(TOOL_CREDITS['scene']).toBe(8);
    expect(TOOL_CREDITS['text-to-image']).toBe(4);
  });
});

describe('constants', () => {
  it('TOOLS_WITH_PROMPT includes all prompt-based tools', () => {
    expect(TOOLS_WITH_PROMPT).toContain('scene');
    expect(TOOLS_WITH_PROMPT).toContain('video');
    expect(TOOLS_WITH_PROMPT).toContain('image-edit');
    expect(TOOLS_WITH_PROMPT).toContain('text-to-image');
    expect(TOOLS_WITH_PROMPT).toContain('qr-code');
    expect(TOOLS_WITH_PROMPT).toContain('logo');
  });

  it('TOOLS_TEXT_ONLY includes text-to-image, qr-code, logo', () => {
    expect(TOOLS_TEXT_ONLY).toContain('text-to-image');
    expect(TOOLS_TEXT_ONLY).toContain('qr-code');
    expect(TOOLS_TEXT_ONLY).toContain('logo');
    // Image-based tools should NOT be text-only
    expect(TOOLS_TEXT_ONLY).not.toContain('bg-remove');
    expect(TOOLS_TEXT_ONLY).not.toContain('scene');
  });

  it('TOOLS_MULTI_IMAGE includes 3d-model', () => {
    expect(TOOLS_MULTI_IMAGE).toContain('3d-model');
  });

  it('MAX_MULTI_IMAGES is 4', () => {
    expect(MAX_MULTI_IMAGES).toBe(4);
  });
});

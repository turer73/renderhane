import { describe, it, expect } from 'vitest';
import {
  MODELS, TOOL_MODELS, TOOL_CREDITS, TOOLS_WITH_PROMPT, TOOLS_MULTI_IMAGE,
  TOOLS_TEXT_ONLY, MAX_MULTI_IMAGES, type ToolType,
} from '../models';

/** All 12 tools in the platform */
const ALL_TOOLS: ToolType[] = [
  '3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus',
  'image-edit', 'text-to-image', 'qr-code', 'talking-avatar', 'logo',
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
    expect(keys).toContain('recraft-v3');
    expect(keys).toContain('f5-tts');
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

  it('hunyuan3d-v3 is premium tier', () => {
    expect(MODELS['hunyuan3d-v3'].tier).toBe('premium');
    expect(MODELS['hunyuan3d-v3'].creditCost).toBe(30);
  });

  it('f5-tts is a free helper model for talking avatar pipeline', () => {
    expect(MODELS['f5-tts'].creditCost).toBe(0);
    expect(MODELS['f5-tts'].id).toBe('fal-ai/f5-tts');
  });

  it('omnihuman costs 25 credits for talking avatar', () => {
    expect(MODELS['omnihuman'].creditCost).toBe(25);
  });

  it('recraft-v3 costs 8 credits for logo generation', () => {
    expect(MODELS['recraft-v3'].creditCost).toBe(8);
  });
});

describe('TOOL_MODELS', () => {
  it('maps all 12 tool types to model arrays', () => {
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

  it('bg-remove matches birefnet cost', () => {
    expect(TOOL_CREDITS['bg-remove']).toBe(MODELS['birefnet'].creditCost);
  });

  it('all 12 tool types have credit costs', () => {
    for (const tool of ALL_TOOLS) {
      expect(TOOL_CREDITS[tool], `${tool} missing credit cost`).toBeGreaterThan(0);
    }
  });

  it('new tools have correct credit costs', () => {
    expect(TOOL_CREDITS['image-edit']).toBe(6);
    expect(TOOL_CREDITS['talking-avatar']).toBe(25);
    expect(TOOL_CREDITS['logo']).toBe(8);
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

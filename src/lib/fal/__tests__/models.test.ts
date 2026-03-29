import { describe, it, expect } from 'vitest';
import {
  MODELS, TOOL_MODELS, TOOL_CREDITS, TOOLS_WITH_PROMPT, TOOLS_MULTI_IMAGE,
  MAX_MULTI_IMAGES, type ToolType,
} from '../models';

describe('MODELS', () => {
  it('has all expected model keys', () => {
    const keys = Object.keys(MODELS);
    expect(keys).toContain('trellis-v1');
    expect(keys).toContain('trellis-2');
    expect(keys).toContain('birefnet');
    expect(keys).toContain('aura-sr');
    expect(keys).toContain('wan-i2v');
    expect(keys).toContain('hunyuan3d-v3');
  });

  it('every model has required fields', () => {
    for (const [key, model] of Object.entries(MODELS)) {
      expect(model.id, `${key}.id`).toBeTruthy();
      expect(model.displayName.tr, `${key}.displayName.tr`).toBeTruthy();
      expect(model.displayName.en, `${key}.displayName.en`).toBeTruthy();
      expect(model.creditCost, `${key}.creditCost`).toBeGreaterThan(0);
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
});

describe('TOOL_MODELS', () => {
  it('maps all tool types to model arrays', () => {
    const tools: ToolType[] = ['3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus'];
    for (const tool of tools) {
      expect(TOOL_MODELS[tool].length).toBeGreaterThan(0);
    }
  });

  it('3d-model has multiple models', () => {
    expect(TOOL_MODELS['3d-model'].length).toBeGreaterThanOrEqual(3);
  });

  it('all referenced models exist in MODELS', () => {
    for (const models of Object.values(TOOL_MODELS)) {
      for (const key of models) {
        expect(MODELS[key], `${key} missing from MODELS`).toBeDefined();
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

  it('all tool types have credit costs', () => {
    const tools: ToolType[] = ['3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus'];
    for (const tool of tools) {
      expect(TOOL_CREDITS[tool]).toBeGreaterThan(0);
    }
  });
});

describe('constants', () => {
  it('TOOLS_WITH_PROMPT includes scene and video', () => {
    expect(TOOLS_WITH_PROMPT).toContain('scene');
    expect(TOOLS_WITH_PROMPT).toContain('video');
  });

  it('TOOLS_MULTI_IMAGE includes 3d-model', () => {
    expect(TOOLS_MULTI_IMAGE).toContain('3d-model');
  });

  it('MAX_MULTI_IMAGES is 4', () => {
    expect(MAX_MULTI_IMAGES).toBe(4);
  });
});

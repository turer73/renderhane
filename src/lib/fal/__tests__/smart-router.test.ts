import { describe, it, expect } from 'vitest';
import { routeRequest } from '../smart-router';

describe('routeRequest', () => {
  // ── 3D Model routing ──────────────────────────

  it('routes 3d-model fast + single image to trellis-v1', () => {
    const { modelKey } = routeRequest({ tool: '3d-model', tier: 'fast', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('trellis-v1');
  });

  it('routes 3d-model fast + multi image to tripo-v25-mv', () => {
    const { modelKey } = routeRequest({ tool: '3d-model', tier: 'fast', imageUrls: ['a', 'b'] });
    expect(modelKey).toBe('tripo-v25-mv');
  });

  it('routes 3d-model standard to meshy-5-multi', () => {
    const { modelKey } = routeRequest({ tool: '3d-model', tier: 'standard', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('meshy-5-multi');
  });

  it('routes 3d-model premium to hunyuan3d-v3', () => {
    const { modelKey } = routeRequest({ tool: '3d-model', tier: 'premium', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('hunyuan3d-v3');
  });

  it('defaults to standard tier', () => {
    const { modelKey } = routeRequest({ tool: '3d-model', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('meshy-5-multi');
  });

  // ── Other tools ────────────────────────────────

  it('routes bg-remove to birefnet', () => {
    const { modelKey } = routeRequest({ tool: 'bg-remove', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('birefnet');
  });

  it('routes enhance to aura-sr', () => {
    const { modelKey } = routeRequest({ tool: 'enhance', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('aura-sr');
  });

  it('routes scene to bria-product-shot', () => {
    const { modelKey } = routeRequest({ tool: 'scene', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('bria-product-shot');
  });

  it('routes video to wan-i2v', () => {
    const { modelKey } = routeRequest({ tool: 'video', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('wan-i2v');
  });

  it('routes aplus to bria-product-shot-hd', () => {
    const { modelKey } = routeRequest({ tool: 'aplus', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('bria-product-shot-hd');
  });

  // ── Input building ─────────────────────────────

  it('sets single image in input', () => {
    const { input } = routeRequest({ tool: 'bg-remove', imageUrl: 'http://img/photo.jpg' });
    expect(input['image_url']).toBe('http://img/photo.jpg');
  });

  it('sets multi-image array for trellis with single image', () => {
    const { input } = routeRequest({ tool: '3d-model', tier: 'fast', imageUrl: 'a.jpg' });
    // trellis-v1 is multiImage, wraps single URL in array
    expect(input['image_urls']).toEqual(['a.jpg']);
  });

  it('maps named image params for tripo', () => {
    const urls = ['front.jpg', 'left.jpg', 'back.jpg', 'right.jpg'];
    const { input } = routeRequest({ tool: '3d-model', tier: 'fast', imageUrls: urls });
    expect(input['front_image_url']).toBe('front.jpg');
    expect(input['left_image_url']).toBe('left.jpg');
    expect(input['back_image_url']).toBe('back.jpg');
    expect(input['right_image_url']).toBe('right.jpg');
  });

  it('includes default params', () => {
    const { input } = routeRequest({ tool: 'scene', imageUrl: 'http://img/1.jpg' });
    expect(input['scene_description']).toBeTruthy();
  });

  it('overrides prompt when provided', () => {
    const { input } = routeRequest({ tool: 'scene', imageUrl: 'http://img/1.jpg', prompt: 'custom scene' });
    expect(input['scene_description']).toBe('custom scene');
  });

  it('ignores prompt for tools without promptParamKey', () => {
    const { input } = routeRequest({ tool: 'bg-remove', imageUrl: 'http://img/1.jpg', prompt: 'ignored' });
    expect(input['prompt']).toBeUndefined();
    expect(input['scene_description']).toBeUndefined();
  });

  // ── New tools (Faz 1-3) ─────────────────────────

  it('routes image-edit to flux-kontext', () => {
    const { modelKey } = routeRequest({ tool: 'image-edit', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('flux-kontext');
  });

  it('routes text-to-image standard to flux-pro', () => {
    const { modelKey } = routeRequest({ tool: 'text-to-image', prompt: 'a cat' });
    expect(modelKey).toBe('flux-pro');
  });

  it('routes text-to-image fast to flux-schnell', () => {
    const { modelKey } = routeRequest({ tool: 'text-to-image', tier: 'fast', prompt: 'a cat' });
    expect(modelKey).toBe('flux-schnell');
  });

  it('routes qr-code to qr-code-ai', () => {
    const { modelKey } = routeRequest({ tool: 'qr-code', prompt: 'https://renderhane.com' });
    expect(modelKey).toBe('qr-code-ai');
  });

  it('routes talking-avatar to omnihuman', () => {
    const { modelKey } = routeRequest({ tool: 'talking-avatar', imageUrl: 'http://img/1.jpg' });
    expect(modelKey).toBe('omnihuman');
  });

  it('routes logo to recraft-v3', () => {
    const { modelKey } = routeRequest({ tool: 'logo', prompt: 'Renderhane logo' });
    expect(modelKey).toBe('recraft-v3');
  });

  // ── Text-only tools skip image input ──────────

  it('text-only tools do not set image param', () => {
    const { input } = routeRequest({ tool: 'text-to-image', prompt: 'a sunset' });
    expect(input['image_url']).toBeUndefined();
    expect(input['prompt']).toBe('a sunset');
  });

  it('logo sets prompt and style defaults', () => {
    const { input } = routeRequest({ tool: 'logo', prompt: 'Renderhane logo' });
    expect(input['prompt']).toBe('Renderhane logo');
    expect(input['style']).toBe('vector_illustration');
  });

  // ── Talking avatar special handling ────────────

  it('talking-avatar maps prompt to audio_url', () => {
    const { input } = routeRequest({
      tool: 'talking-avatar',
      imageUrl: 'http://img/face.jpg',
      prompt: 'http://audio/speech.wav',
    });
    expect(input['audio_url']).toBe('http://audio/speech.wav');
    expect(input['image_url']).toBe('http://img/face.jpg');
  });

  // ── Error case ─────────────────────────────────

  it('throws for unknown tool', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => routeRequest({ tool: 'unknown' as any, imageUrl: 'x' })).toThrow('not yet available');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const upstream = vi.fn();
function request(url = 'https://assets.renderhane.com/file', origin?: string) {
  return new NextRequest(`https://renderhane.com/api/assets/proxy?url=${encodeURIComponent(url)}`, {
    headers: origin ? { origin } : {},
  });
}

describe('asset proxy content isolation', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', upstream); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['text/html', 'application/xhtml+xml', 'text/javascript', 'application/javascript', 'text/plain'])('rejects active/unapproved content type %s', async (contentType) => {
    const cancel = vi.fn();
    upstream.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': contentType } }));
    const result = await GET(request());
    expect(result.status).toBe(415);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(cancel).toHaveBeenCalledOnce();
    expect(await result.json()).toEqual({ error: 'Unsupported asset content type' });
  });

  it.each(['image/png', 'image/jpeg', 'video/mp4', 'audio/mpeg', 'Image/PNG; charset=utf-8'])('streams inert media %s without credentials or upstream cookies', async (contentType) => {
    upstream.mockResolvedValue(new Response('media-bytes', { headers: { 'Content-Type': contentType, 'Content-Length': '11', 'Set-Cookie': 'untrusted=1' } }));
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('content-security-policy')).toContain("sandbox; default-src 'none'");
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(result.headers.get('content-disposition')).toBeNull();
    expect(result.headers.get('content-type')).toBe(contentType.split(';')[0].toLowerCase());
    expect(await result.text()).toBe('media-bytes');
    expect(upstream).toHaveBeenCalledWith('https://assets.renderhane.com/file', { headers: { Accept: '*/*' }, redirect: 'manual' });
  });

  it.each(['model/gltf-binary', 'application/octet-stream', 'application/zip', 'application/json', 'image/svg+xml'])('serves %s only with download and sandbox safeguards', async (contentType) => {
    upstream.mockResolvedValue(new Response('<svg><script>bad()</script></svg>', { headers: { 'Content-Type': contentType } }));
    const result = await GET(request('https://v3.fal.media/asset'));
    expect(result.status).toBe(200);
    expect(result.headers.get('content-disposition')).toBe('attachment; filename="asset"');
    expect(result.headers.get('content-security-policy')).not.toContain('allow-scripts');
    expect(result.headers.get('content-security-policy')).not.toContain('allow-same-origin');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['https://assets.renderhane.com.evil.example/a', 'https://evilfal.media/a', 'https://evil.example/a', 'http://assets.renderhane.com/a', 'https://user:pass@assets.renderhane.com/a', 'https://assets.renderhane.com:8443/a'])('never fetches a disallowed URL: %s', async (url) => {
    const result = await GET(request(url));
    expect([400, 403]).toContain(result.status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects redirects instead of fetching their target', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }));
    expect((await GET(request())).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('does not reflect an untrusted CORS origin', async () => {
    upstream.mockResolvedValue(new Response('ok', { headers: { 'Content-Type': 'image/png' } }));
    expect((await GET(request(undefined, 'https://evil.example'))).headers.get('access-control-allow-origin')).toBe('https://renderhane.com');
  });
});

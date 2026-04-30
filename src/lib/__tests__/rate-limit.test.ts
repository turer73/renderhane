import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock "server-only" import which throws in non-server environments
vi.mock('server-only', () => ({}));

import { rateLimit, RATE_LIMITS } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', async () => {
    const result = await rateLimit('user-1:test', { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks remaining count', async () => {
    const config = { limit: 3, windowSeconds: 60 };
    const r1 = await rateLimit('user-2:test', config);
    const r2 = await rateLimit('user-2:test', config);
    const r3 = await rateLimit('user-2:test', config);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
  });

  it('blocks after limit exceeded', async () => {
    const config = { limit: 2, windowSeconds: 60 };
    await rateLimit('user-3:test', config);
    await rateLimit('user-3:test', config);
    const r3 = await rateLimit('user-3:test', config);
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('resets after window expires', async () => {
    const config = { limit: 1, windowSeconds: 10 };
    await rateLimit('user-4:test', config);
    const blocked = await rateLimit('user-4:test', config);
    expect(blocked.success).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(11_000);

    const fresh = await rateLimit('user-4:test', config);
    expect(fresh.success).toBe(true);
    expect(fresh.remaining).toBe(0);
  });

  it('isolates different keys', async () => {
    const config = { limit: 1, windowSeconds: 60 };
    await rateLimit('user-a:test', config);
    const result = await rateLimit('user-b:test', config);
    expect(result.success).toBe(true);
  });

  it('returns resetAt timestamp', async () => {
    const now = Date.now();
    const result = await rateLimit('user-5:test', { limit: 10, windowSeconds: 60 });
    expect(result.resetAt).toBeGreaterThanOrEqual(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + 60_000 + 100);
  });
});

describe('RATE_LIMITS', () => {
  it('has all expected configs', () => {
    expect(RATE_LIMITS.jobSubmit).toEqual({ limit: 10, windowSeconds: 60 });
    expect(RATE_LIMITS.payment).toEqual({ limit: 5, windowSeconds: 60 });
    expect(RATE_LIMITS.referralInvite).toEqual({ limit: 5, windowSeconds: 300 });
    expect(RATE_LIMITS.blogComment).toEqual({ limit: 5, windowSeconds: 60 });
    expect(RATE_LIMITS.general).toEqual({ limit: 60, windowSeconds: 60 });
  });
});

import "server-only";

/**
 * Simple in-memory rate limiter for serverless environments.
 * Each Vercel instance has its own memory, so this protects against
 * burst attacks hitting the same instance. For distributed rate limiting,
 * upgrade to Upstash Redis (@upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  let entry = store.get(key);

  // Reset if window expired
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  if (entry.count > config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Pre-configured rate limiters for common endpoints.
 */
export const RATE_LIMITS = {
  /** Job submission: 10 per minute per user */
  jobSubmit: { limit: 10, windowSeconds: 60 },
  /** Payment checkout: 5 per minute per user */
  payment: { limit: 5, windowSeconds: 60 },
  /** Referral invite: 5 per 5 minutes per user */
  referralInvite: { limit: 5, windowSeconds: 300 },
  /** Blog comments: 5 per minute per user */
  blogComment: { limit: 5, windowSeconds: 60 },
  /** General API: 60 per minute per user */
  general: { limit: 60, windowSeconds: 60 },
} as const;

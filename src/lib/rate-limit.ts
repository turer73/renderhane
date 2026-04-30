import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiter with two backends:
 *
 * 1. Upstash Redis (distributed) — used when UPSTASH_REDIS_REST_URL +
 *    UPSTASH_REDIS_REST_TOKEN are set. Single source of truth across all
 *    Vercel instances → protects against distributed brute-force.
 *
 * 2. In-memory (per-instance fallback) — used when Upstash env is missing.
 *    Each Vercel instance has its own counter, so an attacker hitting
 *    different instances can bypass it.
 *
 * The function is async either way so callers don't need to know which
 * backend is active.
 */

interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

// ── Upstash backend (lazy-initialized; one Ratelimit per config shape) ──

const upstashEnabled = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

const upstashLimiters = new Map<string, Ratelimit>();
function getUpstashLimiter(config: RateLimitConfig): Ratelimit {
  const cacheKey = `${config.limit}:${config.windowSeconds}`;
  let limiter = upstashLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
      analytics: false,
      prefix: "rh:rl",
    });
    upstashLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

// ── In-memory backend (fallback) ──

interface MemoryEntry {
  count: number;
  resetAt: number;
}
const memoryStore = new Map<string, MemoryEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
}, 60_000);

function memoryRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  let entry = memoryStore.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }
  entry.count++;
  if (entry.count > config.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }
  return { success: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

// ── Public API ──

export async function rateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (upstashEnabled) {
    try {
      const result = await getUpstashLimiter(config).limit(key);
      return {
        success: result.success,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch (err) {
      // If Upstash is briefly unreachable, fall through to in-memory rather
      // than hard-failing the request. Log so we notice if it persists.
      console.error("[rate-limit] Upstash error, falling back to in-memory:", err);
      return memoryRateLimit(key, config);
    }
  }
  return memoryRateLimit(key, config);
}

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

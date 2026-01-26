/**
 * Rate Limiting
 *
 * Simple database-based rate limiting for API keys.
 * Counts recent operations within a sliding window.
 *
 * For high-volume production use, upgrade to Vercel KV (Upstash Redis)
 * for atomic INCR operations and better performance.
 */

import { db } from "./db";

// Default window is 1 minute (matches rateLimit field semantics: RPM)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Check if an API key is within its rate limit.
 *
 * Uses a simple approach: count notifications created by this API key
 * in the last minute. This effectively rate-limits send operations.
 *
 * @param apiKeyId - The API key ID to check
 * @param rateLimit - The rate limit (requests per minute)
 * @returns Rate limit result with allowed status and metadata
 */
export async function checkRateLimit(
  apiKeyId: string,
  rateLimit: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const resetAt = new Date(Date.now() + RATE_LIMIT_WINDOW_MS);

  // Count notifications created by this API key in the current window
  const count = await db.notification.count({
    where: {
      apiKeyId,
      createdAt: { gte: windowStart },
    },
  });

  const remaining = Math.max(0, rateLimit - count);
  const allowed = count < rateLimit;

  return {
    allowed,
    limit: rateLimit,
    remaining,
    resetAt,
  };
}

/**
 * Get rate limit headers for HTTP response.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  };
}

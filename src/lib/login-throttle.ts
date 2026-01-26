/**
 * Login Throttling
 *
 * IP-based rate limiting for login attempts.
 * Uses in-memory storage (resets on deploy) which is acceptable for
 * a personal notification hub. For higher security, use Vercel KV.
 *
 * Policy:
 * - After 5 failed attempts: progressive delay (1s, 2s, 4s...)
 * - After 10 failed attempts: block IP for 15 minutes
 */

interface ThrottleRecord {
  attempts: number;
  lastAttempt: number;
  blockedUntil?: number;
}

// In-memory storage (resets on serverless cold start)
// For production with persistent throttling, use Vercel KV
const throttleMap = new Map<string, ThrottleRecord>();

const MAX_ATTEMPTS_BEFORE_DELAY = 5;
const MAX_ATTEMPTS_BEFORE_BLOCK = 10;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_RESET_MS = 60 * 60 * 1000; // Reset after 1 hour of no attempts

/**
 * Get the client IP from request headers.
 * Handles Vercel's x-forwarded-for header.
 */
export function getClientIp(headers: Headers): string {
  // Vercel sets x-forwarded-for with the client IP first
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP (client), not proxy IPs
    return forwarded.split(",")[0].trim();
  }

  // Fallback for local development
  return "127.0.0.1";
}

/**
 * Check if an IP is currently throttled.
 * Returns null if not throttled, or the delay in ms to wait.
 */
export function checkThrottle(ip: string): { blocked: boolean; delayMs: number } {
  const record = throttleMap.get(ip);

  if (!record) {
    return { blocked: false, delayMs: 0 };
  }

  const now = Date.now();

  // Check if blocked
  if (record.blockedUntil && record.blockedUntil > now) {
    return { blocked: true, delayMs: record.blockedUntil - now };
  }

  // Reset if it's been a while since last attempt
  if (now - record.lastAttempt > ATTEMPT_RESET_MS) {
    throttleMap.delete(ip);
    return { blocked: false, delayMs: 0 };
  }

  // Calculate progressive delay after threshold
  if (record.attempts >= MAX_ATTEMPTS_BEFORE_DELAY) {
    const delayPower = record.attempts - MAX_ATTEMPTS_BEFORE_DELAY;
    const delayMs = Math.min(1000 * Math.pow(2, delayPower), 30000); // Cap at 30s
    return { blocked: false, delayMs };
  }

  return { blocked: false, delayMs: 0 };
}

/**
 * Record a failed login attempt.
 * Call this after each failed login.
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = throttleMap.get(ip);

  if (!record) {
    throttleMap.set(ip, { attempts: 1, lastAttempt: now });
    return;
  }

  // Reset if it's been a while
  if (now - record.lastAttempt > ATTEMPT_RESET_MS) {
    throttleMap.set(ip, { attempts: 1, lastAttempt: now });
    return;
  }

  record.attempts++;
  record.lastAttempt = now;

  // Block after max attempts
  if (record.attempts >= MAX_ATTEMPTS_BEFORE_BLOCK) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
  }
}

/**
 * Clear throttle state for an IP after successful login.
 */
export function clearThrottle(ip: string): void {
  throttleMap.delete(ip);
}

/**
 * Get remaining attempts before block.
 * Useful for warning messages.
 */
export function getRemainingAttempts(ip: string): number {
  const record = throttleMap.get(ip);
  if (!record) {
    return MAX_ATTEMPTS_BEFORE_BLOCK;
  }
  return Math.max(0, MAX_ATTEMPTS_BEFORE_BLOCK - record.attempts);
}

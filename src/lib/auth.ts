/**
 * Authentication Utilities
 *
 * Handles API key validation and session management.
 * API keys use SHA-256 hashing for secure storage.
 */

import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import type { ApiKey } from "@prisma/client";

/**
 * Hash an API key using SHA-256.
 * Used both for storing keys and for validation.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key with prefix for display.
 * Format: nhk_<32 random hex chars>
 * Returns both the plaintext key (show once) and the prefix (for display).
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  // Use cryptographically secure random bytes
  const random = randomBytes(16).toString("hex"); // 32 hex chars

  const key = `nhk_${random}`;
  const prefix = key.slice(0, 12); // "nhk_" + first 8 chars
  const hash = hashApiKey(key);

  return { key, prefix, hash };
}

/**
 * Result of API key validation.
 */
export interface AuthResult {
  success: boolean;
  apiKey?: ApiKey;
  error?: string;
}

/**
 * Validate an API key from the Authorization header.
 * Updates lastUsedAt on successful validation.
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<AuthResult> {
  if (!authHeader) {
    return { success: false, error: "Missing Authorization header" };
  }

  // Parse Bearer token
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { success: false, error: "Invalid Authorization header format" };
  }

  const key = match[1];
  if (!key.startsWith("nhk_")) {
    return { success: false, error: "Invalid API key format" };
  }

  const keyHash = hashApiKey(key);

  // Look up key by hash
  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
  });

  if (!apiKey) {
    return { success: false, error: "Invalid API key" };
  }

  // Check if key is active
  if (!apiKey.isActive) {
    return { success: false, error: "API key has been revoked" };
  }

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { success: false, error: "API key has expired" };
  }

  // Update lastUsedAt (fire and forget)
  db.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      console.error("Failed to update lastUsedAt:", err);
    });

  return { success: true, apiKey };
}

/**
 * Check if an API key has the required permission.
 */
export function hasPermission(
  apiKey: ApiKey,
  permission: "canSend" | "canRead"
): boolean {
  return apiKey[permission];
}

/**
 * Result of combined API key + session validation.
 */
export interface DualAuthResult {
  success: boolean;
  apiKey?: ApiKey;
  isSession?: boolean;
  error?: string;
}

/**
 * Validate either API key or session authentication.
 * Used for Consumer API endpoints that accept both auth methods.
 *
 * @param authHeader - Authorization header (for API key auth)
 * @param sessionAuth - Whether session is authenticated (call isAuthenticated() before)
 */
export async function validateApiKeyOrSession(
  authHeader: string | null,
  sessionAuth: boolean
): Promise<DualAuthResult> {
  // Session auth takes precedence (dashboard user)
  if (sessionAuth) {
    return { success: true, isSession: true };
  }

  // Fall back to API key auth
  if (authHeader) {
    const result = await validateApiKey(authHeader);
    if (result.success) {
      return { success: true, apiKey: result.apiKey, isSession: false };
    }
    return { success: false, error: result.error };
  }

  return { success: false, error: "Authentication required" };
}

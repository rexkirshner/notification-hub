/**
 * ntfy.sh Push Delivery
 *
 * Sends push notifications via ntfy.sh with timeout protection.
 * Uses write-first pattern: notification is saved before push attempt.
 */

import { getEnv } from "./env";

export interface NtfyPayload {
  title: string;
  message: string;
  priority?: number;
  tags?: string[];
  click?: string;
  markdown?: boolean;
}

export interface NtfyResult {
  success: boolean;
  error?: string;
  isTimeout?: boolean;
}

/**
 * Send a push notification via ntfy.sh.
 * Enforces a hard timeout to prevent slow responses from blocking requests.
 *
 * @param topic - The ntfy topic to publish to
 * @param payload - The notification content
 * @returns Result indicating success or failure
 */
export async function sendNtfyPush(
  topic: string,
  payload: NtfyPayload
): Promise<NtfyResult> {
  const env = getEnv();
  const url = `${env.NTFY_BASE_URL}/${topic}`;
  const timeoutMs = env.NTFY_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Build headers based on payload
    const headers: Record<string, string> = {
      Title: payload.title,
    };

    if (payload.priority !== undefined) {
      headers["Priority"] = String(payload.priority);
    }

    if (payload.tags && payload.tags.length > 0) {
      headers["Tags"] = payload.tags.join(",");
    }

    if (payload.click) {
      headers["Click"] = payload.click;
    }

    if (payload.markdown) {
      headers["Markdown"] = "yes";
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: payload.message,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `ntfy returned ${response.status}: ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: `ntfy request timed out after ${timeoutMs}ms`,
        isTimeout: true,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the ntfy topic for a channel.
 * Falls back to NTFY_DEFAULT_TOPIC if channel has no specific topic.
 */
export function getNtfyTopic(channelTopic: string | null): string {
  if (channelTopic) {
    return channelTopic;
  }
  return getEnv().NTFY_DEFAULT_TOPIC;
}

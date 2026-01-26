/**
 * Notification Hub TypeScript SDK
 *
 * A simple client for sending notifications to Notification Hub.
 *
 * Usage:
 *   import { NotificationHub } from './sdk';
 *
 *   const hub = new NotificationHub({
 *     baseUrl: 'https://your-hub.vercel.app',
 *     apiKey: 'nhk_xxx',
 *   });
 *
 *   await hub.send({
 *     title: 'Build Complete',
 *     message: 'Deployment successful',
 *     channel: 'prod',
 *   });
 */

export interface NotificationHubConfig {
  /** Base URL of your Notification Hub instance */
  baseUrl: string;
  /** API key with canSend permission */
  apiKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

export interface SendNotificationOptions {
  /** Notification title (required, max 200 chars) */
  title: string;
  /** Notification message (required, max 10000 chars) */
  message: string;
  /** Channel name (default: "default") */
  channel?: string;
  /** Category: "error" | "success" | "info" | "warning" */
  category?: "error" | "success" | "info" | "warning";
  /** Tags for filtering (max 10, 50 chars each) */
  tags?: string[];
  /** Priority 1-5 (1=min, 3=default, 5=urgent) */
  priority?: 1 | 2 | 3 | 4 | 5;
  /** Render message as markdown */
  markdown?: boolean;
  /** URL to open when notification is clicked */
  clickUrl?: string;
  /** Arbitrary metadata (max 10KB) */
  metadata?: Record<string, unknown>;
  /** Idempotency key (recommended for retries) */
  idempotencyKey?: string;
  /** Skip push notification (store only) */
  skipPush?: boolean;
  /** Source identifier (defaults to API key name) */
  source?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  markdown: boolean;
  source: string;
  category: string | null;
  tags: string[];
  priority: number;
  clickUrl: string | null;
  metadata: Record<string, unknown> | null;
  deliveryStatus: "PENDING" | "DELIVERED" | "FAILED" | "SKIPPED";
  deliveredAt: string | null;
  deliveryError: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  channel: {
    id: string;
    name: string;
  };
}

export interface SendResult {
  success: boolean;
  notification?: Notification;
  error?: string;
  isReplay?: boolean;
  rateLimitRemaining?: number;
}

export class NotificationHubError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "NotificationHubError";
  }
}

export class RateLimitError extends NotificationHubError {
  constructor(
    public limit: number,
    public resetAt: Date,
    public retryAfter: number
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds.`, 429);
    this.name = "RateLimitError";
  }
}

/**
 * Notification Hub client for sending notifications.
 */
export class NotificationHub {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: NotificationHubConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10000;
  }

  /**
   * Send a notification.
   *
   * @param options - Notification options
   * @returns Result with notification data or error
   * @throws {RateLimitError} When rate limit is exceeded
   * @throws {NotificationHubError} When request fails
   */
  async send(options: SendNotificationOptions): Promise<SendResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
        signal: controller.signal,
      });

      const data = await response.json();

      // Parse rate limit headers
      const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "60",
          10
        );
        const resetAt = new Date(
          parseInt(response.headers.get("X-RateLimit-Reset") || "0", 10) * 1000
        );
        throw new RateLimitError(
          data.limit,
          resetAt,
          retryAfter
        );
      }

      if (!response.ok) {
        throw new NotificationHubError(
          data.error || "Request failed",
          response.status,
          data.details
        );
      }

      return {
        success: true,
        notification: data,
        isReplay: response.headers.get("X-Idempotent-Replay") === "true",
        rateLimitRemaining: rateLimitRemaining
          ? parseInt(rateLimitRemaining, 10)
          : undefined,
      };
    } catch (error) {
      if (error instanceof NotificationHubError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new NotificationHubError("Request timed out", 0);
      }

      throw new NotificationHubError(
        error instanceof Error ? error.message : "Unknown error",
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate an idempotency key from components.
   * Useful for creating consistent keys for retries.
   *
   * @param components - Key components (e.g., ["github", "run-123", "attempt-1"])
   * @returns Idempotency key string
   */
  static idempotencyKey(...components: (string | number)[]): string {
    return components.map(String).join("-");
  }
}

// Default export for convenience
export default NotificationHub;

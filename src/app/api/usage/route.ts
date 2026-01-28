/**
 * Usage API
 *
 * GET /api/usage - Returns API documentation
 *
 * Public endpoint describing how to use the Notification Hub.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const usage = {
    name: "Notification Hub",
    version: "0.2.0",
    description: "Centralized notification system with web dashboard and mobile push via ntfy.sh",

    authentication: {
      method: "Bearer token",
      header: "Authorization: Bearer <API_KEY>",
      note: "API keys are created in the dashboard at /dashboard/settings",
    },

    sendNotification: {
      endpoint: "POST /api/notifications",
      contentType: "application/json",
      fields: {
        message: {
          type: "string",
          required: true,
          maxLength: 10000,
          description: "The notification content",
        },
        priority: {
          type: "integer",
          required: false,
          default: 3,
          enum: [1, 2, 3, 4, 5],
          description: "1-2 = silent (no push), 3 = normal, 4-5 = high priority",
        },
        category: {
          type: "string",
          required: false,
          enum: ["info", "success", "warning", "error"],
          description: "Visual categorization in dashboard",
        },
        channel: {
          type: "string",
          required: false,
          default: "default",
          enum: ["default", "prod", "dev", "personal"],
          description: "Route to different ntfy topics",
        },
        tags: {
          type: "array",
          required: false,
          maxItems: 10,
          description: "Searchable tags (e.g., ['deploy', 'backend'])",
        },
        metadata: {
          type: "object",
          required: false,
          maxSize: "10KB",
          description: "Arbitrary JSON for context (IDs, URLs, etc.)",
        },
        clickUrl: {
          type: "string",
          required: false,
          description: "URL opened when notification is clicked (http/https only)",
        },
        idempotencyKey: {
          type: "string",
          required: false,
          maxLength: 256,
          description: "Prevents duplicate notifications on retry",
        },
        skipPush: {
          type: "boolean",
          required: false,
          default: false,
          description: "Store without pushing (priority 1-2 also skip push)",
        },
        source: {
          type: "string",
          required: false,
          maxLength: 100,
          description: "Source identifier (defaults to API key name)",
        },
        markdown: {
          type: "boolean",
          required: false,
          default: false,
          description: "Render message as markdown in push notifications",
        },
      },
      notes: {
        title: "The notification title is automatically set to your API key name. This cannot be overridden.",
        source: "Defaults to API key name, can be overridden per-request",
      },
    },

    priorityLevels: {
      1: { name: "Minimum", push: false, description: "Silent, dashboard only" },
      2: { name: "Low", push: false, description: "Silent, dashboard only" },
      3: { name: "Normal", push: true, description: "Standard push notification" },
      4: { name: "High", push: true, description: "Push with high priority" },
      5: { name: "Urgent", push: true, description: "Push with maximum priority" },
    },

    otherEndpoints: {
      "GET /api/notifications": "List notifications (requires canRead)",
      "GET /api/notifications/:id": "Get single notification",
      "PATCH /api/notifications/:id/read": "Mark as read",
      "PATCH /api/notifications/read": "Bulk mark as read",
      "GET /api/notifications/unread-count": "Get unread count",
      "GET /api/notifications/stream": "SSE real-time stream",
      "GET /api/channels": "List available channels",
      "GET /api/health": "Health check",
    },

    example: {
      curl: `curl -X POST https://notifications.scratchspace.dev/api/notifications \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Build completed successfully", "priority": 3, "category": "success"}'`,
    },

    dashboard: "https://notifications.scratchspace.dev/dashboard",
  };

  return NextResponse.json(usage, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}

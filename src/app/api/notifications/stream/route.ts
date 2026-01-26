/**
 * Notification Stream Endpoint (SSE)
 *
 * GET /api/notifications/stream - Real-time notification stream
 *
 * Server-Sent Events endpoint for real-time notifications.
 * Polls database for new notifications and emits them as events.
 *
 * Query parameters:
 * - channel: Filter to specific channel
 * - minPriority: Only stream notifications >= this priority
 *
 * Headers:
 * - Last-Event-ID: Resume from this event ID on reconnect
 *
 * Events:
 * - notification: New notification created
 * - heartbeat: Keepalive every 15s
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKeyOrSession, hasPermission } from "@/lib/auth";
import { isAuthenticated } from "@/lib/session";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// Use Node.js runtime for Prisma compatibility
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

const POLL_INTERVAL_MS = 1500; // Poll every 1.5 seconds
const HEARTBEAT_INTERVAL_MS = 15_000; // Heartbeat every 15 seconds
const STREAM_DURATION_MS = 290_000; // Close before maxDuration (leave buffer)

const streamParamsSchema = z.object({
  channel: z.string().optional(),
  minPriority: z.coerce.number().int().min(1).max(5).optional(),
});

/**
 * Parse SSE event ID format: {ISO-timestamp}_{cuid}
 * Returns the cursor components for resume query.
 */
function parseEventId(
  eventId: string | null
): { timestamp: Date; id: string } | null {
  if (!eventId) return null;

  const underscoreIndex = eventId.lastIndexOf("_");
  if (underscoreIndex === -1) return null;

  const timestampStr = eventId.slice(0, underscoreIndex);
  const id = eventId.slice(underscoreIndex + 1);

  const timestamp = new Date(timestampStr);
  if (isNaN(timestamp.getTime())) return null;

  return { timestamp, id };
}

/**
 * Format SSE event ID: {ISO-timestamp}_{cuid}
 */
function formatEventId(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}_${id}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  // Validate session or API key
  const sessionAuth = await isAuthenticated();
  const authResult = await validateApiKeyOrSession(
    request.headers.get("Authorization"),
    sessionAuth
  );

  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  // Check canRead permission (session auth has implicit read access)
  if (!authResult.isSession && authResult.apiKey && !hasPermission(authResult.apiKey, "canRead")) {
    return NextResponse.json(
      { error: "API key does not have read permission" },
      { status: 403 }
    );
  }

  // Parse query parameters
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const parseResult = streamParamsSchema.safeParse(searchParams);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const params = parseResult.data;

  // Look up channel if specified
  let channelId: string | undefined;
  if (params.channel) {
    const channel = await db.channel.findUnique({
      where: { name: params.channel },
    });
    if (!channel) {
      return NextResponse.json(
        { error: `Channel '${params.channel}' does not exist` },
        { status: 400 }
      );
    }
    channelId = channel.id;
  }

  // Parse Last-Event-ID for resume
  const lastEventId = request.headers.get("Last-Event-ID");
  const cursor = parseEventId(lastEventId);

  const encoder = new TextEncoder();
  const startTime = Date.now();

  // Track last seen notification for polling
  let lastSeenTimestamp = cursor?.timestamp || new Date();
  let lastSeenId = cursor?.id || "";
  let isPolling = false; // Prevent concurrent polls

  const stream = new ReadableStream({
    async start(controller) {
      // Immediately send connection acknowledgment
      controller.enqueue(encoder.encode(": connected\n\n"));

      // If resuming, fetch any missed notifications
      if (cursor) {
        const missedNotifications = await fetchNewNotifications(
          lastSeenTimestamp,
          lastSeenId,
          channelId,
          params.minPriority
        );

        for (const notification of missedNotifications) {
          const eventId = formatEventId(notification.createdAt, notification.id);
          const data = JSON.stringify(notification);
          controller.enqueue(
            encoder.encode(
              `id: ${eventId}\nevent: notification\ndata: ${data}\n\n`
            )
          );
          lastSeenTimestamp = notification.createdAt;
          lastSeenId = notification.id;
        }
      }

      // Heartbeat interval
      const heartbeatInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        controller.enqueue(
          encoder.encode(`event: heartbeat\ndata: ${elapsed}\n\n`)
        );
      }, HEARTBEAT_INTERVAL_MS);

      // Poll interval - skip if previous poll still running
      const pollInterval = setInterval(async () => {
        if (isPolling) return; // Prevent concurrent polls
        isPolling = true;

        try {
          const notifications = await fetchNewNotifications(
            lastSeenTimestamp,
            lastSeenId,
            channelId,
            params.minPriority
          );

          for (const notification of notifications) {
            const eventId = formatEventId(
              notification.createdAt,
              notification.id
            );
            const data = JSON.stringify(notification);
            controller.enqueue(
              encoder.encode(
                `id: ${eventId}\nevent: notification\ndata: ${data}\n\n`
              )
            );
            lastSeenTimestamp = notification.createdAt;
            lastSeenId = notification.id;
          }
        } catch (error) {
          console.error("Stream poll error:", error);
        } finally {
          isPolling = false;
        }
      }, POLL_INTERVAL_MS);

      // Close stream after duration
      const closeTimeout = setTimeout(() => {
        clearInterval(heartbeatInterval);
        clearInterval(pollInterval);
        controller.enqueue(
          encoder.encode("event: close\ndata: stream_timeout\n\n")
        );
        controller.close();
      }, STREAM_DURATION_MS);

      // Clean up on abort
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        clearInterval(pollInterval);
        clearTimeout(closeTimeout);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Fetch notifications created after the cursor position.
 * Uses compound cursor (timestamp, id) for deterministic ordering.
 */
async function fetchNewNotifications(
  afterTimestamp: Date,
  afterId: string,
  channelId?: string,
  minPriority?: number
): Promise<
  Array<{
    id: string;
    title: string;
    message: string;
    createdAt: Date;
    channel: { id: string; name: string };
    [key: string]: unknown;
  }>
> {
  const where: Prisma.NotificationWhereInput = {
    OR: [
      { createdAt: { gt: afterTimestamp } },
      {
        createdAt: afterTimestamp,
        id: { gt: afterId },
      },
    ],
  };

  if (channelId) {
    where.channelId = channelId;
  }

  if (minPriority) {
    where.priority = { gte: minPriority };
  }

  return db.notification.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100, // Limit batch size
    include: { channel: true },
  });
}

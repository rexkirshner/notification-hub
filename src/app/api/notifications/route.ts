/**
 * Notifications API
 *
 * POST /api/notifications - Create a notification (requires canSend)
 * GET /api/notifications - List notifications (requires canRead)
 *
 * Implements write-first delivery pattern: notification is saved before push.
 * Supports idempotency via idempotencyKey parameter.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { validateApiKey, validateApiKeyOrSession, hasPermission } from "@/lib/auth";
import { isAuthenticated } from "@/lib/session";
import {
  createNotificationSchema,
  listNotificationsSchema,
} from "@/lib/validators/notification";
import { sendNtfyPush, getNtfyTopic } from "@/lib/ntfy";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { DeliveryStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Type for notification with channel included
type NotificationWithChannel = Prisma.NotificationGetPayload<{
  include: { channel: true };
}>;

/**
 * POST /api/notifications
 * Create a new notification.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate API key
  const authResult = await validateApiKey(
    request.headers.get("Authorization")
  );

  if (!authResult.success || !authResult.apiKey) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  // Check canSend permission
  if (!hasPermission(authResult.apiKey, "canSend")) {
    return NextResponse.json(
      { error: "API key does not have send permission" },
      { status: 403 }
    );
  }

  // Check rate limit
  const rateLimitResult = await checkRateLimit(
    authResult.apiKey.id,
    authResult.apiKey.rateLimit
  );

  if (!rateLimitResult.allowed) {
    const response = NextResponse.json(
      {
        error: "Rate limit exceeded",
        limit: rateLimitResult.limit,
        resetAt: rateLimitResult.resetAt.toISOString(),
      },
      { status: 429 }
    );

    // Add rate limit headers
    const headers = getRateLimitHeaders(rateLimitResult);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    response.headers.set(
      "Retry-After",
      String(Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000))
    );

    return response;
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parseResult = createNotificationSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const input = parseResult.data;

  // Look up channel by name
  const channel = await db.channel.findUnique({
    where: { name: input.channel },
  });

  if (!channel) {
    return NextResponse.json(
      { error: `Channel '${input.channel}' does not exist` },
      { status: 400 }
    );
  }

  let notification: NotificationWithChannel;
  let isReplay = false;

  // Handle idempotency if key is provided
  if (input.idempotencyKey) {
    const result = await createNotificationWithIdempotency(
      authResult.apiKey.id,
      input.idempotencyKey,
      {
        title: input.title,
        message: input.message,
        markdown: input.markdown,
        source: input.source || authResult.apiKey.name,
        channel: { connect: { id: channel.id } },
        category: input.category,
        tags: input.tags,
        priority: input.priority,
        clickUrl: input.clickUrl,
        metadata: input.metadata as Prisma.InputJsonValue,
        deliveryStatus: input.skipPush
          ? DeliveryStatus.SKIPPED
          : DeliveryStatus.PENDING,
        apiKey: { connect: { id: authResult.apiKey.id } },
      }
    );

    notification = result.notification;
    isReplay = result.isReplay;

    // If this is a replay, return the existing notification immediately
    if (isReplay) {
      const response = NextResponse.json(notification, { status: 200 });
      response.headers.set("X-Idempotent-Replay", "true");
      // Add rate limit headers (replay doesn't count against limit)
      const headers = getRateLimitHeaders(rateLimitResult);
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
      return response;
    }
  } else {
    // No idempotency key - create notification directly
    notification = await db.notification.create({
      data: {
        title: input.title,
        message: input.message,
        markdown: input.markdown,
        source: input.source || authResult.apiKey.name,
        channelId: channel.id,
        category: input.category,
        tags: input.tags,
        priority: input.priority,
        clickUrl: input.clickUrl,
        metadata: input.metadata as Prisma.InputJsonValue,
        deliveryStatus: input.skipPush
          ? DeliveryStatus.SKIPPED
          : DeliveryStatus.PENDING,
        apiKeyId: authResult.apiKey.id,
      },
      include: {
        channel: true,
      },
    });
  }

  // If skipPush, return immediately
  if (input.skipPush) {
    const response = NextResponse.json(notification, { status: 201 });
    // Add rate limit headers
    const headers = getRateLimitHeaders(rateLimitResult);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // Attempt ntfy push
  const topic = getNtfyTopic(channel.ntfyTopic);
  const pushResult = await sendNtfyPush(topic, {
    title: input.title,
    message: input.message,
    priority: input.priority,
    tags: input.tags.length > 0 ? input.tags : undefined,
    click: input.clickUrl,
    markdown: input.markdown,
  });

  // Update delivery status based on result
  const updatedNotification = await db.notification.update({
    where: { id: notification.id },
    data: {
      deliveryStatus: pushResult.success
        ? DeliveryStatus.DELIVERED
        : DeliveryStatus.FAILED,
      deliveredAt: pushResult.success ? new Date() : null,
      deliveryError: pushResult.error,
    },
    include: {
      channel: true,
    },
  });

  // Log timeout vs other failures separately for monitoring
  if (!pushResult.success) {
    const logMessage = pushResult.isTimeout
      ? `ntfy push timed out for notification ${notification.id}`
      : `ntfy push failed for notification ${notification.id}: ${pushResult.error}`;
    console.error(logMessage);
  }

  const response = NextResponse.json(updatedNotification, { status: 201 });
  // Add rate limit headers
  const headers = getRateLimitHeaders(rateLimitResult);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Create a notification with idempotency protection.
 * Uses a transaction to ensure exactly-once semantics.
 */
async function createNotificationWithIdempotency(
  apiKeyId: string,
  idempotencyKey: string,
  data: Prisma.NotificationCreateInput
): Promise<{ notification: NotificationWithChannel; isReplay: boolean }> {
  const env = getEnv();
  const ttlHours = env.IDEMPOTENCY_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  try {
    return await db.$transaction(async (tx) => {
      // Check for existing record
      const existing = await tx.idempotencyRecord.findUnique({
        where: {
          apiKeyId_idempotencyKey: {
            apiKeyId,
            idempotencyKey,
          },
        },
        include: {
          notification: {
            include: {
              channel: true,
            },
          },
        },
      });

      if (existing) {
        // Check if expired
        if (existing.expiresAt >= new Date()) {
          // Return existing notification
          return { notification: existing.notification, isReplay: true };
        }

        // Delete expired record
        await tx.idempotencyRecord.delete({
          where: { id: existing.id },
        });
      }

      // Create new notification
      const notification = await tx.notification.create({
        data,
        include: {
          channel: true,
        },
      });

      // Create idempotency record
      await tx.idempotencyRecord.create({
        data: {
          apiKeyId,
          idempotencyKey,
          notificationId: notification.id,
          expiresAt,
        },
      });

      return { notification, isReplay: false };
    });
  } catch (error) {
    // Handle unique constraint violation (race condition)
    // Prisma error code P2002 = Unique constraint failed
    const isPrismaUniqueError =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002";

    if (isPrismaUniqueError) {
      // Another request won the race - fetch and return existing
      const existing = await db.idempotencyRecord.findUnique({
        where: {
          apiKeyId_idempotencyKey: {
            apiKeyId,
            idempotencyKey,
          },
        },
        include: {
          notification: {
            include: {
              channel: true,
            },
          },
        },
      });

      if (existing) {
        return { notification: existing.notification, isReplay: true };
      }
    }

    throw error;
  }
}

/**
 * GET /api/notifications
 * List notifications with filters and pagination.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
  const parseResult = listNotificationsSchema.safeParse(searchParams);

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

  // Build where clause
  const where: Prisma.NotificationWhereInput = {};

  if (params.channel) {
    // Look up channel by name to validate it exists
    const channel = await db.channel.findUnique({
      where: { name: params.channel },
    });
    if (!channel) {
      return NextResponse.json(
        { error: `Channel '${params.channel}' does not exist` },
        { status: 400 }
      );
    }
    where.channelId = channel.id;
  }

  if (params.source) {
    where.source = params.source;
  }

  if (params.category) {
    where.category = params.category;
  }

  if (params.tags && params.tags.length > 0) {
    // Filter notifications containing ALL specified tags
    where.tags = { hasEvery: params.tags };
  }

  if (params.deliveryStatus) {
    where.deliveryStatus = params.deliveryStatus as DeliveryStatus;
  }

  if (params.minPriority) {
    where.priority = { gte: params.minPriority };
  }

  if (params.unreadOnly) {
    where.readAt = null;
  }

  if (params.since) {
    where.createdAt = { gt: params.since };
  }

  // Calculate pagination
  const skip = (params.page - 1) * params.limit;

  // Build orderBy
  const orderBy: Prisma.NotificationOrderByWithRelationInput = {
    [params.sort]: params.order,
  };

  // Execute queries
  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy,
      skip,
      take: params.limit,
      include: {
        channel: true,
      },
    }),
    db.notification.count({ where }),
  ]);

  return NextResponse.json({
    data: notifications,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  });
}

/**
 * Notifications API
 *
 * POST /api/notifications - Create a notification (requires canSend)
 * GET /api/notifications - List notifications (requires canRead)
 *
 * Implements write-first delivery pattern: notification is saved before push.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKey, hasPermission } from "@/lib/auth";
import {
  createNotificationSchema,
  listNotificationsSchema,
} from "@/lib/validators/notification";
import { sendNtfyPush, getNtfyTopic } from "@/lib/ntfy";
import { DeliveryStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

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

  // Create notification with PENDING status (write-first pattern)
  const notification = await db.notification.create({
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
      deliveryStatus: input.skipPush ? DeliveryStatus.SKIPPED : DeliveryStatus.PENDING,
      apiKeyId: authResult.apiKey.id,
    },
    include: {
      channel: true,
    },
  });

  // If skipPush, return immediately
  if (input.skipPush) {
    return NextResponse.json(notification, { status: 201 });
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

  return NextResponse.json(updatedNotification, { status: 201 });
}

/**
 * GET /api/notifications
 * List notifications with filters and pagination.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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

  // Check canRead permission
  if (!hasPermission(authResult.apiKey, "canRead")) {
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

  if (params.unreadOnly) {
    where.readAt = null;
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

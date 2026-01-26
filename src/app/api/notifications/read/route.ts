/**
 * Bulk Mark Read Endpoint
 *
 * PATCH /api/notifications/read - Mark multiple notifications as read
 *
 * Supports three modes:
 * - By IDs: { ids: ["id1", "id2"] }
 * - By timestamp: { before: "2024-01-15T12:00:00Z" }
 * - By channel: { channel: "prod" }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKey, hasPermission } from "@/lib/auth";
import { bulkMarkReadSchema } from "@/lib/validators/notification";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parseResult = bulkMarkReadSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const params = parseResult.data;

  // Build where clause
  const where: Prisma.NotificationWhereInput = {
    readAt: null, // Only update unread notifications
  };

  if (params.ids) {
    where.id = { in: params.ids };
  }

  if (params.before) {
    where.createdAt = { lte: params.before };
  }

  if (params.channel) {
    // Look up channel by name
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

  // Update notifications
  const result = await db.notification.updateMany({
    where,
    data: {
      readAt: new Date(),
    },
  });

  return NextResponse.json({
    updated: result.count,
  });
}

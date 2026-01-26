/**
 * Unread Count Endpoint
 *
 * GET /api/notifications/unread-count - Get count of unread notifications
 *
 * Lightweight endpoint for polling/badge display.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKey, hasPermission } from "@/lib/auth";
import { unreadCountSchema } from "@/lib/validators/notification";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

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
  const parseResult = unreadCountSchema.safeParse(searchParams);

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
  const where: Prisma.NotificationWhereInput = {
    readAt: null,
  };

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

  // Count unread notifications
  const count = await db.notification.count({ where });

  return NextResponse.json({ count });
}

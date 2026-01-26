/**
 * Mark Single Notification Read Endpoint
 *
 * PATCH /api/notifications/:id/read - Mark a notification as read
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKey, hasPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

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

  // Fetch notification with channel included
  const existing = await db.notification.findUnique({
    where: { id },
    include: { channel: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 }
    );
  }

  // If already read, return as-is
  if (existing.readAt) {
    return NextResponse.json(existing);
  }

  // Mark as read
  const notification = await db.notification.update({
    where: { id },
    data: { readAt: new Date() },
    include: { channel: true },
  });

  return NextResponse.json(notification);
}

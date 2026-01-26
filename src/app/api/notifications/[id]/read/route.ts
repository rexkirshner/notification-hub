/**
 * Mark Single Notification Read Endpoint
 *
 * PATCH /api/notifications/:id/read - Mark a notification as read
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKeyOrSession, hasPermission } from "@/lib/auth";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

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

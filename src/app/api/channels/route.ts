/**
 * Channels Endpoint
 *
 * GET /api/channels - List all channels
 *
 * Requires canRead permission or session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKeyOrSession, hasPermission } from "@/lib/auth";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

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

  // Fetch all channels
  const channels = await db.channel.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: channels });
}

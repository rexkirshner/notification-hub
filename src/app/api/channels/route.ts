/**
 * Channels Endpoint
 *
 * GET /api/channels - List all channels
 *
 * Requires canRead permission or session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateApiKey, hasPermission } from "@/lib/auth";

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

  // Fetch all channels
  const channels = await db.channel.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: channels });
}

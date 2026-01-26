/**
 * Logout Endpoint
 *
 * POST /api/auth/logout - End the current session
 */

import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout failed:", error);
    // Still return success - user intent is to log out, and failing
    // to destroy a session is not critical from user's perspective
    return NextResponse.json({ success: true });
  }
}

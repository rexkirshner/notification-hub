/**
 * Logout Endpoint
 *
 * POST /api/auth/logout - End the current session
 */

import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  await destroySession();
  return NextResponse.json({ success: true });
}

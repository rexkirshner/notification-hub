/**
 * Session Status Endpoint
 *
 * GET /api/auth/session - Check if user is authenticated
 */

import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const authenticated = await isAuthenticated();
  return NextResponse.json({ authenticated });
}

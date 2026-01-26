/**
 * Cleanup Cron Endpoint
 *
 * GET /api/cron/cleanup - Delete expired idempotency records
 *
 * Runs daily via Vercel cron. Must be idempotent (safe to rerun).
 * Protected by CRON_SECRET to prevent unauthorized access.
 *
 * Note: Correctness doesn't depend on this cron running - expired records
 * are handled inline in the idempotency transaction. This is for cleanup only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for cleanup

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron authorization
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without secret for testing
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron not configured" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startTime = Date.now();

  try {
    // Delete all expired idempotency records
    // The expiresAt index ensures this query is efficient
    const result = await db.idempotencyRecord.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    const duration = Date.now() - startTime;

    console.log(
      `Cleanup completed: deleted ${result.count} expired idempotency records in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      deleted: result.count,
      durationMs: duration,
    });
  } catch (error) {
    console.error("Cleanup cron error:", error);
    return NextResponse.json(
      {
        error: "Cleanup failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

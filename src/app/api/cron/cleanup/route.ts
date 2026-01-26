/**
 * Cleanup Cron Endpoint
 *
 * GET /api/cron/cleanup - Delete expired records
 *
 * Runs daily via Vercel cron. Must be idempotent (safe to rerun).
 * Protected by CRON_SECRET to prevent unauthorized access.
 *
 * Cleans up:
 * - Expired idempotency records (correctness handled inline, this is cleanup)
 * - Old notifications past retention period (default 30 days)
 * - Old audit events past retention period (default 90 days)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for cleanup

// Audit events kept longer than notifications (for compliance/debugging)
const AUDIT_RETENTION_DAYS = 90;

interface CleanupResult {
  idempotencyRecords: number;
  notifications: number;
  auditEvents: number;
}

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
  const env = getEnv();

  try {
    const result: CleanupResult = {
      idempotencyRecords: 0,
      notifications: 0,
      auditEvents: 0,
    };

    // 1. Delete expired idempotency records
    const idempotencyResult = await db.idempotencyRecord.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    result.idempotencyRecords = idempotencyResult.count;

    // 2. Delete old notifications past retention period
    const notificationCutoff = new Date();
    notificationCutoff.setDate(
      notificationCutoff.getDate() - env.RETENTION_DAYS
    );

    const notificationResult = await db.notification.deleteMany({
      where: {
        createdAt: { lt: notificationCutoff },
      },
    });
    result.notifications = notificationResult.count;

    // 3. Delete old audit events past retention period
    const auditCutoff = new Date();
    auditCutoff.setDate(auditCutoff.getDate() - AUDIT_RETENTION_DAYS);

    const auditResult = await db.auditEvent.deleteMany({
      where: {
        createdAt: { lt: auditCutoff },
      },
    });
    result.auditEvents = auditResult.count;

    const duration = Date.now() - startTime;

    console.log(
      `Cleanup completed in ${duration}ms: ` +
        `${result.idempotencyRecords} idempotency records, ` +
        `${result.notifications} notifications (>${env.RETENTION_DAYS}d), ` +
        `${result.auditEvents} audit events (>${AUDIT_RETENTION_DAYS}d)`
    );

    return NextResponse.json({
      success: true,
      deleted: result,
      retentionDays: {
        notifications: env.RETENTION_DAYS,
        auditEvents: AUDIT_RETENTION_DAYS,
      },
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

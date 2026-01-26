/**
 * Retry Delivery Cron Endpoint
 *
 * GET /api/cron/retry - Retry failed notification deliveries
 *
 * Runs every 15 minutes via Vercel cron. Must be idempotent (safe to rerun).
 * Protected by CRON_SECRET to prevent unauthorized access.
 *
 * Retries:
 * - Notifications with deliveryStatus = FAILED
 * - Up to RETRY_MAX_ATTEMPTS (default 5) times
 * - With exponential backoff (1min, 2min, 4min, 8min, 16min)
 * - Stops after 24 hours from creation
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendNtfyPush, getNtfyTopic } from "@/lib/ntfy";
import { DeliveryStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for retries

// Don't retry notifications older than 24 hours
const MAX_RETRY_AGE_MS = 24 * 60 * 60 * 1000;

// Batch size for retries per cron run
const RETRY_BATCH_SIZE = 20;

interface RetryResult {
  attempted: number;
  succeeded: number;
  failed: number;
  gaveUp: number; // Exceeded max attempts or too old
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
  const maxAttempts = env.RETRY_MAX_ATTEMPTS;

  const result: RetryResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    gaveUp: 0,
  };

  try {
    // Find failed notifications that are eligible for retry
    const cutoffTime = new Date(Date.now() - MAX_RETRY_AGE_MS);

    const failedNotifications = await db.notification.findMany({
      where: {
        deliveryStatus: DeliveryStatus.FAILED,
        retryCount: { lt: maxAttempts },
        createdAt: { gt: cutoffTime }, // Not too old
      },
      include: {
        channel: true,
      },
      orderBy: { createdAt: "asc" }, // Oldest first
      take: RETRY_BATCH_SIZE,
    });

    // Also mark old/exhausted notifications as permanently failed
    const gaveUpResult = await db.notification.updateMany({
      where: {
        deliveryStatus: DeliveryStatus.FAILED,
        OR: [
          { retryCount: { gte: maxAttempts } },
          { createdAt: { lt: cutoffTime } },
        ],
      },
      data: {
        deliveryError: "Max retry attempts exceeded or notification too old",
      },
    });
    result.gaveUp = gaveUpResult.count;

    // Process retries
    for (const notification of failedNotifications) {
      result.attempted++;

      // Calculate backoff: check if enough time has passed
      // Backoff: 1min, 2min, 4min, 8min, 16min...
      const backoffMs = Math.pow(2, notification.retryCount) * 60 * 1000;
      const updatedAt = notification.updatedAt.getTime();
      const now = Date.now();

      if (now - updatedAt < backoffMs) {
        // Not enough time has passed, skip this one
        result.attempted--;
        continue;
      }

      // Attempt retry
      const topic = getNtfyTopic(notification.channel.ntfyTopic);
      const pushResult = await sendNtfyPush(topic, {
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        tags: notification.tags.length > 0 ? notification.tags : undefined,
        click: notification.clickUrl ?? undefined,
        markdown: notification.markdown,
      });

      if (pushResult.success) {
        // Success! Update status
        await db.notification.update({
          where: { id: notification.id },
          data: {
            deliveryStatus: DeliveryStatus.DELIVERED,
            deliveredAt: new Date(),
            deliveryError: null,
            retryCount: notification.retryCount + 1,
          },
        });
        result.succeeded++;
        console.log(
          `Retry succeeded for notification ${notification.id} (attempt ${notification.retryCount + 1})`
        );
      } else {
        // Still failing, increment retry count
        await db.notification.update({
          where: { id: notification.id },
          data: {
            retryCount: notification.retryCount + 1,
            deliveryError: pushResult.error ?? "Unknown error",
          },
        });
        result.failed++;
        console.log(
          `Retry failed for notification ${notification.id} (attempt ${notification.retryCount + 1}): ${pushResult.error}`
        );
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `Retry cron completed in ${duration}ms: ` +
        `${result.attempted} attempted, ${result.succeeded} succeeded, ` +
        `${result.failed} failed, ${result.gaveUp} gave up`
    );

    return NextResponse.json({
      success: true,
      result,
      maxAttempts,
      durationMs: duration,
    });
  } catch (error) {
    console.error("Retry cron error:", error);
    return NextResponse.json(
      {
        error: "Retry cron failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

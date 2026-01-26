/**
 * Login Endpoint
 *
 * POST /api/auth/login - Authenticate with admin password
 *
 * Implements:
 * - Password verification with bcrypt
 * - IP-based login throttling
 * - Audit logging for success/failure
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { createSession } from "@/lib/session";
import {
  getClientIp,
  checkThrottle,
  recordFailedAttempt,
  clearThrottle,
  getRemainingAttempts,
} from "@/lib/login-throttle";
import { db } from "@/lib/db";
import { AuditAction, ActorType } from "@prisma/client";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request.headers);

  // Check throttle before processing
  const throttle = checkThrottle(clientIp);
  if (throttle.blocked) {
    const retryAfter = Math.ceil(throttle.delayMs / 1000);
    return NextResponse.json(
      {
        error: "Too many failed attempts. Please try again later.",
        retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  // Apply progressive delay if needed
  if (throttle.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, throttle.delayMs));
  }

  // Validate environment
  const env = getEnv();
  if (!env.ADMIN_PASSWORD_HASH) {
    console.error("ADMIN_PASSWORD_HASH not configured");
    return NextResponse.json(
      { error: "Authentication not configured" },
      { status: 500 }
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parseResult = loginSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { password } = parseResult.data;

  // Verify password
  const isValid = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);

  if (!isValid) {
    // Record failed attempt
    recordFailedAttempt(clientIp);
    const remaining = getRemainingAttempts(clientIp);

    // Log failed login to audit
    await db.auditEvent
      .create({
        data: {
          action: AuditAction.DASHBOARD_LOGIN_FAILED,
          actorType: ActorType.ADMIN,
          actorIp: clientIp,
          metadata: {
            userAgent: request.headers.get("user-agent"),
            remainingAttempts: remaining,
          },
        },
      })
      .catch((err) => {
        console.error("Failed to log failed login:", err);
      });

    return NextResponse.json(
      {
        error: "Invalid password",
        remainingAttempts: remaining > 0 ? remaining : undefined,
      },
      { status: 401 }
    );
  }

  // Success - create session and clear throttle
  await createSession();
  clearThrottle(clientIp);

  // Log successful login to audit
  await db.auditEvent
    .create({
      data: {
        action: AuditAction.DASHBOARD_LOGIN,
        actorType: ActorType.ADMIN,
        actorIp: clientIp,
        metadata: {
          userAgent: request.headers.get("user-agent"),
        },
      },
    })
    .catch((err) => {
      console.error("Failed to log successful login:", err);
    });

  return NextResponse.json({ success: true });
}

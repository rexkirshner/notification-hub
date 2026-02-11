/**
 * Single API Key Endpoint
 *
 * GET /api/keys/:id - Get key details (session only)
 * DELETE /api/keys/:id - Revoke a key (session only)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthenticated } from "@/lib/session";
import { validateApiKeyOrSession, hasPermission } from "@/lib/auth";
import { AuditAction, ActorType } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/keys/:id
 * Get a single API key's details.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

  const sessionAuth = await isAuthenticated();
  const authHeader = request.headers.get("authorization");
  const auth = await validateApiKeyOrSession(authHeader, sessionAuth);

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (!auth.isSession && !hasPermission(auth.apiKey!, "canManageKeys")) {
    return NextResponse.json({ error: "Forbidden: canManageKeys permission required" }, { status: 403 });
  }

  const key = await db.apiKey.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      prefix: true,
      description: true,
      canSend: true,
      canRead: true,
      canManageKeys: true,
      rateLimit: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { notifications: true },
      },
    },
  });

  if (!key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return NextResponse.json(key);
}

/**
 * DELETE /api/keys/:id
 * Revoke an API key (soft delete - sets isActive to false).
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

  const sessionAuth = await isAuthenticated();
  const authHeader = request.headers.get("authorization");
  const auth = await validateApiKeyOrSession(authHeader, sessionAuth);

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (!auth.isSession && !hasPermission(auth.apiKey!, "canManageKeys")) {
    return NextResponse.json({ error: "Forbidden: canManageKeys permission required" }, { status: 403 });
  }

  // Check if key exists
  const existing = await db.apiKey.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  if (!existing.isActive) {
    return NextResponse.json(
      { error: "API key is already revoked" },
      { status: 400 }
    );
  }

  // Revoke the key (soft delete)
  await db.apiKey.update({
    where: { id },
    data: { isActive: false },
  });

  // Log to audit
  await db.auditEvent
    .create({
      data: {
        action: AuditAction.API_KEY_REVOKED,
        actorType: auth.isSession ? ActorType.ADMIN : ActorType.API_KEY,
        actorId: auth.isSession ? null : auth.apiKey!.id,
        targetType: "api_key",
        targetId: id,
        metadata: {
          keyName: existing.name,
        },
      },
    })
    .catch((err) => {
      console.error("Failed to log key revocation:", err);
    });

  return NextResponse.json({ success: true });
}

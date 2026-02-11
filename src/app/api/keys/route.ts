/**
 * API Keys Management Endpoints
 *
 * GET /api/keys - List all API keys (session or canManageKeys)
 * POST /api/keys - Create a new API key (session or canManageKeys)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthenticated } from "@/lib/session";
import { generateApiKey, validateApiKeyOrSession, hasPermission } from "@/lib/auth";
import { z } from "zod";
import { AuditAction, ActorType } from "@prisma/client";

export const dynamic = "force-dynamic";

const createKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  canSend: z.boolean().default(true),
  canRead: z.boolean().default(false),
  canManageKeys: z.boolean().default(false),
  rateLimit: z.number().int().min(1).max(10000).default(100),
  expiresAt: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const date = new Date(val);
        return !isNaN(date.getTime()) && date > new Date();
      },
      { message: "expiresAt must be a valid future date" }
    )
    .transform((val) => (val ? new Date(val) : undefined)),
});

/**
 * GET /api/keys
 * List all API keys (prefix only, not the full key).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionAuth = await isAuthenticated();
  const authHeader = request.headers.get("Authorization");
  const auth = await validateApiKeyOrSession(authHeader, sessionAuth);

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (!auth.isSession && auth.apiKey && !hasPermission(auth.apiKey, "canManageKeys")) {
    return NextResponse.json(
      { error: "API key does not have manage keys permission" },
      { status: 403 }
    );
  }

  const keys = await db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
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
    },
  });

  return NextResponse.json({ data: keys });
}

/**
 * POST /api/keys
 * Create a new API key.
 * Returns the full key ONCE - it cannot be retrieved later.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sessionAuth = await isAuthenticated();
  const authHeader = request.headers.get("Authorization");
  const auth = await validateApiKeyOrSession(authHeader, sessionAuth);

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (!auth.isSession && auth.apiKey && !hasPermission(auth.apiKey, "canManageKeys")) {
    return NextResponse.json(
      { error: "API key does not have manage keys permission" },
      { status: 403 }
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

  const parseResult = createKeySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const input = parseResult.data;

  // Generate the API key
  const { key, prefix, hash } = generateApiKey();

  // Create the key in database
  const apiKey = await db.apiKey.create({
    data: {
      name: input.name,
      keyHash: hash,
      prefix,
      description: input.description,
      canSend: input.canSend,
      canRead: input.canRead,
      canManageKeys: input.canManageKeys,
      rateLimit: input.rateLimit,
      expiresAt: input.expiresAt,
    },
  });

  // Log to audit
  await db.auditEvent
    .create({
      data: {
        action: AuditAction.API_KEY_CREATED,
        actorType: auth.isSession ? ActorType.ADMIN : ActorType.API_KEY,
        actorId: auth.apiKey?.id ?? null,
        targetType: "api_key",
        targetId: apiKey.id,
        metadata: {
          keyName: apiKey.name,
          canSend: apiKey.canSend,
          canRead: apiKey.canRead,
          canManageKeys: apiKey.canManageKeys,
        },
      },
    })
    .catch((err) => {
      console.error("Failed to log key creation:", err);
    });

  // Return the full key (only time it's ever shown)
  return NextResponse.json(
    {
      id: apiKey.id,
      name: apiKey.name,
      key, // The full key - show once!
      prefix: apiKey.prefix,
      canSend: apiKey.canSend,
      canRead: apiKey.canRead,
      canManageKeys: apiKey.canManageKeys,
      rateLimit: apiKey.rateLimit,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    },
    { status: 201 }
  );
}

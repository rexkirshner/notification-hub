/**
 * Health Check Endpoint
 *
 * GET /api/health
 *
 * Returns the health status of the application and database connection.
 * Public endpoint - no authentication required.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// App version - update this when releasing new versions
const APP_VERSION = "0.1.0";

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  checks: {
    database: "connected" | "disconnected";
  };
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const timestamp = new Date().toISOString();

  // Check database connectivity
  let databaseStatus: "connected" | "disconnected" = "disconnected";
  try {
    // Simple query to verify connection
    await db.$queryRaw`SELECT 1`;
    databaseStatus = "connected";
  } catch (error) {
    console.error("Health check: Database connection failed:", error);
  }

  const status = databaseStatus === "connected" ? "healthy" : "unhealthy";

  return NextResponse.json(
    {
      status,
      version: APP_VERSION,
      timestamp,
      checks: {
        database: databaseStatus,
      },
    },
    { status: status === "healthy" ? 200 : 503 }
  );
}

/**
 * Metrics Endpoint
 *
 * GET /api/metrics - Get application metrics
 *
 * Supports two formats:
 * - JSON (default): Human-readable metrics object
 * - Prometheus: Text format for scraping (Accept: text/plain)
 *
 * Note: Metrics reset on serverless cold start. For persistent metrics,
 * use an external observability service.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMetrics, getPrometheusMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const accept = request.headers.get("Accept") || "";

  // Return Prometheus format if requested
  if (accept.includes("text/plain")) {
    return new Response(getPrometheusMetrics(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // Default to JSON format
  return NextResponse.json(getMetrics());
}

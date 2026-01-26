/**
 * Prisma Database Client Singleton
 *
 * In development, Next.js clears Node.js cache on run, which would create
 * a new PrismaClient instance each time. This file ensures a single instance
 * is reused across hot reloads.
 *
 * In production, this is simply a regular module export.
 *
 * Uses @prisma/adapter-pg for Prisma 7+ compatibility with direct PostgreSQL connections.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient() {
  // Create connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Store pool for reuse in development
  globalForPrisma.pool = pool;

  // Create adapter
  const adapter = new PrismaPg(pool);

  // Create and return PrismaClient with adapter
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

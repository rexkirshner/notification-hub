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

import { Pool, type PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Store singleton instances globally to survive hot reloads in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

/**
 * Creates or returns the existing database connection pool.
 * The pool is stored globally to prevent connection leaks during hot reloads.
 */
function getPool(): Pool {
  if (globalForPrisma.pool) {
    return globalForPrisma.pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const poolConfig: PoolConfig = {
    connectionString,
    // Reasonable defaults for serverless environment
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  const pool = new Pool(poolConfig);

  // Handle pool errors to prevent unhandled rejections
  pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err);
  });

  globalForPrisma.pool = pool;
  return pool;
}

/**
 * Creates or returns the existing PrismaClient instance.
 */
function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const pool = getPool();
  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  globalForPrisma.prisma = prisma;
  return prisma;
}

export const db = getPrismaClient();

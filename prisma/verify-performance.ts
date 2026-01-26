/**
 * Verify Query Performance
 *
 * Tests common queries against the database and reports timing.
 * Run with: npx tsx prisma/verify-performance.ts
 *
 * Ensures indexes are working correctly for common operations.
 */

import "dotenv/config";
import { Pool, type PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, DeliveryStatus } from "@prisma/client";

// Validate DATABASE_URL is set
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL environment variable is not set");
  process.exit(1);
}

// Create connection with adapter (required for Prisma 7+)
const poolConfig: PoolConfig = {
  connectionString,
  max: 5,
  idleTimeoutMillis: 30000,
};
const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface QueryResult {
  name: string;
  duration: number;
  count: number;
}

const results: QueryResult[] = [];

async function timeQuery<T>(
  name: string,
  query: () => Promise<T>,
  getCount: (result: T) => number
): Promise<T> {
  const start = Date.now();
  const result = await query();
  const duration = Date.now() - start;
  const count = getCount(result);
  results.push({ name, duration, count });
  return result;
}

async function main() {
  console.log("Verifying query performance...\n");

  // Get counts first
  const totalCount = await prisma.notification.count();
  console.log(`Total notifications: ${totalCount}\n`);

  if (totalCount < 1000) {
    console.log("Warning: Less than 1000 notifications. Run seed-test-data.ts first for meaningful results.\n");
  }

  // Get a channel ID for filtering
  const channel = await prisma.channel.findFirst();
  const channelId = channel?.id;

  // Get an API key ID for rate limiting queries
  const apiKey = await prisma.apiKey.findFirst();
  const apiKeyId = apiKey?.id;

  console.log("Running queries...\n");

  // 1. List notifications (default query - most common)
  await timeQuery(
    "List notifications (page 1, limit 50)",
    () =>
      prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { channel: true },
      }),
    (r) => r.length
  );

  // 2. Unread count (badge query - very hot)
  await timeQuery(
    "Unread count (all channels)",
    () => prisma.notification.count({ where: { readAt: null } }),
    (r) => r
  );

  // 3. Unread count by channel
  if (channelId) {
    await timeQuery(
      "Unread count (single channel)",
      () =>
        prisma.notification.count({
          where: { channelId, readAt: null },
        }),
      (r) => r
    );
  }

  // 4. Filter by channel
  if (channelId) {
    await timeQuery(
      "Filter by channel (page 1)",
      () =>
        prisma.notification.findMany({
          where: { channelId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      (r) => r.length
    );
  }

  // 5. Filter by delivery status
  await timeQuery(
    "Filter by deliveryStatus = FAILED",
    () =>
      prisma.notification.findMany({
        where: { deliveryStatus: DeliveryStatus.FAILED },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    (r) => r.length
  );

  // 6. Filter by tags (uses GIN index)
  await timeQuery(
    "Filter by tags (hasEvery: ['ci'])",
    () =>
      prisma.notification.findMany({
        where: { tags: { hasEvery: ["ci"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    (r) => r.length
  );

  // 7. Unread only filter
  await timeQuery(
    "Unread only (page 1)",
    () =>
      prisma.notification.findMany({
        where: { readAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    (r) => r.length
  );

  // 8. Combined filters (channel + unread)
  if (channelId) {
    await timeQuery(
      "Channel + unread filter",
      () =>
        prisma.notification.findMany({
          where: { channelId, readAt: null },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      (r) => r.length
    );
  }

  // 9. Rate limiting query (count by apiKeyId + createdAt)
  if (apiKeyId) {
    const windowStart = new Date(Date.now() - 60 * 1000);
    await timeQuery(
      "Rate limit check (count in last minute)",
      () =>
        prisma.notification.count({
          where: {
            apiKeyId,
            createdAt: { gte: windowStart },
          },
        }),
      (r) => r
    );
  }

  // 10. Retry query (FAILED + retryCount < max + recent)
  await timeQuery(
    "Retry query (FAILED notifications for retry)",
    () =>
      prisma.notification.findMany({
        where: {
          deliveryStatus: DeliveryStatus.FAILED,
          retryCount: { lt: 5 },
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
    (r) => r.length
  );

  // 11. Priority filter
  await timeQuery(
    "Filter by minPriority >= 4",
    () =>
      prisma.notification.findMany({
        where: { priority: { gte: 4 } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    (r) => r.length
  );

  // 12. Since query (polling)
  const sinceTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour
  await timeQuery(
    "Since query (last hour)",
    () =>
      prisma.notification.findMany({
        where: { createdAt: { gt: sinceTime } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    (r) => r.length
  );

  // Print results
  console.log("\n" + "=".repeat(70));
  console.log("QUERY PERFORMANCE RESULTS");
  console.log("=".repeat(70));
  console.log(
    `${"Query".padEnd(45)} ${"Time".padStart(8)} ${"Count".padStart(8)}`
  );
  console.log("-".repeat(70));

  for (const result of results) {
    const timeStr = `${result.duration}ms`;
    const countStr = String(result.count);
    console.log(
      `${result.name.padEnd(45)} ${timeStr.padStart(8)} ${countStr.padStart(8)}`
    );
  }

  console.log("-".repeat(70));

  // Summary
  const avgDuration =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map((r) => r.duration));
  const slowQueries = results.filter((r) => r.duration > 100);

  console.log(`\nSummary:`);
  console.log(`  Average query time: ${avgDuration.toFixed(1)}ms`);
  console.log(`  Slowest query: ${maxDuration}ms`);
  console.log(`  Queries > 100ms: ${slowQueries.length}`);

  if (slowQueries.length > 0) {
    console.log(`\nSlow queries:`);
    for (const q of slowQueries) {
      console.log(`  - ${q.name}: ${q.duration}ms`);
    }
  }

  // Performance verdict
  console.log("\n" + "=".repeat(70));
  if (maxDuration < 100) {
    console.log("✅ All queries under 100ms - indexes are working well!");
  } else if (maxDuration < 500) {
    console.log("⚠️  Some queries over 100ms - consider reviewing slow queries");
  } else {
    console.log("❌ Some queries over 500ms - indexes may need optimization");
  }
  console.log("=".repeat(70));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

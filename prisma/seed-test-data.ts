/**
 * Seed Test Data for Performance Verification
 *
 * Creates 10k+ notifications to verify query performance with indexes.
 * Run with: npx tsx prisma/seed-test-data.ts
 *
 * IMPORTANT: Only run this in development, not production!
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

const NOTIFICATION_COUNT = 10_000;
const BATCH_SIZE = 500;

const CATEGORIES = ["error", "success", "info", "warning", null] as const;
const SOURCES = ["github-actions", "deploy-bot", "monitoring", "backup-cron", "test-runner"];
const TAG_OPTIONS = ["ci", "deploy", "alert", "backup", "test", "prod", "dev", "urgent"];

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomTags(): string[] {
  const count = Math.floor(Math.random() * 4); // 0-3 tags
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    const tag = randomChoice(TAG_OPTIONS);
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

function randomPriority(): number {
  // Weight towards normal priority (3)
  const weights = [1, 2, 3, 3, 3, 4, 5];
  return randomChoice(weights);
}

function randomDeliveryStatus(): DeliveryStatus {
  const rand = Math.random();
  if (rand < 0.85) return DeliveryStatus.DELIVERED;
  if (rand < 0.95) return DeliveryStatus.FAILED;
  if (rand < 0.98) return DeliveryStatus.SKIPPED;
  return DeliveryStatus.PENDING;
}

async function main() {
  console.log("Starting test data seed...");

  // Get required data
  const channels = await prisma.channel.findMany();
  const apiKeys = await prisma.apiKey.findMany({ where: { canSend: true } });

  if (channels.length === 0) {
    console.error("No channels found. Run prisma/seed.ts first.");
    process.exit(1);
  }

  if (apiKeys.length === 0) {
    console.error("No API keys found. Create at least one sender key.");
    process.exit(1);
  }

  console.log(`Found ${channels.length} channels and ${apiKeys.length} API keys`);

  // Check existing count
  const existingCount = await prisma.notification.count();
  console.log(`Existing notifications: ${existingCount}`);

  if (existingCount >= NOTIFICATION_COUNT) {
    console.log("Already have enough test data. Skipping.");
    return;
  }

  const toCreate = NOTIFICATION_COUNT - existingCount;
  console.log(`Creating ${toCreate} notifications in batches of ${BATCH_SIZE}...`);

  const startTime = Date.now();
  let created = 0;

  // Create notifications in batches
  for (let batch = 0; batch < Math.ceil(toCreate / BATCH_SIZE); batch++) {
    const batchSize = Math.min(BATCH_SIZE, toCreate - created);
    const notifications = [];

    for (let i = 0; i < batchSize; i++) {
      const channel = randomChoice(channels);
      const apiKey = randomChoice(apiKeys);
      const deliveryStatus = randomDeliveryStatus();
      const createdAt = new Date(
        Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000) // Random time in last 30 days
      );

      notifications.push({
        title: `Test Notification #${existingCount + created + i + 1}`,
        message: `This is a test notification created for performance testing. Lorem ipsum dolor sit amet.`,
        source: randomChoice(SOURCES),
        channelId: channel.id,
        category: randomChoice(CATEGORIES),
        tags: randomTags(),
        priority: randomPriority(),
        deliveryStatus,
        deliveredAt: deliveryStatus === DeliveryStatus.DELIVERED ? createdAt : null,
        readAt: Math.random() < 0.7 ? createdAt : null, // 70% are read
        apiKeyId: apiKey.id,
        createdAt,
        updatedAt: createdAt,
      });
    }

    await prisma.notification.createMany({ data: notifications });
    created += batchSize;

    const progress = Math.round((created / toCreate) * 100);
    process.stdout.write(`\rProgress: ${progress}% (${created}/${toCreate})`);
  }

  const duration = Date.now() - startTime;
  console.log(`\nCreated ${created} notifications in ${duration}ms`);

  // Final count
  const finalCount = await prisma.notification.count();
  console.log(`Total notifications: ${finalCount}`);
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

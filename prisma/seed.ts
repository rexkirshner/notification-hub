/**
 * Database Seed Script
 *
 * Seeds the database with default channels and test API keys.
 * Run with: pnpm db:seed
 */

import "dotenv/config";
import { createHash } from "crypto";
import { Pool, type PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Hash an API key using SHA-256.
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

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

// Type-safe channel definitions
type ChannelCreateInput = Prisma.ChannelCreateInput;

const defaultChannels: ChannelCreateInput[] = [
  {
    name: "default",
    description: "Default notification channel",
    ntfyTopic: null, // Uses NTFY_DEFAULT_TOPIC from env
  },
  {
    name: "prod",
    description: "Production environment notifications",
    ntfyTopic: null,
  },
  {
    name: "dev",
    description: "Development environment notifications",
    ntfyTopic: null,
  },
  {
    name: "personal",
    description: "Personal notifications",
    ntfyTopic: null,
  },
];

// Test API keys for local development
// These are ONLY seeded in development environment
interface TestApiKey {
  key: string;
  name: string;
  description: string;
  canSend: boolean;
  canRead: boolean;
}

const testApiKeys: TestApiKey[] = [
  {
    key: "nhk_test_sender_key_12345678",
    name: "Test Sender",
    description: "Test API key for sending notifications (canSend only)",
    canSend: true,
    canRead: false,
  },
  {
    key: "nhk_test_reader_key_12345678",
    name: "Test Reader",
    description: "Test API key for reading notifications (canRead only)",
    canSend: false,
    canRead: true,
  },
  {
    key: "nhk_test_full_key_123456789",
    name: "Test Full Access",
    description: "Test API key with full access (development only)",
    canSend: true,
    canRead: true,
  },
];

async function main() {
  console.log("Seeding database...");

  // Seed channels
  console.log("\nSeeding channels...");
  for (const channel of defaultChannels) {
    const result = await prisma.channel.upsert({
      where: { name: channel.name },
      update: {
        description: channel.description,
      },
      create: channel,
    });
    console.log(`  Channel: ${result.name} (${result.id})`);
  }

  // Seed test API keys in development only
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.log("\nSeeding test API keys (development only)...");
    for (const apiKey of testApiKeys) {
      const keyHash = hashApiKey(apiKey.key);
      const prefix = apiKey.key.slice(0, 12);

      const result = await prisma.apiKey.upsert({
        where: { keyHash },
        update: {
          name: apiKey.name,
          description: apiKey.description,
          canSend: apiKey.canSend,
          canRead: apiKey.canRead,
        },
        create: {
          name: apiKey.name,
          keyHash,
          prefix,
          description: apiKey.description,
          canSend: apiKey.canSend,
          canRead: apiKey.canRead,
        },
      });
      console.log(`  API Key: ${result.name} (${result.prefix}...)`);
      console.log(`    Key: ${apiKey.key}`);
      console.log(`    Permissions: canSend=${result.canSend}, canRead=${result.canRead}`);
    }
  } else {
    console.log("\nSkipping test API keys (production environment)");
  }

  console.log("\nSeeding complete.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

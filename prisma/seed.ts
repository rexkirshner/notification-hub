/**
 * Database Seed Script
 *
 * Seeds the database with default channels required for the notification hub.
 * Run with: pnpm db:seed
 */

import "dotenv/config";
import { Pool, type PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

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

async function main() {
  console.log("Seeding database...");

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

  console.log("Seeding complete.");
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

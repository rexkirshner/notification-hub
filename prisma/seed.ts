/**
 * Database Seed Script
 *
 * Seeds the database with default channels required for the notification hub.
 * Run with: pnpm db:seed
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Create connection with adapter (required for Prisma 7+)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const defaultChannels = [
  {
    name: "default",
    description: "Default notification channel",
    ntfyTopic: null, // Uses NTFY_DEFAULT_TOPIC from env
  },
  {
    name: "prod",
    description: "Production environment notifications",
    ntfyTopic: null, // Configure specific topic in env or update after deploy
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
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

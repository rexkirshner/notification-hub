/**
 * Database Seed Script
 *
 * Seeds the database with default channels required for the notification hub.
 * Run with: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  });

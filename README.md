# Notification Hub

Centralized notification system for all your projects. Send notifications via HTTP API, receive them on web dashboard and iOS via [ntfy.sh](https://ntfy.sh).

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 20+
- pnpm

### Local Development

```bash
# Start local database
docker compose up -d

# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Seed default channels
pnpm db:seed

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Health Check

```bash
curl http://localhost:3000/api/health
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── health/      # Health check endpoint
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Landing page
├── lib/
│   ├── db.ts            # Database client singleton
│   ├── env.ts           # Environment validation
│   └── utils.ts         # Utility functions
prisma/
├── schema.prisma        # Database schema
└── seed.ts              # Database seed script
```

## Documentation

See [docs/planning/notification-hub.md](docs/planning/notification-hub.md) for full architecture and implementation plan.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL (Vercel Postgres in production, Docker locally)
- **ORM**: Prisma 7
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Validation**: Zod

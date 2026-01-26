# Notification Hub - Development Guidelines

## Environment Policy

**IMPORTANT: Always use the LOCAL development environment by default.**

- **Local/Dev**: Docker Postgres on `localhost:5437` - use for ALL development work
- **Production**: Vercel Postgres - ONLY touch when explicitly instructed

### When to use Production

Only interact with production when the user explicitly says:
- "deploy to production"
- "push to prod"
- "update production"
- "run migration on production"
- Or similar explicit production references

### When to use Local (Default)

Everything else:
- Running `pnpm dev`
- Running migrations
- Seeding data
- Testing API endpoints
- Any database queries or changes

## Local Development Setup

### Prerequisites

- Docker Desktop running
- Node.js 20+
- pnpm

### Start Local Database

```bash
docker compose up -d
```

This starts Postgres on `localhost:5437` with:
- Database: `notification_hub`
- User: `postgres`
- Password: `postgres`

### Environment Files

- `.env` - Local development (gitignored, uses Docker Postgres)
- `.env.production` - Production values (gitignored, pulled from Vercel)
- `.env.example` - Template with all required variables (committed)

### Common Commands

```bash
# Start local database
docker compose up -d

# Stop local database
docker compose down

# Reset local database (delete all data)
docker compose down -v && docker compose up -d

# Run migrations (local)
pnpm db:migrate

# Push schema changes (local, no migration file)
pnpm db:push

# Seed default channels (local)
pnpm db:seed

# Open Prisma Studio (local)
pnpm db:studio

# Start dev server
pnpm dev
```

### Production Commands (ONLY when explicitly requested)

```bash
# Pull production env vars
vercel env pull .env.production

# Deploy to production
vercel --prod --token=TOKEN

# Run migration on production (DANGEROUS - only when explicitly asked)
DATABASE_URL="$PROD_URL" pnpm db:migrate
```

## Project Structure

See `docs/planning/notification-hub.md` for full architecture and milestones.

## Vercel Deployment

Uses the `personal` Vercel account. See global CLAUDE.md for token handling.

> **Session Loop**
> 1. Start → Read `context/STATUS.md`
> 2. End → Run `/save`

# Notification Hub

Centralized notification system: projects send via HTTP API, delivered to web dashboard + iOS push via ntfy.sh.

## Status

**Feature-complete.** Milestones 0-3 done. Ready for production use.

## Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Vercel Postgres (prod) / Docker Postgres (local, port 5437)
- **ORM:** Prisma 7 with pg adapter
- **Auth:** iron-session (dashboard), SHA-256 hashed API keys
- **Push:** ntfy.sh

## Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm lint             # ESLint
pnpm db:push          # Push schema (dev)
pnpm db:seed          # Seed channels + test keys
pnpm db:studio        # Prisma GUI
docker compose up -d  # Start local Postgres
```

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/notifications` | POST | canSend | Create notification |
| `/api/notifications` | GET | canRead/session | List with filters |
| `/api/notifications/stream` | GET | canRead/session | SSE real-time |
| `/api/notifications/unread-count` | GET | canRead/session | Badge count |
| `/api/notifications/:id/read` | PATCH | canRead/session | Mark read |
| `/api/notifications/read` | PATCH | canRead/session | Bulk mark read |
| `/api/keys` | GET/POST | session | Manage API keys |
| `/api/keys/:id` | GET/DELETE | session | Single key ops |
| `/api/channels` | GET | canRead/session | List channels |
| `/api/auth/login` | POST | none | Dashboard login |
| `/api/cron/cleanup` | GET | CRON_SECRET | Delete old records |
| `/api/cron/retry` | GET | CRON_SECRET | Retry failed pushes |
| `/api/health` | GET | none | Health check |
| `/api/metrics` | GET | none | Prometheus metrics |

## Key Files

- `prisma/schema.prisma` - Data model
- `src/lib/auth.ts` - API key validation
- `src/lib/ntfy.ts` - Push delivery with timeout
- `src/lib/rate-limit.ts` - Per-key rate limiting
- `src/lib/session.ts` - iron-session config
- `docs/planning/notification-hub.md` - Full architecture spec

## Environment

**Always use LOCAL by default.** Production only when explicitly requested.

- `.env` - Local (Docker Postgres)
- `.env.production` - Vercel (gitignored)
- `.env.example` - Template

## Test API Key

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Authorization: Bearer nhk_test_sender_key_12345678" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "message": "Hello"}'
```

## Context

- Status: `context/STATUS.md`
- Decisions: `context/DECISIONS.md`

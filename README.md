# Notification Hub

A centralized notification system where any project can send notifications via HTTP API, with delivery to a web dashboard and iOS push via [ntfy.sh](https://ntfy.sh).

## Architecture Overview

```
     PRODUCERS                           HUB                              CONSUMERS
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────────┐
│  Your Projects  │────▶│  Notification Hub API (Vercel)  │────▶│  ntfy.sh (iOS)  │
│  (curl/SDK)     │     │  Next.js + Vercel Postgres      │     └─────────────────┘
└─────────────────┘     └─────────────────────────────────┘
                                      │
                        ┌─────────────┼─────────────┐
                        ▼             ▼             ▼
                ┌───────────┐ ┌───────────┐ ┌───────────┐
                │    Web    │ │   macOS   │ │   CLI /   │
                │ Dashboard │ │    App    │ │  Widgets  │
                └───────────┘ └───────────┘ └───────────┘
```

**Producer API:** Projects send notifications via POST
**Consumer API:** Apps read notifications via GET, SSE stream, mark-read

## Quick Start

### Prerequisites

- Docker Desktop (for local PostgreSQL)
- Node.js 20+
- pnpm

### Local Development

```bash
# 1. Clone and install
git clone <repo-url>
cd notification-hub
pnpm install

# 2. Start local database
docker compose up -d

# 3. Configure environment
cp .env.example .env
# Edit .env - set at minimum:
#   DATABASE_URL (use the Docker one from .env.example)
#   NTFY_DEFAULT_TOPIC (random string like "notification-hub-abc123")
#   ADMIN_PASSWORD_HASH (generate with: node -e "console.log(require('bcrypt').hashSync('your-password', 10))")
#   SESSION_SECRET (generate with: openssl rand -base64 32)

# 4. Set up database
pnpm db:push          # Push schema to database
pnpm db:seed          # Seed default channels + dev API keys

# 5. Run custom indexes (one-time, after schema push)
npx prisma db execute --file prisma/add-indexes.sql

# 6. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### Create Your First Notification

```bash
# Use the development sender key (created by seed)
curl -X POST http://localhost:3000/api/notifications \
  -H "Authorization: Bearer nhk_test_sender_key_12345678" \
  -H "Content-Type: application/json" \
  -d '{"title": "Hello", "message": "First notification!"}'
```

## Project Structure

```
notification-hub/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/               # Login/logout/session
│   │   │   ├── channels/           # List channels
│   │   │   ├── cron/               # Scheduled jobs (cleanup, retry)
│   │   │   ├── health/             # Health check
│   │   │   ├── keys/               # API key management
│   │   │   ├── metrics/            # Observability metrics
│   │   │   └── notifications/      # Core notification API
│   │   │       ├── route.ts        # POST create, GET list
│   │   │       ├── stream/         # SSE real-time stream
│   │   │       ├── unread-count/   # Badge count
│   │   │       ├── read/           # Bulk mark read
│   │   │       └── [id]/           # Single notification ops
│   │   ├── dashboard/              # Web UI pages
│   │   └── login/                  # Login page
│   ├── components/                 # React components
│   └── lib/
│       ├── auth.ts                 # API key validation
│       ├── db.ts                   # Prisma client singleton
│       ├── env.ts                  # Environment validation (Zod)
│       ├── login-throttle.ts       # IP-based login protection
│       ├── metrics.ts              # In-memory metrics
│       ├── ntfy.ts                 # ntfy.sh push delivery
│       ├── rate-limit.ts           # Per-key rate limiting
│       ├── session.ts              # iron-session management
│       └── validators/             # Zod schemas
├── prisma/
│   ├── schema.prisma               # Database schema
│   ├── seed.ts                     # Seed channels + dev keys
│   ├── add-indexes.sql             # Performance indexes
│   ├── seed-test-data.ts           # Generate 10k test notifications
│   └── verify-performance.ts       # Query performance benchmark
├── sdk/
│   ├── index.ts                    # TypeScript SDK
│   └── README.md                   # SDK documentation
├── docs/planning/
│   └── notification-hub.md         # Full implementation plan
└── vercel.json                     # Cron job configuration
```

## API Overview

### Producer API (Sending)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/notifications` | API key (`canSend`) | Create notification |

### Consumer API (Reading)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/notifications` | API key (`canRead`) or session | List with filters |
| `GET /api/notifications/:id` | API key (`canRead`) or session | Get single |
| `GET /api/notifications/stream` | API key (`canRead`) or session | SSE real-time |
| `GET /api/notifications/unread-count` | API key (`canRead`) or session | Badge count |
| `PATCH /api/notifications/:id/read` | API key (`canRead`) or session | Mark single read |
| `PATCH /api/notifications/read` | API key (`canRead`) or session | Bulk mark read |

### Admin API (Dashboard only)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/keys` | Session | Create API key |
| `GET /api/keys` | Session | List API keys |
| `DELETE /api/keys/:id` | Session | Revoke API key |
| `GET /api/channels` | Session or API key | List channels |
| `GET /api/metrics` | None | Observability metrics |
| `GET /api/health` | None | Health check |

## API Key Types

| Type | canSend | canRead | Use Case |
|------|---------|---------|----------|
| Sender | ✓ | ✗ | CI pipelines, webhooks, scripts |
| Consumer | ✗ | ✓ | macOS app, CLI tool, widgets |
| Full | ✓ | ✓ | Development/testing only |

## Usage Examples

### Simple Notification

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy Complete", "message": "Production updated"}'
```

### With Idempotency (Recommended for Webhooks)

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build Failed",
    "message": "CI pipeline error",
    "channel": "prod",
    "category": "error",
    "priority": 4,
    "idempotencyKey": "gh-run-123-attempt-1"
  }'
```

### Using the TypeScript SDK

```typescript
import { NotificationHub } from './sdk';

const hub = new NotificationHub({
  baseUrl: 'https://your-hub.vercel.app',
  apiKey: 'nhk_xxx',
});

await hub.send({
  title: 'Build Complete',
  message: 'Deployment successful',
  channel: 'prod',
});
```

See [sdk/README.md](sdk/README.md) for full SDK documentation.

### Shell Helper Function

```bash
notify() {
  curl -s -X POST https://your-hub.vercel.app/api/notifications \
    -H "Authorization: Bearer $NOTIFICATION_HUB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"title\": \"$1\", \"message\": \"${2:-$1}\", \"channel\": \"${3:-default}\"}"
}

# Usage: notify "Done" "Backup complete" "personal"
```

## Configuration

### Environment Variables

See [.env.example](.env.example) for all options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NTFY_DEFAULT_TOPIC` | Yes | Default ntfy.sh topic (use random string) |
| `ADMIN_PASSWORD_HASH` | Yes* | bcrypt hash of admin password |
| `SESSION_SECRET` | Yes* | Session cookie encryption key |
| `NTFY_TIMEOUT_MS` | No | Push timeout (default: 2000ms) |
| `RETENTION_DAYS` | No | Auto-delete after N days (default: 30) |
| `RETRY_MAX_ATTEMPTS` | No | Failed push retry attempts (default: 5) |

*Required for dashboard access

### Cron Jobs (Production)

Configured in `vercel.json`:

| Job | Schedule | Description |
|-----|----------|-------------|
| `/api/cron/cleanup` | Daily 3am UTC | Delete old notifications/records |
| `/api/cron/retry` | Every 15 min | Retry failed push deliveries |

## Database

### Schema Overview

- **Notification** - Core notification record with delivery tracking
- **ApiKey** - API keys with permissions and rate limits
- **Channel** - Routes to different ntfy topics (prod, dev, etc.)
- **IdempotencyRecord** - Exactly-once delivery guarantee
- **AuditEvent** - Security audit log

### Commands

```bash
pnpm db:push      # Push schema changes (dev)
pnpm db:migrate   # Create migration (prod)
pnpm db:seed      # Seed default data
pnpm db:studio    # Open Prisma Studio GUI
```

### Performance Indexes

Run once after schema setup:
```bash
npx prisma db execute --file prisma/add-indexes.sql
```

Verify performance with test data:
```bash
npx tsx prisma/seed-test-data.ts   # Create 10k test notifications
npx tsx prisma/verify-performance.ts  # Benchmark queries
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel dashboard
3. Add environment variables
4. Provision Vercel Postgres
5. Deploy

Post-deploy:
```bash
# Run indexes on production database
npx prisma db execute --file prisma/add-indexes.sql
```

### Manual Deployment

Any platform supporting Node.js + PostgreSQL works. Set environment variables and run:

```bash
pnpm build
pnpm start
```

## Security Features

- **API Key Hashing** - SHA-256, only hash stored
- **Session Security** - httpOnly, secure, sameSite=strict cookies
- **Login Throttling** - Progressive delay + IP blocking after failures
- **Rate Limiting** - Per-key RPM limits
- **URL Validation** - Only http/https clickUrls allowed
- **XSS Protection** - DOMPurify sanitization for markdown

## Monitoring

### Health Check

```bash
curl https://your-hub.vercel.app/api/health
```

### Metrics

```bash
# JSON format
curl https://your-hub.vercel.app/api/metrics

# Prometheus format
curl -H "Accept: text/plain" https://your-hub.vercel.app/api/metrics
```

Metrics include:
- Notification counts (created, delivered, failed, skipped)
- Retry statistics
- Auth success/failure
- Rate limit hits
- Latency histograms

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL (Vercel Postgres / Docker) |
| ORM | Prisma 7 with pg adapter |
| Validation | Zod |
| UI | Tailwind CSS 4 + shadcn/ui |
| Auth | iron-session + bcrypt |
| Push | ntfy.sh |

## Documentation

- **[docs/planning/notification-hub.md](docs/planning/notification-hub.md)** - Full architecture, security model, and API specifications
- **[sdk/README.md](sdk/README.md)** - TypeScript SDK documentation
- **[.env.example](.env.example)** - Environment variable reference

## License

Private project.

# Notification Hub - Implementation Plan (v1)

## Overview

A centralized notification system where any project can send notifications via HTTP API, with delivery to:
- **Web dashboard** - Browser UI for viewing/filtering notifications
- **iOS push** - Via ntfy.sh (free, no custom iOS app needed)

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────────┐
│  Your Projects  │────▶│  Notification Hub API (Vercel)  │────▶│  ntfy.sh        │
│  (curl/SDK)     │     │  Next.js + Vercel Postgres      │     │  (iOS Push)     │
└─────────────────┘     └─────────────────────────────────┘     └─────────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Web Dashboard │
                              │ (Next.js)     │
                              └───────────────┘
```

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js 15 (App Router) | API + dashboard in one, Vercel native |
| Database | Vercel Postgres | Zero-config, PostgreSQL features (arrays, GIN indexes) |
| ORM | Prisma | Type-safe, migrations |
| Validation | Zod | Schema validation |
| UI | Tailwind + shadcn/ui | Fast development |
| iOS Push | ntfy.sh | Free, just install ntfy app and subscribe to topic |

---

## Security & Auth Rules

### API Key Permissions

| Endpoint | Required Permission | Notes |
|----------|---------------------|-------|
| `POST /api/notifications` | `canSend` | Sender keys |
| `GET /api/notifications` | `canRead` OR dashboard session | Read-only keys or logged-in user |
| `GET /api/notifications/:id` | `canRead` OR dashboard session | |
| `PATCH /api/notifications/:id/read` | `canRead` OR dashboard session | |
| `DELETE /api/notifications/:id` | Admin only | Dashboard session required |
| `GET /api/keys` | Admin only | Dashboard session required |
| `POST /api/keys` | Admin only | Dashboard session required |
| `DELETE /api/keys/:id` | Admin only | Dashboard session required |

### Key Principles

1. **Sender keys should NOT have `canRead`** - A compromised CI key shouldn't expose notification history
2. **Dashboard uses session auth** - Not API keys, to avoid key exposure in browser
3. **Admin operations require dashboard session** - No API key can create/delete other keys

### Push Notification Security

**Never send secrets via push notifications.** ntfy topics are "security by obscurity" - anyone who guesses your topic can read your notifications.

Use `skipPush: true` for notifications containing:
- API keys, tokens, passwords
- Internal URLs or IP addresses
- PII or sensitive business data
- Detailed error stack traces with file paths

These will be stored in the database and visible on the dashboard, but won't be pushed to iOS.

---

## Data Model

### Notifications

```prisma
model Notification {
  id              String   @id @default(cuid())

  // Content
  title           String
  message         String   @db.Text
  markdown        Boolean  @default(false)

  // Categorization
  source          String   // "kex-tracker", "github", "ci-pipeline"
  channel         String   @default("default") // "prod", "dev", "personal"
  category        String?  // "error", "success", "info", "warning"
  tags            String[] // ["deployment", "production", "urgent"]

  // Priority (maps to ntfy priority levels)
  priority        NotificationPriority @default(DEFAULT)

  // Actions/Links
  clickUrl        String?  // URL to open when notification clicked

  // Metadata
  metadata        Json?    // Arbitrary JSON for source-specific data

  // Idempotency (prevents duplicate notifications from retries)
  idempotencyKey  String?  // Unique per apiKeyId, enforced for 24 hours

  // Delivery tracking (separate from read status)
  deliveryStatus  DeliveryStatus @default(PENDING)
  ntfyId          String?
  deliveredAt     DateTime?
  deliveryError   String?  // Error message if FAILED

  // Read tracking (independent of delivery)
  readAt          DateTime?

  // Sender tracking
  apiKeyId        String
  apiKey          ApiKey   @relation(fields: [apiKeyId], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Indexes for query performance
  @@index([createdAt])
  @@index([source])
  @@index([channel])
  @@index([deliveryStatus])
  @@index([source, createdAt])
  @@index([channel, createdAt])
  @@index([apiKeyId, idempotencyKey]) // For idempotency lookup
  @@map("notifications")
}

enum NotificationPriority {
  MIN      // 1 - No sound, no vibration
  LOW      // 2 - No sound
  DEFAULT  // 3 - Sound
  HIGH     // 4 - Sound, may bypass DND
  URGENT   // 5 - Sound, vibration, bypasses DND
}

enum DeliveryStatus {
  PENDING    // Created, not yet processed
  DELIVERED  // Successfully sent to ntfy.sh
  FAILED     // Failed to deliver (see deliveryError)
  SKIPPED    // skipPush was true
}
```

### API Keys

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  name        String   // "kex-tracker-prod", "github-webhooks"
  keyHash     String   @unique // SHA-256 hash of actual key
  prefix      String   // First 8 chars: "nhk_abc1..."

  // Permissions
  canSend     Boolean  @default(true)
  canRead     Boolean  @default(false)

  // Rate limiting
  rateLimit   Int      @default(100) // requests per minute

  // Metadata
  description String?
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  isActive    Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  notifications Notification[]

  @@index([prefix])
  @@index([isActive])
  @@map("api_keys")
}
```

### Channels

Channels allow routing notifications to different ntfy topics and filtering in the dashboard.

```prisma
model Channel {
  id          String   @id @default(cuid())
  name        String   @unique // "prod", "dev", "personal"
  ntfyTopic   String?  // Optional: different topic per channel (null = use default)
  description String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("channels")
}
```

**Default channels:**
- `prod` - Production alerts (push immediately)
- `dev` - Development/staging (can mute on phone)
- `personal` - Personal reminders, non-work
- `default` - Fallback for notifications without a channel

### Database Indexes

Create these indexes for query performance:

```sql
-- B-tree indexes for filtering/sorting
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_source ON notifications(source);
CREATE INDEX idx_notifications_channel ON notifications(channel);
CREATE INDEX idx_notifications_delivery_status ON notifications(delivery_status);
CREATE INDEX idx_notifications_source_created ON notifications(source, created_at DESC);
CREATE INDEX idx_notifications_channel_created ON notifications(channel, created_at DESC);

-- Composite index for idempotency checks
CREATE UNIQUE INDEX idx_notifications_idempotency
  ON notifications(api_key_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- GIN index for tag array queries
CREATE INDEX idx_notifications_tags ON notifications USING GIN(tags);

-- Full-text search index (optional, add in Phase 2 if needed)
CREATE INDEX idx_notifications_search
  ON notifications USING GIN(to_tsvector('english', title || ' ' || message));
```

---

## API Endpoints

```
POST   /api/notifications           # Send notification (canSend)
GET    /api/notifications           # List (canRead or session)
GET    /api/notifications/:id       # Get single (canRead or session)
PATCH  /api/notifications/:id/read  # Mark read (canRead or session)
DELETE /api/notifications/:id       # Delete (admin/session only)

GET    /api/channels                # List channels (canRead or session)

POST   /api/keys                    # Create API key (admin only)
GET    /api/keys                    # List keys (admin only)
DELETE /api/keys/:id                # Revoke key (admin only)

GET    /api/health                  # Health check (public)
```

### POST /api/notifications - Request

```typescript
interface CreateNotificationRequest {
  // Required
  title: string;         // max 200 chars
  message: string;       // max 10,000 chars

  // Optional categorization
  source?: string;       // defaults to API key name
  channel?: string;      // "prod", "dev", "personal" - defaults to "default"
  category?: "error" | "success" | "info" | "warning";
  tags?: string[];       // max 10 tags

  // Optional priority
  priority?: 1 | 2 | 3 | 4 | 5 | "min" | "low" | "default" | "high" | "urgent";

  // Optional formatting
  markdown?: boolean;

  // Optional actions
  clickUrl?: string;     // URL to open on click

  // Optional metadata
  metadata?: Record<string, unknown>;

  // Idempotency (recommended for webhooks/CI)
  idempotencyKey?: string;  // Unique per API key, enforced 24 hours

  // Delivery control
  skipPush?: boolean;    // Store only, don't send to ntfy (use for sensitive data)
}
```

### Idempotency Behavior

When `idempotencyKey` is provided:
1. Check if a notification with this key exists for this API key (within 24 hours)
2. If exists: return the existing notification (200 OK, same response)
3. If not: create new notification normally

This prevents duplicate notifications when webhooks retry or CI jobs re-run.

### GET /api/notifications - Query Parameters

```typescript
interface ListNotificationsQuery {
  // Pagination
  page?: number;         // default: 1
  limit?: number;        // default: 50, max: 100

  // Filtering
  source?: string;
  channel?: string;      // Filter by channel
  category?: string;
  tags?: string[];       // notifications containing ALL tags
  deliveryStatus?: "pending" | "delivered" | "failed" | "skipped";
  unreadOnly?: boolean;  // Only show where readAt is null
  priority?: number;     // minimum priority

  // Date range
  since?: string;        // ISO date
  until?: string;        // ISO date

  // Search
  search?: string;       // full-text in title + message

  // Sorting
  sort?: "createdAt" | "priority";
  order?: "asc" | "desc";
}
```

---

## Sending Notifications

### curl (simple)

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy Complete", "message": "Production updated"}'
```

### curl (with channel and idempotency)

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build Failed",
    "message": "Error in CI pipeline",
    "source": "github-actions",
    "channel": "prod",
    "category": "error",
    "priority": "high",
    "tags": ["ci", "production"],
    "clickUrl": "https://github.com/user/repo/actions/runs/123",
    "idempotencyKey": "gh-run-123-attempt-1"
  }'
```

### curl (sensitive data - skip push)

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New API Key Created",
    "message": "Key nhk_abc123... created for service X",
    "category": "info",
    "skipPush": true
  }'
```

### Shell helper (add to ~/.zshrc)

```bash
notify() {
  local title="$1"
  local message="${2:-$1}"
  local channel="${3:-default}"
  curl -s -X POST https://your-hub.vercel.app/api/notifications \
    -H "Authorization: Bearer $NOTIFICATION_HUB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"title\": \"$title\", \"message\": \"$message\", \"channel\": \"$channel\"}"
}

# Usage:
# notify "Script Complete" "Backup finished"
# notify "Dev Build Done" "Ready for testing" "dev"
```

### TypeScript SDK

```typescript
import { NotificationHub } from '@your/notification-hub-sdk';

const hub = new NotificationHub({
  apiKey: process.env.NOTIFICATION_HUB_KEY!
});

await hub.send({
  title: 'Task Complete',
  message: 'Data import finished successfully',
  channel: 'prod',
  category: 'success',
  idempotencyKey: `import-${jobId}`,
});
```

---

## ntfy.sh Integration

### How it works

1. Install "ntfy" app from iOS App Store (free)
2. Subscribe to your topic(s) - one per channel if desired
3. API forwards notifications to ntfy.sh
4. ntfy.sh sends push to your iOS device

### Channel → Topic Mapping

```
Channel     ntfy Topic                              iOS Behavior
-------     ----------                              ------------
prod        notification-hub-rex-prod-x7k2m        Always on
dev         notification-hub-rex-dev-p3n8q         Can mute in ntfy app
personal    notification-hub-rex-personal-m4j6r    Separate subscription
default     notification-hub-rex-default-k9w1x     Fallback
```

This lets you mute `dev` notifications on your phone without missing `prod` alerts.

### Implementation

```typescript
// src/lib/ntfy.ts
export async function sendToNtfy(notification: Notification, channel: Channel) {
  const topic = channel.ntfyTopic || env.NTFY_DEFAULT_TOPIC;

  const response = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: {
      'Title': notification.title,
      'Priority': mapPriority(notification.priority),
      'Tags': notification.tags.join(','),
      ...(notification.clickUrl && { 'Click': notification.clickUrl }),
      ...(notification.markdown && { 'Markdown': 'yes' }),
    },
    body: notification.message,
  });
  return response.ok;
}
```

---

## Implementation Phases

### Phase 1: Core API

1. Initialize Next.js + Prisma + Vercel Postgres
2. Notification and API key data models with indexes
3. Auth middleware (API key validation + permission checks)
4. `POST /api/notifications` with idempotency support
5. `GET /api/notifications` with filtering
6. Channel model and routing
7. ntfy.sh integration with channel → topic mapping
8. Deploy to Vercel

**Result:** Send notifications via curl, receive on iOS via ntfy app, with proper auth and deduplication

### Phase 2: Web Dashboard

1. Database indexes verified/optimized for query patterns
2. Dashboard auth (simple password or better)
3. Dashboard layout with shadcn/ui
4. Notification list with channel tabs
5. Filtering by source, category, tags, date, read status
6. Search functionality
7. Mark as read / Mark all read
8. API key management UI
9. SSE endpoint for real-time updates (optional)

**Result:** Full web interface for viewing/managing notifications

### Phase 3: Polish & SDK

1. TypeScript SDK package
2. Rate limiting implementation
3. Notification retention/cleanup (30 days default)
4. Dark mode for dashboard
5. Export functionality
6. Documentation

**Result:** Production-ready notification hub

---

## Directory Structure

```
notification-hub/
├── .env.local
├── .env.example
├── .vercel-account
├── package.json
├── next.config.js
├── tailwind.config.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── api/
│   │   │   ├── notifications/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       └── read/route.ts
│   │   │   ├── channels/route.ts
│   │   │   ├── keys/route.ts
│   │   │   └── health/route.ts
│   │   └── (dashboard)/
│   │       ├── layout.tsx
│   │       ├── page.tsx
│   │       └── settings/page.tsx
│   │
│   ├── components/
│   │   ├── ui/
│   │   └── notifications/
│   │
│   ├── lib/
│   │   ├── db.ts
│   │   ├── ntfy.ts
│   │   ├── api-key.ts
│   │   ├── auth.ts          # Permission checking
│   │   └── validators/
│   │
│   └── middleware.ts        # Auth middleware
│
└── docs/
    └── planning/
```

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# ntfy.sh - one topic per channel
NTFY_DEFAULT_TOPIC="notification-hub-rex-default-xxx"
NTFY_TOPIC_PROD="notification-hub-rex-prod-xxx"
NTFY_TOPIC_DEV="notification-hub-rex-dev-xxx"
NTFY_BASE_URL="https://ntfy.sh"

# Dashboard auth
ADMIN_PASSWORD_HASH="..."  # bcrypt hash

# Optional
IDEMPOTENCY_TTL_HOURS=24   # How long to enforce idempotency
RETENTION_DAYS=30          # Auto-delete after this many days
```

---

## Verification Checklist

### After Phase 1
- [ ] `curl POST` creates notification in database
- [ ] Duplicate `idempotencyKey` returns existing notification (not duplicate)
- [ ] Notification appears in ntfy iOS app within seconds
- [ ] Different channels route to different ntfy topics
- [ ] `skipPush: true` stores but doesn't push
- [ ] `curl GET` returns notification list
- [ ] Invalid API key returns 401
- [ ] API key without `canRead` cannot GET notifications
- [ ] API key without `canSend` cannot POST notifications

### After Phase 2
- [ ] Dashboard requires authentication
- [ ] Dashboard loads and shows notifications
- [ ] Channel tabs filter correctly
- [ ] Filtering by source/category/tags works
- [ ] Search finds notifications by title/message
- [ ] Mark as read updates `readAt` timestamp
- [ ] Can create/revoke API keys (admin only)
- [ ] Queries are fast even with 10k+ notifications

### After Phase 3
- [ ] TypeScript SDK works in Node.js project
- [ ] Rate limiting blocks excessive requests
- [ ] Old notifications auto-deleted after retention period
- [ ] Documentation is complete and accurate

# Notification Hub - Implementation Plan

A centralized notification system where any project can send notifications via HTTP API, with delivery to a web dashboard and iOS push via ntfy.sh.

---

## Architecture

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
                              (Consumer API)
```

**Producer API:** Projects send notifications via POST
**Consumer API:** Apps read notifications via GET, SSE stream, mark-read

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Database | Vercel Postgres (prod), Docker Postgres (local) |
| ORM | Prisma 7 with pg adapter |
| Validation | Zod |
| UI | Tailwind CSS 4 + shadcn/ui |
| iOS Push | ntfy.sh |

---

## Security Model

### API Key Permissions (Complete)

| Endpoint | Required | Notes |
|----------|----------|-------|
| **Producer** | | |
| `POST /api/notifications` | `canSend` | Sender keys |
| **Consumer** | | |
| `GET /api/notifications` | `canRead` OR session | List with filters |
| `GET /api/notifications/:id` | `canRead` OR session | Single notification |
| `GET /api/notifications/stream` | `canRead` OR session | SSE real-time |
| `GET /api/notifications/unread-count` | `canRead` OR session | Badge count |
| `PATCH /api/notifications/:id/read` | `canRead` OR session | Mark single read |
| `PATCH /api/notifications/read` | `canRead` OR session | Bulk mark read |
| `DELETE /api/notifications/:id` | Session only | Admin |
| **Channels** | | |
| `GET /api/channels` | `canRead` OR session | List channels |
| **Admin** | | |
| `POST /api/keys` | Session only | Create key |
| `GET /api/keys` | Session only | List keys |
| `DELETE /api/keys/:id` | Session only | Revoke key |
| `GET /api/audit` | Session only | Audit log |
| **Public** | | |
| `GET /api/health` | None | Health check |

### Key Principles

1. **Sender keys should NOT have `canRead`** — compromised CI key can't read history
2. **Dashboard uses session auth** — httpOnly cookie, not API keys in browser
3. **CSRF protection required** — all dashboard mutations need CSRF tokens

### Session Policy

- **TTL:** 24 hours
- **Sliding expiration:** Activity extends session
- **Cookie flags:** `httpOnly`, `secure`, `sameSite=strict`
- **Rotation:** New session token on login (prevents fixation)

### Push Security

**Never send secrets via push.** ntfy topics are "security by obscurity."

Use `skipPush: true` for:
- API keys, tokens, passwords
- Internal URLs or IP addresses
- PII or sensitive data
- Detailed stack traces

### Markdown XSS Safety

When `markdown: true`, sanitize before rendering:
- Use DOMPurify or safe markdown renderer
- Never `dangerouslySetInnerHTML` with unsanitized output

### clickUrl Validation

Validate `clickUrl` to allow only safe schemes:
- **Allowed:** `http://`, `https://`
- **Blocked:** `javascript:`, `data:`, `file:`, `vbscript:`, etc.

This prevents malicious URLs from being rendered/opened by consumer apps.

### Login Throttling

Beyond logging failed logins, implement IP-based rate limiting on `/api/auth/login`:
- **Get client IP:** use `x-forwarded-for` header (first value) — Vercel sits behind a proxy
- After 5 failed attempts from same IP: add progressive delay (1s, 2s, 4s...)
- After 10 failed attempts: block IP for 15 minutes
- Consider CAPTCHA after 3 failures (optional)

### Request Limits

| Field | Limit |
|-------|-------|
| Request body | 100KB max |
| `title` | 200 chars |
| `message` | 10,000 chars |
| `clickUrl` | 2,000 chars |
| `tags` | 10 items max, 50 chars each |
| `metadata` | 10KB max |
| `idempotencyKey` | 256 chars |

Enforce via Zod validation. Return 400 with clear error message on violation.

---

## Data Model

### Notification

```prisma
model Notification {
  id              String   @id @default(cuid())

  // Content
  title           String   @db.VarChar(200)
  message         String   @db.Text
  markdown        Boolean  @default(false)

  // Categorization
  source          String   // defaults to API key name
  channelId       String
  channel         Channel  @relation(fields: [channelId], references: [id])
  category        String?  // "error", "success", "info", "warning"
  tags            String[] @default([])

  // Priority (1-5, maps to ntfy)
  priority        Int      @default(3)

  // Actions
  clickUrl        String?

  // Metadata
  metadata        Json?

  // Delivery (write-first pattern)
  deliveryStatus  DeliveryStatus @default(PENDING)
  deliveredAt     DateTime?
  deliveryError   String?
  retryCount      Int      @default(0)

  // Read tracking
  readAt          DateTime?

  // Sender
  apiKeyId        String
  apiKey          ApiKey   @relation(fields: [apiKeyId], references: [id])

  // Idempotency (back-relation)
  idempotencyRecord IdempotencyRecord?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([createdAt(sort: Desc)])
  @@index([source])
  @@index([channelId])
  @@index([deliveryStatus])
  @@index([channelId, createdAt(sort: Desc)])
  @@map("notifications")
}

// Additional index (add via raw SQL migration - Prisma doesn't support partial indexes):
// CREATE INDEX idx_notifications_unread ON notifications(channel_id, created_at DESC)
//   WHERE read_at IS NULL;
// This optimizes the unread-count query which will be the hottest endpoint.

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
  SKIPPED
}
```

### ApiKey

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  name        String
  keyHash     String   @unique // SHA-256
  prefix      String   @unique // "nhk_abc1..." for display, unique avoids UI confusion

  canSend     Boolean  @default(true)
  canRead     Boolean  @default(false)
  rateLimit   Int      @default(100) // RPM

  description String?
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  isActive    Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  notifications      Notification[]
  idempotencyRecords IdempotencyRecord[]

  @@index([prefix])
  @@map("api_keys")
}
```

### IdempotencyRecord

Separate table for correct TTL-based idempotency. The unique constraint ensures exactly-once semantics; a cleanup job removes expired records. Foreign keys ensure referential integrity and cascade deletes.

```prisma
model IdempotencyRecord {
  id             String   @id @default(cuid())

  apiKeyId       String
  apiKey         ApiKey   @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)

  idempotencyKey String

  notificationId String   @unique  // 1:1 with Notification
  notification   Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  expiresAt      DateTime
  createdAt      DateTime @default(now())

  @@unique([apiKeyId, idempotencyKey])
  @@index([expiresAt])
  @@map("idempotency_records")
}
```

**Idempotency flow (transaction-based):**

```
1. POST with `idempotencyKey`:
   a. Check if IdempotencyRecord exists for (apiKeyId, idempotencyKey)
   b. If exists AND not expired: return linked notification (200 OK + X-Idempotent-Replay: true header)
   c. If exists AND expired:
      BEGIN TRANSACTION
        - Delete expired IdempotencyRecord
        - Create Notification
        - Create new IdempotencyRecord linking to notification
      COMMIT
   d. If not exists:
      BEGIN TRANSACTION
        - Create Notification
        - Create IdempotencyRecord linking to new notification
      COMMIT (or ROLLBACK on unique constraint violation)

2. On unique constraint violation (race condition):
   - Another request won the race and created the record
   - Transaction rolled back automatically
   - Fetch the existing IdempotencyRecord → return its notification (200 + replay header)

3. Cleanup cron deletes old expired records (optimization, not correctness)
```

**Key insight:** Deleting expired records inside the transaction makes correctness independent of cron timing. The cron is for cleanup, not correctness.

**Response semantics:**
- **201 Created** — first create (new notification)
- **200 OK + `X-Idempotent-Replay: true`** — replay (existing notification returned)

### Channel

```prisma
model Channel {
  id          String   @id @default(cuid())
  name        String   @unique // "prod", "dev", "personal", "default"
  ntfyTopic   String?  // null = use NTFY_DEFAULT_TOPIC
  description String?

  notifications Notification[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("channels")
}
```

Channels route to different ntfy topics so you can mute `dev` on your phone without missing `prod`. The API accepts `channel` by name, looks up the Channel record, and stores `channelId`.

### AuditEvent

```prisma
model AuditEvent {
  id         String      @id @default(cuid())
  action     AuditAction
  actorType  ActorType
  actorId    String?     // API key ID or null for admin
  actorIp    String?
  targetType String?     // "api_key", "notification"
  targetId   String?
  metadata   Json?       // { userAgent, requestPath, ... }

  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@map("audit_events")
}

enum AuditAction {
  API_KEY_CREATED
  API_KEY_REVOKED
  DASHBOARD_LOGIN
  DASHBOARD_LOGIN_FAILED
  NOTIFICATIONS_BULK_READ
  // Add NOTIFICATIONS_BULK_DELETE if/when bulk delete endpoint is added
}

enum ActorType {
  ADMIN
  API_KEY
  SYSTEM
}
```

**Recommended metadata fields:**
- `userAgent` — Browser/client identifier
- `requestPath` — API endpoint that triggered the event
- `keyName` — For key create/revoke events
- `count` — For bulk operations

---

## API Endpoints

### Producer API (sending notifications)

```
POST   /api/notifications           # canSend
```

### Consumer API (reading notifications)

The Consumer API allows any client (macOS app, CLI tool, custom widget) to consume notifications — replicating the ntfy.sh experience across your own apps.

```
GET    /api/notifications           # canRead or session - list with filters
GET    /api/notifications/:id       # canRead or session - single notification
GET    /api/notifications/stream    # canRead or session - SSE real-time stream
GET    /api/notifications/unread-count  # canRead or session - lightweight poll

PATCH  /api/notifications/:id/read  # canRead or session - mark single as read
PATCH  /api/notifications/read      # canRead or session - bulk mark as read
DELETE /api/notifications/:id       # session only
```

### Admin API

```
GET    /api/channels                # canRead or session
POST   /api/keys                    # session only
GET    /api/keys                    # session only
DELETE /api/keys/:id                # session only
GET    /api/audit                   # session only
GET    /api/health                  # public
```

### API Key Types

| Key Type | canSend | canRead | Use Case |
|----------|---------|---------|----------|
| Sender | ✓ | ✗ | CI pipelines, webhooks, scripts |
| Consumer | ✗ | ✓ | macOS app, CLI tool, widgets |
| Full | ✓ | ✓ | Development/testing only |

### POST /api/notifications

```typescript
interface CreateNotificationRequest {
  title: string;              // required, max 200
  message: string;            // required, max 10000

  source?: string;            // defaults to API key name
  channel?: string;           // looked up by name, defaults to "default"
  category?: "error" | "success" | "info" | "warning";
  tags?: string[];            // max 10, defaults to []

  priority?: 1 | 2 | 3 | 4 | 5;
  markdown?: boolean;
  clickUrl?: string;
  metadata?: Record<string, unknown>;

  idempotencyKey?: string;    // recommended for webhooks/CI
  skipPush?: boolean;         // true = store only, no ntfy
}
```

**Channel lookup:** The API accepts `channel` by name (e.g., `"prod"`), looks up the corresponding Channel record, and stores `channelId`. Returns 400 if channel doesn't exist.

### Write-First Delivery Pattern

```
1. Validate request
2. Check idempotency (return existing if duplicate)
3. Look up channel by name → get channelId + ntfyTopic
4. Write notification with deliveryStatus = PENDING  ← request succeeds here
5. If skipPush: set SKIPPED, return
6. Attempt ntfy push (with 2s timeout):
   - Success: set DELIVERED + deliveredAt
   - Timeout: set FAILED + deliveryError = "timeout"
   - Other failure: set FAILED + deliveryError = error message
7. Return notification
```

**Critical:** The ntfy fetch must have a hard timeout (2 seconds max). This ensures POST latency stays stable even when ntfy.sh is slow or down. Failed deliveries are picked up by the retry cron.

**Logging:** Log timeouts separately from other failures for monitoring. Frequent timeouts indicate ntfy.sh issues; other failures may indicate configuration problems.

POST succeeds even if ntfy is down. Failed deliveries can be retried later.

### Consumer API Details

#### GET /api/notifications

List notifications with filtering and pagination.

```typescript
interface ListNotificationsQuery {
  // Pagination
  page?: number;              // default: 1
  limit?: number;             // default: 50, max: 100

  // Cursor-based pagination (alternative to page)
  cursor?: string;            // opaque cursor from previous response
  since?: string;             // ISO timestamp - only notifications after this time

  // Filters
  channel?: string;
  source?: string;
  category?: string;
  tags?: string[];            // notifications containing ALL tags
  deliveryStatus?: string;
  unreadOnly?: boolean;       // only where readAt is null
  priority?: number;          // minimum priority

  // Sorting
  sort?: "createdAt" | "priority";
  order?: "asc" | "desc";     // default: desc
}
```

**Cursor pagination:** Uses compound cursor `{ createdAt, id }` encoded as opaque string. This avoids duplicates/gaps under concurrent inserts (unlike `afterId` alone which is unstable when sorting by `createdAt`).

**Pagination rules:**
- If `cursor` is present: use cursor-based pagination, ignore `page`
- If only `page` is present: use offset-based pagination
- Dashboard defaults to cursor-based for stability
- Response includes `nextCursor` if more results exist

**`since` + `cursor` interaction:**
- `since` sets a floor: "only notifications created after this timestamp"
- `cursor` sets a starting point within that filtered set
- Both can be used together: `since` filters the result set, `cursor` paginates within it
- Use case: "give me page 2 of notifications since yesterday" — `since=2024-01-14T00:00:00Z&cursor=...`
- If `cursor` points to a notification older than `since`, return empty (cursor is outside filtered range)

**Efficient polling:** Use `since` parameter to fetch only new notifications:
```bash
# Initial fetch
curl -H "Authorization: Bearer nhk_xxx" \
  "https://your-hub.vercel.app/api/notifications?limit=50"

# Subsequent polls - only get new ones
curl -H "Authorization: Bearer nhk_xxx" \
  "https://your-hub.vercel.app/api/notifications?since=2024-01-15T10:30:00Z"
```

#### GET /api/notifications/stream

Server-Sent Events endpoint for real-time notifications. Clients receive new notifications as they arrive without polling.

**Authentication:**
- **Dashboard (browser, same-origin):** Uses session cookie — standard `EventSource` works
- **External clients (macOS app, CLI):** Must use `fetch` + `ReadableStream` since `EventSource` doesn't support custom headers

```typescript
// Dashboard (same-origin, session cookie)
const eventSource = new EventSource('/api/notifications/stream');
eventSource.addEventListener('notification', (event) => {
  const notification = JSON.parse(event.data);
  showNotification(notification);
});

// External client (with auth header) — use fetch, not EventSource
async function streamNotifications(apiKey: string) {
  const response = await fetch('https://your-hub.vercel.app/api/notifications/stream', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';  // Buffer for partial chunks

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events end with \n\n — only process complete events
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';  // Keep incomplete event in buffer

    for (const event of events) {
      // Parse SSE format: "id: xxx\nevent: notification\ndata: {...}"
      // ... handle complete events
    }
  }
}
```

**Note:** SSE parsing requires buffering across chunk boundaries. A single `read()` may return partial events — always split on `\n\n` and keep incomplete data in a buffer.

**Query parameters:**
- `channel` — filter to specific channel
- `minPriority` — only stream notifications >= this priority

**Events:**
- `notification` — new notification created
- `read` — notification marked as read (for syncing across clients)
- `heartbeat` — keepalive every 15s

**Vercel streaming constraints:**
- Uses **Node.js runtime** (not Edge) — Prisma requires Node.js; Edge Runtime doesn't support Prisma's query engine
- Route config: `export const runtime = "nodejs"` and `export const maxDuration = 300`
- Stream up to **maxDuration seconds** (we use 300); must start response within **~25 seconds**
- **On connect:** immediately write `: connected\n\n` and flush (satisfies the 25s requirement)
- **Heartbeat every 15s** (not 30s — safer margin for proxies/timeouts)
- Clients must implement **auto-reconnect** with `Last-Event-ID` header
- Server sends `id:` field with each event for resumption

**SSE response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no  // Disable nginx buffering if behind proxy
```
Flush after each event write to prevent buffering.

**SSE `id:` field semantics:**
- Format: `{ISO-timestamp}_{cuid}` (e.g., `2024-01-15T10:30:00.000Z_clxyz123`)
- Encodes both `createdAt` and `id` for deterministic cursor resume
- On reconnect with `Last-Event-ID`, server parses timestamp and id, then resumes from that point
- If malformed, server starts from "now" (same as fresh connect)

**Resume query logic:**
```sql
-- Parse Last-Event-ID into (ts, id)
-- Fetch events created AFTER that point (no duplicates)
WHERE (created_at > $ts) OR (created_at = $ts AND id > $id)
ORDER BY created_at ASC, id ASC
```
This compound condition ensures deterministic resumption even when multiple events share the same timestamp.

#### GET /api/notifications/unread-count

Lightweight endpoint for polling unread count (e.g., for badge display).

```bash
curl -H "Authorization: Bearer nhk_xxx" \
  "https://your-hub.vercel.app/api/notifications/unread-count"

# Response: { "count": 5 }
```

**Query parameters:**
- `channel` — count for specific channel only

#### PATCH /api/notifications/read

Bulk mark notifications as read.

```typescript
interface BulkMarkReadRequest {
  // Option 1: specific IDs
  ids?: string[];

  // Option 2: mark all before timestamp
  before?: string;  // ISO timestamp

  // Option 3: mark all in channel
  channel?: string;
}
```

```bash
# Mark specific notifications as read
curl -X PATCH "https://your-hub.vercel.app/api/notifications/read" \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["abc123", "def456"]}'

# Mark all notifications as read
curl -X PATCH "https://your-hub.vercel.app/api/notifications/read" \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"before": "2024-01-15T12:00:00Z"}'
```

---

## Milestones

### Milestone 0: Repo + Deployment Skeleton ✅

**Goal:** Running Next.js app on Vercel with database connected.

- [x] Create Next.js 16 project with App Router
- [x] Add Tailwind CSS 4 + shadcn/ui
- [x] Provision Vercel Postgres (production) + Docker Postgres (local development)
- [x] Add Prisma 7 with full schema (Notification, ApiKey, Channel, AuditEvent, IdempotencyRecord)
- [x] Add `.env.example` and env validation (Zod-based)
- [x] Deploy to Vercel
- [x] Seed default channels (default, prod, dev, personal)

**Done when:**
- [x] `/api/health` returns 200
- [x] Prisma can migrate and connect in Vercel preview/prod

---

### Milestone 0.5: Streaming Spike ✅

**Goal:** Validate SSE works on Vercel with our stack before building full Consumer API.

This is a risk-reduction milestone. If streaming doesn't work as expected, we need to know early — before building the full Consumer API on top of it.

- [x] Create minimal `/api/test-stream` endpoint:
  - Uses Node.js runtime (not Edge) for Prisma compatibility
  - Immediately writes `: connected\n\n` on connect
  - Sends heartbeat every 15s
  - Sends test event every 5s (counter or timestamp)
  - Runs for 60 seconds then closes
- [x] Deploy to Vercel production (preview has auth protection)
- [x] Test with curl: `curl -N https://notification-hub-two.vercel.app/api/test-stream`
- [x] Verify: immediate `: connected`, heartbeats arrive, events arrive
- [ ] Delete test endpoint after full Consumer API is implemented

**Done when:**
- [x] SSE streams work reliably on Vercel for 60+ seconds
- [x] Heartbeats prevent connection timeouts
- [x] Confident streaming will work for real Consumer API

**Decision:** Proceed with SSE-based Consumer API.

---

### Milestone 1: Core Ingestion API (In Progress)

**Goal:** `curl POST` reliably creates notifications with proper auth and write-first delivery.

- [x] Implement full Prisma schema (Notification, ApiKey, Channel, AuditEvent, IdempotencyRecord)
- [x] Seed default channels (prod, dev, personal, default)
- [x] Auth middleware:
  - Parse `Authorization: Bearer ...`
  - Validate key hash, `isActive`, expiration
  - Enforce permissions per endpoint
- [x] `POST /api/notifications`:
  - Zod validation
  - **clickUrl validation** (only http/https schemes)
  - Idempotency check (see Milestone 1.1) ← still pending
  - Write-first delivery pattern
  - Channel → ntfy topic routing
- [x] `GET /api/notifications`:
  - Pagination (page, limit)
  - Filters: source, channel, category, tags, deliveryStatus, unreadOnly
  - Enforce `canRead` or session
- [x] `GET /api/health`

**Done when:**
- [x] Sender key (`canSend=true, canRead=false`) can POST but gets 403 on GET
- [x] Notification appears in ntfy iOS app
- [ ] ntfy down → POST still succeeds, notification ends as FAILED with deliveryError (needs testing)

---

### Milestone 1.1: Correct Idempotency

**Goal:** Exactly-once semantics with proper TTL enforcement.

- [ ] Create IdempotencyRecord table with unique constraint
- [ ] On POST with `idempotencyKey`:
  1. Check if record exists (fast path: return existing notification)
  2. If not: BEGIN TRANSACTION → create notification → create idempotency record → COMMIT
  3. On unique constraint violation (race): rollback, fetch existing, return
- [ ] Add Vercel cron to delete expired records
  - Cron handler must be **idempotent** (safe to rerun if first invocation fails)

**Done when:**
- Duplicate POST with same `idempotencyKey` returns original notification (same `id`)
- Concurrent duplicate POSTs don't create orphan notifications
- After cleanup runs, same key can create new notification

---

### Milestone 1.2: Consumer API

**Goal:** External apps can consume notifications like ntfy.sh — polling, streaming, and marking read.

- [ ] `GET /api/notifications` enhancements:
  - Add `since` parameter (ISO timestamp)
  - Add `cursor` parameter (compound `{ createdAt, id }` for stable pagination)
  - Efficient queries with proper indexes
- [ ] `GET /api/notifications/unread-count`:
  - Lightweight count query
  - Optional `channel` filter
  - **Add partial index** for unread queries (see schema note)
- [ ] `GET /api/notifications/stream` (SSE):
  - Server-Sent Events endpoint using **Node.js runtime** (Prisma requires Node.js)
  - Route config: `export const runtime = "nodejs"` + `export const maxDuration = 300`
  - **New notification mechanism (MVP):** poll DB every 1000–2000ms inside SSE loop using cursor/resume query; emit any new rows
  - **Fast mode (optional):** 500ms polling when dashboard tab is focused (use Page Visibility API)
  - **Upgrade path:** Postgres LISTEN/NOTIFY or Redis pubsub to avoid polling (not needed for personal use)
  - **On connect:** immediately write `: connected\n\n` (satisfies 25s requirement)
  - **Heartbeat every 15s** (safer margin for proxies)
  - Optional `channel` and `minPriority` filters
  - **Vercel constraint:** stream up to `maxDuration` seconds; client auto-reconnects
  - Include `id:` field in events for client reconnect with `Last-Event-ID`
  - Auth: session cookie for dashboard, API key header for external clients
- [ ] `PATCH /api/notifications/read` (bulk):
  - Mark by IDs array
  - Mark by `before` timestamp
  - Mark by channel
- [ ] Create consumer API key type (`canSend=false, canRead=true`)

**Done when:**
- macOS app can poll with `since` and only get new notifications
- SSE stream delivers notifications in real-time
- Bulk mark-read works for all three modes
- Consumer key can read but cannot send

---

### Milestone 2: Web Dashboard

**Goal:** Usable UI with strong security boundaries.

- [ ] Dashboard auth:
  - Session-based (httpOnly, secure, sameSite cookie)
  - Password hash verification
  - CSRF tokens for all mutations
  - Log success/failure to AuditEvent
  - **Login throttling:** IP-based rate limit (5 failures → delay, 10 → block 15min)
- [ ] Notification list:
  - Channel tabs
  - Filters: source, category, tags, status, unreadOnly
  - Pagination
  - Mark read / mark all read
- [ ] Markdown rendering:
  - Sanitize with DOMPurify (or safe renderer)
  - Test that `<script>` and `javascript:` are stripped
- [ ] API key management:
  - Create (show plaintext once, then only prefix)
  - Revoke
  - List (prefix only)
  - All actions logged to AuditEvent
- [ ] Audit log viewer (optional)

**Done when:**
- Dashboard requires login
- Failed login attempts appear in audit log
- Markdown can't execute scripts
- Key create/revoke works and is audited

---

### Milestone 3: Hardening + Production Readiness

**Goal:** Fast, cheap, stable at scale.

#### Performance
- [ ] Verify query plans with 10k+ notifications
- [ ] Add GIN index for tags: `CREATE INDEX ... USING GIN(tags)`
- [ ] Add full-text search index if needed

#### Rate Limiting
- [ ] Implement per-key RPM limit (`rateLimit` field)
- [ ] **Storage: Vercel KV (Upstash Redis)** — correct under concurrency, atomic INCR with TTL
- [ ] DB-based acceptable for personal/low-volume use (simpler, no extra service)

#### Retention
- [ ] Scheduled cleanup for old notifications (default 30 days)
- [ ] Scheduled cleanup for expired IdempotencyRecords

**Vercel Cron note:** Vercel won't auto-retry failed cron invocations. All cron handlers must be **idempotent** — safe to rerun if a previous run partially failed.

#### Retry Delivery
- [ ] Cron job retries FAILED notifications:
  - Exponential backoff
  - Max attempts (e.g., 5)
  - Track `retryCount` in notification
  - Stop retrying after max or after 24h

#### SDK
- [ ] Minimal TypeScript SDK:
  - `send()` method with full typing
  - Idempotency key helper
  - Error handling

#### Observability (minimal)
- [ ] Log and count FAILED deliveries (ntfy errors vs timeouts)
- [ ] Log retry attempts and final outcomes
- [ ] Log failed login attempts (already in AuditEvent, surface in logs)
- [ ] Track POST latency buckets (< 100ms, < 500ms, < 2s, timeout)
- [ ] Optional: simple `/api/metrics` endpoint for scraping

Nothing fancy — just enough to debug "why didn't my notification arrive?"

**Done when:**
- Queries stay fast with real volume
- Rate limiting blocks excessive requests
- Old data auto-cleaned
- FAILED notifications eventually retry and deliver

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# ntfy.sh
NTFY_DEFAULT_TOPIC="notification-hub-xxx-default"
NTFY_BASE_URL="https://ntfy.sh"
NTFY_TIMEOUT_MS=2000  # Hard timeout for push requests

# Dashboard auth
ADMIN_PASSWORD_HASH="..."  # bcrypt
SESSION_TTL_HOURS=24

# Optional
IDEMPOTENCY_TTL_HOURS=24
RETENTION_DAYS=30
RETRY_MAX_ATTEMPTS=5
```

---

## Directory Structure

```
notification-hub/
├── .env.example
├── .vercel-account
├── package.json
├── next.config.ts
├── tailwind.config.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts              # Seed default channels
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx         # Redirect to dashboard or landing
│   │   │
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── notifications/
│   │   │   │   ├── route.ts              # GET list, POST create
│   │   │   │   ├── stream/route.ts       # GET SSE stream
│   │   │   │   ├── unread-count/route.ts # GET count
│   │   │   │   ├── read/route.ts         # PATCH bulk mark read
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts          # GET single, DELETE
│   │   │   │       └── read/route.ts     # PATCH mark single read
│   │   │   ├── channels/route.ts
│   │   │   ├── keys/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   └── audit/route.ts
│   │   │
│   │   ├── login/page.tsx
│   │   │
│   │   └── dashboard/
│   │       ├── layout.tsx
│   │       ├── page.tsx              # Notification list
│   │       ├── settings/page.tsx     # API keys
│   │       └── audit/page.tsx        # Audit log
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn
│   │   └── notifications/
│   │
│   ├── lib/
│   │   ├── db.ts                     # Prisma singleton
│   │   ├── auth.ts                   # Session + API key validation
│   │   ├── csrf.ts                   # CSRF token helpers
│   │   ├── ntfy.ts                   # Push delivery
│   │   ├── idempotency.ts            # Idempotency logic
│   │   └── validators/               # Zod schemas
│   │
│   └── middleware.ts
│
└── docs/
    └── planning/
```

---

## Usage Examples

### Simple notification

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy Complete", "message": "Production updated"}'
```

### With idempotency (recommended for webhooks)

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

### Sensitive data (skip push)

```bash
curl -X POST https://your-hub.vercel.app/api/notifications \
  -H "Authorization: Bearer nhk_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API Key Created",
    "message": "New key for service X",
    "skipPush": true
  }'
```

### Shell helper

```bash
notify() {
  curl -s -X POST https://your-hub.vercel.app/api/notifications \
    -H "Authorization: Bearer $NOTIFICATION_HUB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"title\": \"$1\", \"message\": \"${2:-$1}\", \"channel\": \"${3:-default}\"}"
}

# Usage: notify "Done" "Backup complete" "personal"
```

---

## Consumer App Examples

### Polling for new notifications (macOS app, CLI)

```bash
# Store last check time
LAST_CHECK="2024-01-15T10:00:00Z"

# Fetch only new notifications
curl -H "Authorization: Bearer $CONSUMER_KEY" \
  "https://your-hub.vercel.app/api/notifications?since=$LAST_CHECK&unreadOnly=true"
```

### Real-time streaming (SSE)

**Note:** Standard `EventSource` doesn't support custom headers. Use `fetch` + `ReadableStream` for external clients with API key auth.

```typescript
// External client with API key (macOS app, CLI)
async function streamNotifications(apiKey: string, lastEventId?: string) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
  };
  if (lastEventId) {
    headers['Last-Event-ID'] = lastEventId;  // Resume from last event
  }

  const response = await fetch('https://your-hub.vercel.app/api/notifications/stream', {
    headers,
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // IMPORTANT: Use buffered parser from Consumer API section above —
    // chunks may be partial; always split on \n\n and buffer incomplete events
    parseSSE(chunk, (event, data, id) => {
      if (event === 'notification') {
        const notification = JSON.parse(data);
        showDesktopNotification(notification.title, notification.message);
        lastEventId = id;  // Track for reconnect
      }
    });
  }

  // Connection closed (Vercel ~300s limit) — reconnect
  setTimeout(() => streamNotifications(apiKey, lastEventId), 1000);
}
```

```typescript
// Dashboard (same-origin, session cookie) — standard EventSource works
const eventSource = new EventSource('/api/notifications/stream');
eventSource.addEventListener('notification', (event) => {
  const notification = JSON.parse(event.data);
  showNotification(notification);
});
```

### Swift (macOS menu bar app)

```swift
// Fetch unread count for badge
func fetchUnreadCount() async throws -> Int {
    let url = URL(string: "https://your-hub.vercel.app/api/notifications/unread-count")!
    var request = URLRequest(url: url)
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(UnreadCountResponse.self, from: data)
    return response.count
}

// Mark notification as read
func markAsRead(id: String) async throws {
    let url = URL(string: "https://your-hub.vercel.app/api/notifications/\(id)/read")!
    var request = URLRequest(url: url)
    request.httpMethod = "PATCH"
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

    let (_, _) = try await URLSession.shared.data(for: request)
}
```

---

## Verification Checklist

### After Milestone 0 ✅
- [x] `/api/health` returns 200 on Vercel
- [x] `npx prisma db push` succeeds (using push for development; migrations for production)

### After Milestone 0.5 ✅
- [x] Test stream endpoint works on Vercel (production - preview has auth protection)
- [x] `: connected` arrives immediately on connect
- [x] Heartbeats arrive every ~15s
- [x] Test events arrive as expected
- [x] Stream stays open for 35+ seconds without timeout (tested; can run for 60s+)
- [x] Decision documented: proceed with SSE

### After Milestone 1
- [ ] POST creates notification in database
- [ ] POST succeeds even if ntfy.sh is down (deliveryStatus = FAILED)
- [ ] POST completes in <3s even when ntfy.sh is slow (timeout works)
- [ ] Notification appears in ntfy iOS app when ntfy is up
- [ ] Different channels route to different ntfy topics
- [ ] Invalid channel name → 400 (both POST and GET filters)
- [ ] Missing tags defaults to empty array (not null)
- [ ] `skipPush: true` → deliveryStatus = SKIPPED
- [ ] Invalid API key → 401
- [ ] Key with `canSend` but not `canRead` → POST works, GET returns 403

### After Milestone 1.1
- [ ] Duplicate `idempotencyKey` returns same notification ID
- [ ] Concurrent duplicate POSTs don't create orphan notifications (transaction works)
- [ ] After record expires and cleanup runs, same key creates new notification
- [ ] Cleanup cron is idempotent (safe to rerun)

### After Milestone 1.2
- [ ] `GET /api/notifications?since=<timestamp>` returns only newer notifications
- [ ] `GET /api/notifications/unread-count` returns correct count
- [ ] SSE stream (`/api/notifications/stream`) delivers new notifications in real-time
- [ ] SSE includes `id:` field for reconnect resumption
- [ ] SSE writes `: connected` immediately on connect
- [ ] SSE heartbeat arrives every 15s
- [ ] SSE reconnect with `Last-Event-ID` resumes correctly
- [ ] Bulk mark-read by IDs works
- [ ] Bulk mark-read by `before` timestamp works
- [ ] Consumer key (`canRead=true, canSend=false`) can GET but not POST

### After Milestone 2
- [ ] Dashboard requires login
- [ ] Failed login logged to audit
- [ ] Login throttling blocks after repeated failures from same IP
- [ ] `<script>alert(1)</script>` in markdown doesn't execute
- [ ] `javascript:alert(1)` in clickUrl is rejected (only http/https allowed)
- [ ] Key create shows plaintext once, then only prefix
- [ ] Key revoke works and is audited

### After Milestone 3
- [ ] Queries fast with 10k+ notifications
- [ ] Rate limit blocks when exceeded
- [ ] Old notifications auto-deleted
- [ ] FAILED notification eventually becomes DELIVERED after retry

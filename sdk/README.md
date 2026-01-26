# Notification Hub SDK

TypeScript SDK for sending notifications to Notification Hub.

## Installation

```bash
# Copy sdk/index.ts to your project, or publish to npm
npm install @notification-hub/sdk
```

## Usage

### Basic Usage

```typescript
import { NotificationHub } from '@notification-hub/sdk';

const hub = new NotificationHub({
  baseUrl: 'https://your-hub.vercel.app',
  apiKey: 'nhk_xxx',
});

// Simple notification
await hub.send({
  title: 'Build Complete',
  message: 'Production deployment successful',
});

// With all options
await hub.send({
  title: 'CI Failed',
  message: 'Build #123 failed on main branch',
  channel: 'prod',
  category: 'error',
  priority: 4,
  tags: ['ci', 'github'],
  clickUrl: 'https://github.com/org/repo/actions/runs/123',
  idempotencyKey: NotificationHub.idempotencyKey('github', 'run-123'),
});
```

### Error Handling

```typescript
import {
  NotificationHub,
  RateLimitError,
  NotificationHubError
} from '@notification-hub/sdk';

try {
  const result = await hub.send({
    title: 'Test',
    message: 'Test message',
  });

  if (result.isReplay) {
    console.log('Duplicate notification (idempotency)');
  }

  console.log(`Remaining rate limit: ${result.rateLimitRemaining}`);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof NotificationHubError) {
    console.log(`Error: ${error.message} (${error.status})`);
  }
}
```

### Idempotency

Use idempotency keys to prevent duplicate notifications on retries:

```typescript
// Generate consistent idempotency key
const key = NotificationHub.idempotencyKey('github', 'run-123', 'attempt-1');

await hub.send({
  title: 'Build Failed',
  message: 'CI error',
  idempotencyKey: key, // Same key = same notification returned
});
```

### Skip Push (Store Only)

For sensitive data that shouldn't go through push:

```typescript
await hub.send({
  title: 'API Key Created',
  message: 'New key: nhk_abc...',
  skipPush: true, // Stored in hub, but not sent to ntfy
});
```

## API Reference

### NotificationHub

```typescript
new NotificationHub({
  baseUrl: string,    // Your hub URL
  apiKey: string,     // API key with canSend permission
  timeout?: number,   // Request timeout (default: 10000ms)
})
```

### send(options)

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| title | string | Yes | Max 200 chars |
| message | string | Yes | Max 10000 chars |
| channel | string | No | Default: "default" |
| category | "error" \| "success" \| "info" \| "warning" | No | |
| tags | string[] | No | Max 10 tags, 50 chars each |
| priority | 1-5 | No | 1=min, 3=default, 5=urgent |
| markdown | boolean | No | Render as markdown |
| clickUrl | string | No | URL to open on click |
| metadata | object | No | Max 10KB |
| idempotencyKey | string | No | For deduplication |
| skipPush | boolean | No | Store only, no push |
| source | string | No | Defaults to API key name |

### Static Methods

```typescript
NotificationHub.idempotencyKey(...components: (string | number)[]): string
```

Generates an idempotency key from components joined with "-".

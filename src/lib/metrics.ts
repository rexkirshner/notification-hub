/**
 * Simple In-Memory Metrics
 *
 * Tracks basic metrics for observability. Resets on serverless cold start.
 * For persistent metrics, use an external service (Datadog, Prometheus, etc.)
 *
 * This is intentionally simple - enough to debug "why didn't my notification arrive?"
 */

interface CounterMetrics {
  // Notification delivery
  notifications_created: number;
  notifications_delivered: number;
  notifications_failed: number;
  notifications_skipped: number;
  notifications_timeout: number;

  // Retry
  retry_attempts: number;
  retry_successes: number;
  retry_failures: number;
  retry_gave_up: number;

  // Auth
  login_success: number;
  login_failure: number;
  api_key_auth_success: number;
  api_key_auth_failure: number;

  // Rate limiting
  rate_limit_exceeded: number;

  // Errors
  errors_total: number;
}

interface HistogramBucket {
  le100: number;   // <= 100ms
  le500: number;   // <= 500ms
  le2000: number;  // <= 2000ms (ntfy timeout)
  leInf: number;   // > 2000ms (exceeded timeout)
}

interface HistogramMetrics {
  post_latency: HistogramBucket;
  ntfy_latency: HistogramBucket;
}

interface Metrics {
  counters: CounterMetrics;
  histograms: HistogramMetrics;
  startedAt: number;
}

// Initialize metrics
const metrics: Metrics = {
  counters: {
    notifications_created: 0,
    notifications_delivered: 0,
    notifications_failed: 0,
    notifications_skipped: 0,
    notifications_timeout: 0,
    retry_attempts: 0,
    retry_successes: 0,
    retry_failures: 0,
    retry_gave_up: 0,
    login_success: 0,
    login_failure: 0,
    api_key_auth_success: 0,
    api_key_auth_failure: 0,
    rate_limit_exceeded: 0,
    errors_total: 0,
  },
  histograms: {
    post_latency: { le100: 0, le500: 0, le2000: 0, leInf: 0 },
    ntfy_latency: { le100: 0, le500: 0, le2000: 0, leInf: 0 },
  },
  startedAt: Date.now(),
};

/**
 * Increment a counter metric.
 */
export function incCounter(name: keyof CounterMetrics, value = 1): void {
  metrics.counters[name] += value;
}

/**
 * Record a duration in a histogram.
 */
export function recordDuration(
  name: keyof HistogramMetrics,
  durationMs: number
): void {
  const bucket = metrics.histograms[name];
  if (durationMs <= 100) {
    bucket.le100++;
  } else if (durationMs <= 500) {
    bucket.le500++;
  } else if (durationMs <= 2000) {
    bucket.le2000++;
  } else {
    bucket.leInf++;
  }
}

/**
 * Get all metrics in a simple format.
 */
export function getMetrics(): {
  counters: CounterMetrics;
  histograms: HistogramMetrics;
  uptime_seconds: number;
} {
  return {
    counters: { ...metrics.counters },
    histograms: {
      post_latency: { ...metrics.histograms.post_latency },
      ntfy_latency: { ...metrics.histograms.ntfy_latency },
    },
    uptime_seconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
  };
}

/**
 * Get metrics in Prometheus text format.
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = [];
  const prefix = "notification_hub";

  // Counters
  for (const [name, value] of Object.entries(metrics.counters)) {
    lines.push(`# TYPE ${prefix}_${name} counter`);
    lines.push(`${prefix}_${name} ${value}`);
  }

  // Histograms (as cumulative buckets)
  for (const [name, buckets] of Object.entries(metrics.histograms)) {
    const total =
      buckets.le100 + buckets.le500 + buckets.le2000 + buckets.leInf;
    lines.push(`# TYPE ${prefix}_${name}_seconds histogram`);
    lines.push(
      `${prefix}_${name}_seconds_bucket{le="0.1"} ${buckets.le100}`
    );
    lines.push(
      `${prefix}_${name}_seconds_bucket{le="0.5"} ${buckets.le100 + buckets.le500}`
    );
    lines.push(
      `${prefix}_${name}_seconds_bucket{le="2"} ${buckets.le100 + buckets.le500 + buckets.le2000}`
    );
    lines.push(`${prefix}_${name}_seconds_bucket{le="+Inf"} ${total}`);
    lines.push(`${prefix}_${name}_seconds_count ${total}`);
  }

  // Uptime
  lines.push(`# TYPE ${prefix}_uptime_seconds gauge`);
  lines.push(
    `${prefix}_uptime_seconds ${Math.floor((Date.now() - metrics.startedAt) / 1000)}`
  );

  return lines.join("\n");
}

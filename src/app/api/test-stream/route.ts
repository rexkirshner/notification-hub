/**
 * Test Stream Endpoint
 *
 * Validates SSE streaming works on Vercel before building full Consumer API.
 * This is a risk-reduction spike - delete after validation.
 *
 * Tests:
 * - Immediate connection acknowledgment
 * - Heartbeat every 15s
 * - Event delivery every 5s
 * - Stream duration of 60s
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STREAM_DURATION_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const EVENT_INTERVAL_MS = 5_000;

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  const startTime = Date.now();
  let eventCounter = 0;

  const stream = new ReadableStream({
    async start(controller) {
      // Immediately send connection acknowledgment
      // This must happen within ~25s on Vercel
      controller.enqueue(encoder.encode(": connected\n\n"));

      const sendHeartbeat = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        controller.enqueue(
          encoder.encode(`: heartbeat at ${elapsed}s\n\n`)
        );
      };

      const sendEvent = () => {
        eventCounter++;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const eventId = `${new Date().toISOString()}_${eventCounter}`;
        const data = JSON.stringify({
          counter: eventCounter,
          elapsedSeconds: elapsed,
          timestamp: new Date().toISOString(),
        });

        controller.enqueue(
          encoder.encode(`id: ${eventId}\nevent: test\ndata: ${data}\n\n`)
        );
      };

      // Send initial event immediately after connection
      sendEvent();

      // Set up intervals
      const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      const eventInterval = setInterval(sendEvent, EVENT_INTERVAL_MS);

      // Close stream after duration
      const closeTimeout = setTimeout(() => {
        clearInterval(heartbeatInterval);
        clearInterval(eventInterval);

        const finalData = JSON.stringify({
          message: "Stream complete",
          totalEvents: eventCounter,
          durationSeconds: Math.floor((Date.now() - startTime) / 1000),
        });
        controller.enqueue(
          encoder.encode(`event: close\ndata: ${finalData}\n\n`)
        );
        controller.close();
      }, STREAM_DURATION_MS);

      // Handle client disconnect
      return () => {
        clearInterval(heartbeatInterval);
        clearInterval(eventInterval);
        clearTimeout(closeTimeout);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

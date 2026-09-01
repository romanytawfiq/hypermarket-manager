import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/services/authorization.service";
import { cafePollEventsAction, cafeLatestSequenceAction } from "@/actions/cafe-actions";

/**
 * Café realtime SSE stream (Phase 7, architecture §15).
 *
 * The server is authoritative: the KDS client opens this stream to receive
 * business events (`CAFE_ORDER_CREATED`, `CAFE_ORDER_STATUS_CHANGED`) pushed
 * from the transactional outbox. Deltas carry a monotonic `sequence`; the
 * client resumes with `after` (query or `Last-Event-ID`) and deduplicates by
 * `eventId`. On (re)connect the client additionally reconciles against full
 * server state via listKdsOrders, so a missed batch is never left behind.
 *
 * This is a same-origin, Node-runtime stream. Authorization is validated here
 * independently of the middleware (which treats /api as public).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1500;

function sse(data: string, event?: string, id?: string): string {
  const parts: string[] = [];
  if (event) parts.push(`event: ${event}`);
  if (id) parts.push(`id: ${id}`);
  parts.push(`data: ${data}`);
  return `${parts.join("\n")}\n\n`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, ["cafe.kds.view", "cafe.orders.read"])) {
    return new Response("غير مصرح", { status: 401 });
  }

  // Resume point: `Last-Event-ID` (auto-sent by EventSource on reconnect) is
  // preferred; otherwise fall back to the `after` query parameter. A missing or
  // malformed value means "start from the beginning" (after = 0).
  const lastEventId = request.headers.get("Last-Event-ID");
  let after: number;
  if (lastEventId !== null && lastEventId !== "") {
    after = Number(lastEventId);
  } else {
    const q = Number(new URL(request.url).searchParams.get("after"));
    after = Number.isFinite(q) ? q : 0;
  }
  if (!Number.isFinite(after) || after < 0) after = 0;
  after = Math.floor(after);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* client gone; loop will exit */
        }
      };

      let closed = false;
      const heartbeat = setInterval(() => {
        if (closed) return;
        send(": ping\n\n");
      }, 15000);

      try {
        // First flush the current resume point so the client knows its base seq.
        const latest = await cafeLatestSequenceAction();
        send(sse(JSON.stringify({ type: "SNAPSHOT_SEQUENCE", after: latest }), "snapshot"));

        while (!closed) {
          const events = await cafePollEventsAction(after, 50);
          if (events.length > 0) {
            for (const e of events) {
              send(
                sse(
                  JSON.stringify({
                    eventId: e.eventId,
                    type: e.type,
                    aggregateId: e.aggregateId,
                    version: e.version,
                    sequence: e.sequence,
                    payload: e.payload,
                  }),
                  "cafe:event",
                  String(e.sequence),
                ),
              );
            }
            const last = events[events.length - 1];
            if (last) after = last.sequence;
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      } catch {
        // Drop the connection on any stream error; client reconnects + reconciles.
      } finally {
        closed = true;
        clearInterval(heartbeat);
        controller.close();
      }
    },
    cancel() {
      /* cleanup handled by finally on next iteration */
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

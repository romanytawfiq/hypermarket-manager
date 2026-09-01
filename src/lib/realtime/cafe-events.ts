"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Café realtime subscription hook (Phase 7).
 *
 * Opens an SSE stream to `/api/cafe/events` and surfaces business events to the
 * caller. Design (architecture §15):
 *
 * - The server is authoritative. This hook forwards events and connectivity
 *   changes; the consumer reconciles its local board against *full server
 *   state* (`listKdsOrdersAction`) rather than trusting the delta stream alone.
 * - Events carry a monotonic `sequence` and a unique `eventId`; this hook
 *   deduplicates by `eventId` so a redelivered event never triggers a double
 *   refetch.
 * - On reconnect the stream restarts from `after`; the consumer is told to
 *   reconcile so nothing is missed even if a batch was dropped while offline.
 */

export type CafeRealtimeStatus =
  | "connecting"
  | "connected"
  | "reconnecting";

export interface CafeRealtimeEvent {
  eventId: string;
  type: string;
  aggregateId: string;
  version: number;
  sequence: number;
  payload: Record<string, unknown>;
}

export interface CafeRealtimeHandlers {
  /** Called once for each non-duplicate business event. */
  onEvent?: (event: CafeRealtimeEvent) => void;
  /** Called after a drop + successful reconnect (full reconcile). */
  onReconnect?: () => void;
}

/**
 * Pure put-together for a deduping event filter, kept separate from the hook so
 * the realtime idempotency behaviour is directly unit-testable.
 */
export function dedupeCafeEvents() {
  const seen = new Set<string>();
  return {
    /** Returns true when the event id was already delivered (dropped). */
    isDuplicate(eventId: string): boolean {
      return seen.has(eventId);
    },
    /** Marks an event as delivered; returns true if it was new (not duplicate). */
    accept(eventId: string): boolean {
      if (seen.has(eventId)) return false;
      seen.add(eventId);
      return true;
    },
  };
}

/** Tracks the highest sequence seen (resume marker). */
export function createSequenceTracker(initial = 0) {
  let latest = initial;
  return {
    advance(sequence: number): number {
      if (sequence > latest) latest = sequence;
      return latest;
    },
    get latest() {
      return latest;
    },
  };
}

export function useCafeRealtime(handlersRef: React.MutableRefObject<CafeRealtimeHandlers>) {
  const [status, setStatus] = useState<CafeRealtimeStatus>("connecting");
  const seenRef = useRef(dedupeCafeEvents());
  const lastSeqRef = useRef(createSequenceTracker(0));
  const wasDisconnectedRef = useRef<boolean>(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let disposed = false;

    const connect = () => {
      setStatus("connecting");
      es = new EventSource(`/api/cafe/events?after=${lastSeqRef.current.latest}`);

      es.addEventListener("cafe:event", (evt) => {
        if (disposed) return;
        let parsed: CafeRealtimeEvent;
        try {
          parsed = JSON.parse((evt as MessageEvent).data);
        } catch {
          return;
        }
        if (!seenRef.current.accept(parsed.eventId)) return;
        lastSeqRef.current.advance(parsed.sequence);
        handlersRef.current.onEvent?.(parsed);
      });

      es.onopen = () => {
        if (disposed) return;
        if (wasDisconnectedRef.current) {
          wasDisconnectedRef.current = false;
          handlersRef.current.onReconnect?.();
        }
        setStatus("connected");
      };

      es.onerror = () => {
        if (disposed) return;
        wasDisconnectedRef.current = true;
        setStatus("reconnecting");
      };
    };

    connect();

    return () => {
      disposed = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status };
}

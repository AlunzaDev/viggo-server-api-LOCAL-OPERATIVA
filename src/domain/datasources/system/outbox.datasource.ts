/** A local change waiting to be (or already) delivered to ADMINISTRATIVO. */
export interface OutboxEvent {
  eventId: string;
  /** "<aggregate>.created" | "<aggregate>.updated", e.g. "ticket.updated". */
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  /** The row as stored when the change happened. */
  payload: Record<string, unknown>;
  occurredAt: number;
  sourcePosition?: string;
  attempts: number;
  nextAttemptAt: number;
  lastError: string;
}

export interface OutboxStats {
  pending: number;
  oldestPendingAt: number | null;
  lastSentAt: number | null;
}

/**
 * Events are written by the database in the same transaction as each change (triggers);
 * this is the delivery side of the queue.
 */
export abstract class OutboxDatasource {
  /** The oldest undelivered events, in the order they happened. */
  abstract nextBatch(limit: number): Promise<OutboxEvent[]>;
  abstract markSent(eventId: string, sentAt: number): Promise<void>;
  abstract markFailed(eventId: string, error: string, nextAttemptAt: number): Promise<void>;
  /** Deletes delivered events older than `before`; returns how many. */
  abstract purgeSentBefore(before: number): Promise<number>;
  abstract stats(): Promise<OutboxStats>;
}

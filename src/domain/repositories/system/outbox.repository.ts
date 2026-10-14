import type { OutboxEvent, OutboxStats } from "../../datasources/system/outbox.datasource";

export abstract class OutboxRepository {
  abstract nextBatch(limit: number): Promise<OutboxEvent[]>;
  abstract markSent(eventId: string, sentAt: number): Promise<void>;
  abstract markFailed(eventId: string, error: string, nextAttemptAt: number): Promise<void>;
  abstract purgeSentBefore(before: number): Promise<number>;
  abstract stats(): Promise<OutboxStats>;
}

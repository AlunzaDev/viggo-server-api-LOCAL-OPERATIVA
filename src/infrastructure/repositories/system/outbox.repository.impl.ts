import type { OutboxDatasource } from "../../../domain/datasources/system/outbox.datasource";
import { OutboxRepository } from "../../../domain/repositories/system/outbox.repository";

export class OutboxRepositoryImpl implements OutboxRepository {
  constructor(private readonly datasource: OutboxDatasource) {}

  nextBatch(limit: number) {
    return this.datasource.nextBatch(limit);
  }

  markSent(eventId: string, sentAt: number) {
    return this.datasource.markSent(eventId, sentAt);
  }

  markFailed(eventId: string, error: string, nextAttemptAt: number) {
    return this.datasource.markFailed(eventId, error, nextAttemptAt);
  }

  purgeSentBefore(before: number) {
    return this.datasource.purgeSentBefore(before);
  }

  stats() {
    return this.datasource.stats();
  }
}

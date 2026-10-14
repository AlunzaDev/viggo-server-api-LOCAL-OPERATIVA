import { PostgresDatabase } from "../../../data/postgres";
import type { OutboxEvent as OutboxEventRow } from "../../../generated/prisma/client";
import {
  OutboxDatasource,
  type OutboxEvent,
  type OutboxStats,
} from "../../../domain/datasources/system/outbox.datasource";
import { isUuid } from "../postgres/prisma-errors";

const toOutboxEvent = (row: OutboxEventRow): OutboxEvent => ({
  eventId: row.eventId,
  sourcePosition: row.position.toString(),
  eventType: row.eventType,
  aggregateType: row.aggregateType,
  aggregateId: row.aggregateId,
  payload: row.payload as Record<string, unknown>,
  occurredAt: row.occurredAt.getTime(),
  attempts: row.attempts,
  nextAttemptAt: row.nextAttemptAt.getTime(),
  lastError: row.lastError,
});

export class OutboxPostgresDatasource implements OutboxDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async nextBatch(limit: number): Promise<OutboxEvent[]> {
    const rows = await this.db.outboxEvent.findMany({
      where: { sentAt: null },
      orderBy: { position: "asc" },
      take: limit,
    });
    return rows.map(toOutboxEvent);
  }

  async markSent(eventId: string, sentAt: number): Promise<void> {
    if (!isUuid(eventId)) return;
    await this.db.outboxEvent.updateMany({
      where: { eventId, sentAt: null },
      data: { sentAt: new Date(sentAt), lastError: "" },
    });
  }

  async markFailed(eventId: string, error: string, nextAttemptAt: number): Promise<void> {
    if (!isUuid(eventId)) return;
    await this.db.outboxEvent.updateMany({
      where: { eventId, sentAt: null },
      data: { attempts: { increment: 1 }, lastError: error.slice(0, 500), nextAttemptAt: new Date(nextAttemptAt) },
    });
  }

  async purgeSentBefore(before: number): Promise<number> {
    const result = await this.db.outboxEvent.deleteMany({ where: { sentAt: { lt: new Date(before) } } });
    return result.count;
  }

  async stats(): Promise<OutboxStats> {
    const [pending, oldest, lastSent] = await Promise.all([
      this.db.outboxEvent.count({ where: { sentAt: null } }),
      this.db.outboxEvent.findFirst({ where: { sentAt: null }, orderBy: { position: "asc" }, select: { occurredAt: true } }),
      this.db.outboxEvent.findFirst({ where: { sentAt: { not: null } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    ]);
    return {
      pending,
      oldestPendingAt: oldest?.occurredAt.getTime() ?? null,
      lastSentAt: lastSent?.sentAt?.getTime() ?? null,
    };
  }
}

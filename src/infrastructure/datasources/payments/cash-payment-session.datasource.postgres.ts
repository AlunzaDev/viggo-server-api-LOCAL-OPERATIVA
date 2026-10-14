import { PostgresDatabase } from "../../../data/postgres";
import type { CashPaymentSessionStatus, Prisma } from "../../../generated/prisma/client";
import { CashPaymentSessionDatasource } from "../../../domain/datasources/payments/cash-payment-session.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import {
  cashSessionColumns,
  cashSessionEventRow,
  cashSessionInclude,
  toCashSessionEntity,
  type CashSessionValues,
} from "./payments.prisma-mapper";

const ACTIVE_STATUSES: CashPaymentSessionStatus[] = ["created", "pending_cash", "partially_paid"];
const invalidReference = CustomError.badRequest("El ticket, modulo o turno de la sesion no existe");

export class CashPaymentSessionPostgresDatasource extends CashPaymentSessionDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  private async findActive(where: Prisma.CashPaymentSessionWhereInput) {
    const row = await this.db.cashPaymentSession.findFirst({
      where: { ...where, status: { in: ACTIVE_STATUSES } },
      include: cashSessionInclude,
      orderBy: { startedAt: "desc" },
    });
    return row ? toCashSessionEntity(row) : null;
  }

  /** A second open session for the same ticket raises UniqueConstraintError. */
  async create(session: Omit<CashPaymentSessionEntity, "id">): Promise<CashPaymentSessionEntity> {
    const row = await withPrismaErrors(
      () =>
        this.db.$transaction(async (tx) => {
          const created = await tx.cashPaymentSession.create({
            data: cashSessionColumns(session) as Prisma.CashPaymentSessionUncheckedCreateInput,
          });
          if (session.events.length) {
            await tx.cashPaymentSessionEvent.createMany({
              data: session.events.map((event) => cashSessionEventRow(created.id, event)),
            });
          }
          return tx.cashPaymentSession.findUniqueOrThrow({ where: { id: created.id }, include: cashSessionInclude });
        }),
      { foreignKey: invalidReference },
    );
    return toCashSessionEntity(row);
  }

  async findById(id: string): Promise<CashPaymentSessionEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.cashPaymentSession.findUnique({ where: { id }, include: cashSessionInclude });
    return row ? toCashSessionEntity(row) : null;
  }

  findActiveByTicketId(ticketId: string): Promise<CashPaymentSessionEntity | null> {
    if (!isUuid(ticketId)) return Promise.resolve(null);
    return this.findActive({ ticketId });
  }

  findActiveByIdBoleto(idBoleto: string): Promise<CashPaymentSessionEntity | null> {
    return this.findActive({ idBoleto });
  }

  /** Updates the session columns; `events`, when given, are appended (never rewritten). */
  async update(id: string, session: CashSessionValues): Promise<CashPaymentSessionEntity | null> {
    if (!isUuid(id)) return null;
    const { events, ...values } = session;
    const found = await withPrismaErrors(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.cashPaymentSession.updateMany({ where: { id }, data: cashSessionColumns(values) });
          if (!result.count) return false;
          if (events?.length) await this.appendMissingEvents(tx, id, events);
          return true;
        }),
      { foreignKey: invalidReference },
    );
    return found ? this.findById(id) : null;
  }

  async appendEvent(
    id: string,
    event: CashPaymentSessionEntity["events"][number],
  ): Promise<CashPaymentSessionEntity | null> {
    if (!isUuid(id) || !(await this.db.cashPaymentSession.count({ where: { id } }))) return null;
    await this.db.cashPaymentSessionEvent.create({ data: cashSessionEventRow(id, event) });
    return this.findById(id);
  }

  /**
   * Mongo replaced the whole events array on update; services pass the current list plus
   * new events, so only the ones not stored yet are inserted.
   */
  private async appendMissingEvents(
    tx: Prisma.TransactionClient,
    id: string,
    events: CashPaymentSessionEntity["events"],
  ) {
    const stored = await tx.cashPaymentSessionEvent.count({ where: { sessionId: id } });
    const missing = events.slice(stored);
    if (missing.length) {
      await tx.cashPaymentSessionEvent.createMany({ data: missing.map((event) => cashSessionEventRow(id, event)) });
    }
  }
}

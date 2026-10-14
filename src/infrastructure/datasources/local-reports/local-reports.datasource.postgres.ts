import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import {
  LocalReportsDatasource,
  type LocalReportsSnapshotPayload,
} from "../../../domain/datasources/local-reports/local-reports.datasource";
import { toMovementEntity, toShiftEntity } from "../cash-register/cash-register.prisma-mapper";
import { LocalInstallationPostgresDatasource } from "../installation/local-installation.datasource.postgres";
import { toTicketEntity } from "../parking/ticket.prisma-mapper";
import { cashSessionInclude, toCashSessionEntity } from "../payments/payments.prisma-mapper";
import { isUuid } from "../postgres/prisma-errors";

const MAX_RECENT_ROWS = 50;

const sum = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);
/** The ADMINISTRATIVO dashboard reads rows with `_id`, as Mongo returned them. */
const withLegacyId = <T extends { id: string }>(entity: T) => ({ ...entity, _id: entity.id });

export class LocalReportsPostgresDatasource implements LocalReportsDatasource {
  private readonly installations = new LocalInstallationPostgresDatasource();

  private get db() {
    return PostgresDatabase.client;
  }

  getInstallation() {
    return this.installations.findDefault();
  }

  getHealth() {
    return PostgresDatabase.getHealthSnapshot();
  }

  async getSnapshotData(payload: LocalReportsSnapshotPayload) {
    const range = { gte: new Date(payload.from), lte: new Date(payload.to) };
    // A project id that is not a UUID matches nothing (Mongo compared it as text).
    const proyectoId = payload.proyectoId ? (isUuid(payload.proyectoId) ? payload.proyectoId : "00000000-0000-0000-0000-000000000000") : undefined;
    const byProject = proyectoId ? { proyectoId } : {};
    const ticketWhere: Prisma.TicketWhereInput = { ...byProject, horaInicio: range };
    const movementWhere: Prisma.CashRegisterMovementWhereInput = { ...byProject, createdAt: range };

    const [ticketTotals, paidTickets, payments, cashSessions, movements, openShifts, recentTickets, recentSessions, recentMovements] =
      await Promise.all([
        this.db.ticket.aggregate({ where: ticketWhere, _count: { _all: true }, _sum: { monto: true } }),
        this.db.ticket.count({ where: { ...ticketWhere, pagado: true } }),
        this.db.payment.groupBy({ by: ["status"], where: { paidAt: range }, _count: { _all: true }, _sum: { amount: true } }),
        this.db.cashPaymentSession.groupBy({
          by: ["status"],
          where: { startedAt: range },
          _count: { _all: true },
          _sum: { amountExpected: true, amountReceived: true, changeAmount: true },
        }),
        this.db.cashRegisterMovement.groupBy({ by: ["direction"], where: movementWhere, _count: { _all: true }, _sum: { amount: true } }),
        this.db.cashRegisterShift.findMany({
          where: { ...byProject, status: "open" },
          orderBy: { openedAt: "desc" },
          take: MAX_RECENT_ROWS,
        }),
        this.db.ticket.findMany({ where: ticketWhere, orderBy: { horaInicio: "desc" }, take: MAX_RECENT_ROWS }),
        this.db.cashPaymentSession.findMany({
          where: { startedAt: range },
          include: cashSessionInclude,
          orderBy: { startedAt: "desc" },
          take: MAX_RECENT_ROWS,
        }),
        this.db.cashRegisterMovement.findMany({ where: movementWhere, orderBy: { createdAt: "desc" }, take: MAX_RECENT_ROWS }),
      ]);

    const total = ticketTotals._count._all;
    return {
      summary: {
        tickets: { total, paid: paidTickets, unpaid: total - paidTickets, amount: sum(ticketTotals._sum.monto) },
        payments: payments.map((row) => ({ _id: row.status, count: row._count._all, amount: sum(row._sum.amount) })),
        cashSessions: cashSessions.map((row) => ({
          _id: row.status,
          count: row._count._all,
          expected: sum(row._sum.amountExpected),
          received: sum(row._sum.amountReceived),
          change: sum(row._sum.changeAmount),
        })),
        cashMovements: movements.map((row) => ({ _id: row.direction, count: row._count._all, amount: sum(row._sum.amount) })),
        openShifts: openShifts.length,
      },
      openShifts: openShifts.map((row) => withLegacyId(toShiftEntity(row))),
      recent: {
        tickets: recentTickets.map((row) => withLegacyId(toTicketEntity(row))),
        cashSessions: recentSessions.map((row) => withLegacyId(toCashSessionEntity(row))),
        cashMovements: recentMovements.map((row) => withLegacyId(toMovementEntity(row))),
      },
    };
  }
}

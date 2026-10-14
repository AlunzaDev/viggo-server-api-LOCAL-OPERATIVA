import { Prisma } from "../../../generated/prisma/client";
import {
  CashTicketPaymentDatasource,
  type CashPaymentMovementInput,
  type CashPaymentRecordInput,
  type CashSessionInsertionUpdate,
} from "../../../domain/datasources/payments/cash-ticket-payment.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { toShiftEntity } from "../cash-register/cash-register.prisma-mapper";
import { moduloInclude, toModuloEntity } from "../parking/parking.prisma-mapper";
import { toTicketEntity } from "../parking/ticket.prisma-mapper";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { lockRow } from "../postgres/row-locks";
import { prismaDb } from "../system/transaction-runner.postgres";
import {
  cashSessionEventRow,
  cashSessionInclude,
  ticketPaymentRow,
  toCashSessionEntity,
} from "./payments.prisma-mapper";

/**
 * The cash payment flow. Reads of the session and the ticket lock their rows, so two
 * insertions on the same session, or a cash and an app payment of the same ticket,
 * run one after the other and the second sees the first one's result.
 */
export class CashTicketPaymentPostgresDatasource implements CashTicketPaymentDatasource {
  async findModuloById(id: string) {
    if (!isUuid(id)) return null;
    const row = await prismaDb().modulo.findUnique({ where: { id }, include: moduloInclude });
    return row ? toModuloEntity(row) : null;
  }

  async findSessionById(id: string, tx: TransactionContext) {
    if (!isUuid(id)) return null;
    const db = prismaDb(tx);
    await lockRow(db, "cash_payment_sessions", id);
    const row = await db.cashPaymentSession.findUnique({ where: { id }, include: cashSessionInclude });
    return row ? toCashSessionEntity(row) : null;
  }

  async findTicketById(id: string, tx: TransactionContext) {
    if (!isUuid(id)) return null;
    const db = prismaDb(tx);
    await lockRow(db, "tickets", id);
    const row = await db.ticket.findUnique({ where: { id } });
    return row ? toTicketEntity(row) : null;
  }

  async findShiftById(id: string, tx: TransactionContext) {
    if (!isUuid(id)) return null;
    const row = await prismaDb(tx).cashRegisterShift.findUnique({ where: { id } });
    return row ? toShiftEntity(row) : null;
  }

  async applySessionInsertion(id: string, update: CashSessionInsertionUpdate, tx: TransactionContext) {
    if (!isUuid(id)) return null;
    const db = prismaDb(tx);
    const result = await db.cashPaymentSession.updateMany({
      where: { id },
      data: {
        amountReceived: new Prisma.Decimal(update.amountReceived),
        changeAmount: new Prisma.Decimal(update.changeAmount),
        status: update.status,
        ...(update.completedAt !== undefined ? { completedAt: new Date(update.completedAt) } : {}),
      },
    });
    if (!result.count) return null;
    if (update.events.length) {
      // A repeated idempotency key raises UniqueConstraintError and rolls the insertion back.
      await withPrismaErrors(() =>
        db.cashPaymentSessionEvent.createMany({ data: update.events.map((event) => cashSessionEventRow(id, event)) }),
      );
    }
    const row = await db.cashPaymentSession.findUniqueOrThrow({ where: { id }, include: cashSessionInclude });
    return toCashSessionEntity(row);
  }

  async markTicketPaid(id: string, paidAt: number, tx: TransactionContext) {
    await prismaDb(tx).ticket.update({ where: { id }, data: { pagado: true, horaCobro: new Date(paidAt) } });
  }

  async findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext) {
    const row = await prismaDb(tx).payment.findUnique({ where: { providerReference }, select: { id: true } });
    return row?.id ?? null;
  }

  async findProjectById(id: string, tx: TransactionContext) {
    if (!isUuid(id)) return null;
    return prismaDb(tx).proyecto.findUnique({ where: { id }, select: { id: true, nombre: true, ciudad: true } });
  }

  async createPayment(payment: CashPaymentRecordInput, tx: TransactionContext) {
    const row = await withPrismaErrors(() =>
      prismaDb(tx).payment.create({
        data: ticketPaymentRow({ ...payment, concept: "Pago de ticket en POS", rawProviderStatus: "pos_succeeded" }),
        select: { id: true },
      }),
    );
    return row.id;
  }

  async hasMovementForCashPaymentSession(sessionId: string, tx: TransactionContext) {
    if (!isUuid(sessionId)) return false;
    return (await prismaDb(tx).cashRegisterMovement.count({ where: { relatedCashPaymentSessionId: sessionId } })) > 0;
  }

  async createIncomeMovement(movement: CashPaymentMovementInput, tx: TransactionContext) {
    await withPrismaErrors(() =>
      prismaDb(tx).cashRegisterMovement.create({
        data: {
          shiftId: movement.shiftId,
          proyectoId: movement.proyectoId,
          moduloId: movement.moduloId,
          createdByUserId: movement.createdByUserId,
          createdByUserName: movement.createdByUserName ?? "",
          type: "ticket_payment_income",
          direction: "in",
          concept: "Cobro de boleto en efectivo",
          amount: new Prisma.Decimal(movement.amount),
          createdAt: new Date(movement.createdAt),
          relatedTicketId: movement.relatedTicketId,
          relatedPaymentId: movement.relatedPaymentId,
          relatedCashPaymentSessionId: movement.relatedCashPaymentSessionId,
          metadata: movement.metadata as Prisma.InputJsonValue,
        },
      }),
    );
  }
}

import type { Prisma } from "../../../generated/prisma/client";
import {
  MobileCommandDatasource,
  type CloudTicketPaymentInput,
} from "../../../domain/datasources/mobile/mobile-command.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { toTicketEntity } from "../parking/ticket.prisma-mapper";
import { ticketPaymentRow } from "../payments/payments.prisma-mapper";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { lockRow } from "../postgres/row-locks";
import { prismaDb } from "../system/transaction-runner.postgres";

export class MobileCommandPostgresDatasource implements MobileCommandDatasource {
  async findReceipt(operationId: string) {
    const receipt = await prismaDb().mobileCommandReceipt.findUnique({ where: { operationId } });
    return receipt ? { result: receipt.result as unknown } : null;
  }

  /** Insert-if-absent: when another delivery stored its result first, that one is returned. */
  async saveReceipt(operationId: string, type: string, result: unknown) {
    const db = prismaDb();
    // ON CONFLICT DO NOTHING: safe even when two deliveries finish at the same time.
    await db.mobileCommandReceipt.createMany({
      data: [{ operationId, type, result: (result ?? {}) as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    const receipt = await db.mobileCommandReceipt.findUniqueOrThrow({ where: { operationId } });
    return { result: receipt.result as unknown };
  }

  async findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext) {
    const row = await prismaDb(tx).payment.findUnique({ where: { providerReference }, select: { id: true } });
    return row?.id ?? null;
  }

  /** Locks the ticket so a concurrent cash payment of the same ticket waits for this one. */
  async findTicketById(id: string, tx: TransactionContext) {
    if (!isUuid(id)) return null;
    const db = prismaDb(tx);
    await lockRow(db, "tickets", id);
    const row = await db.ticket.findUnique({ where: { id } });
    return row ? toTicketEntity(row) : null;
  }

  async createCloudTicketPayment(payment: CloudTicketPaymentInput, tx: TransactionContext) {
    await withPrismaErrors(() =>
      prismaDb(tx).payment.create({
        data: ticketPaymentRow({
          user: payment.user,
          concept: "Pago de ticket desde Viggo App",
          amount: payment.amount,
          currency: payment.currency,
          paidAt: payment.paidAt,
          providerReference: payment.providerReference,
          ticketId: payment.ticketId,
          parking: { id: payment.proyectoId },
          rawProviderStatus: "succeeded",
        }),
      }),
    );
  }

  async markTicketPaid(id: string, paidAt: number, tx: TransactionContext) {
    await prismaDb(tx).ticket.update({ where: { id }, data: { pagado: true, horaCobro: new Date(paidAt) } });
  }
}

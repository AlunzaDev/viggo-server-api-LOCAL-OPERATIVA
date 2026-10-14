import { TicketModel } from "../../../data/mongo";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { MobileCommandReceiptModel } from "../../../data/mongo/models/sync/mobile-command-receipt.schema";
import {
  MobileCommandDatasource,
  type CloudTicketPaymentInput,
} from "../../../domain/datasources/mobile/mobile-command.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { mongoSession } from "../system/transaction-runner.mongo";

export class MobileCommandMongoDatasource implements MobileCommandDatasource {
  async findReceipt(operationId: string) {
    const receipt = await MobileCommandReceiptModel.findOne({ operationId }).lean();
    return receipt ? { result: receipt.result } : null;
  }

  async saveReceipt(operationId: string, type: string, result: unknown) {
    const receipt = await MobileCommandReceiptModel.findOneAndUpdate(
      { operationId },
      { $setOnInsert: { operationId, type, result, processedAt: Date.now() } },
      { upsert: true, new: true },
    ).lean();
    return { result: receipt?.result ?? {} };
  }

  async findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext) {
    const payment = await PaymentModel.findOne({ providerReference }).session(mongoSession(tx) ?? null);
    return payment ? String(payment._id) : null;
  }

  async findTicketById(id: string, tx: TransactionContext) {
    const ticket = await TicketModel.findById(id).session(mongoSession(tx) ?? null);
    return ticket ? TicketEntity.fromObject(ticket.toObject()) : null;
  }

  async createCloudTicketPayment(payment: CloudTicketPaymentInput, tx: TransactionContext) {
    await PaymentModel.create(
      [
        {
          user: payment.user,
          type: "ticket",
          concept: "Pago de ticket desde Viggo App",
          amount: payment.amount,
          currency: payment.currency,
          status: "succeeded",
          paidAt: payment.paidAt,
          providerReference: payment.providerReference,
          reference: { type: "ticket", id: payment.ticketId },
          parking: { id: payment.proyectoId },
          rawProviderStatus: "succeeded",
        },
      ],
      { session: mongoSession(tx) },
    );
  }

  async markTicketPaid(id: string, paidAt: number, tx: TransactionContext) {
    await TicketModel.findByIdAndUpdate(id, { pagado: true, horaCobro: paidAt }, { session: mongoSession(tx) });
  }
}

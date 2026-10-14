import { CashRegisterMovementModel } from "../../../data/mongo/models/cash-register/cash-register-movement.schema";
import { CashRegisterShiftModel } from "../../../data/mongo/models/cash-register/cash-register-shift.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { TicketModel } from "../../../data/mongo/models/parking/ticket.schema";
import { CashPaymentSessionModel } from "../../../data/mongo/models/payments/cash-payment-session.schema";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import {
  CashTicketPaymentDatasource,
  type CashPaymentMovementInput,
  type CashPaymentRecordInput,
  type CashSessionInsertionUpdate,
} from "../../../domain/datasources/payments/cash-ticket-payment.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { CashRegisterShiftEntity } from "../../../domain/entities/cash-register/cash-register-shift.entity";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";
import { mongoSession } from "../system/transaction-runner.mongo";

export class CashTicketPaymentMongoDatasource implements CashTicketPaymentDatasource {
  async findModuloById(id: string) {
    const document = await ModuloModel.findById(id);
    return document ? ModuloEntity.fromObject(document.toObject()) : null;
  }

  async findSessionById(id: string, tx: TransactionContext) {
    const document = await CashPaymentSessionModel.findById(id).session(mongoSession(tx) ?? null);
    return document ? CashPaymentSessionEntity.fromObject(document.toObject()) : null;
  }

  async findTicketById(id: string, tx: TransactionContext) {
    const document = await TicketModel.findById(id).session(mongoSession(tx) ?? null);
    return document ? TicketEntity.fromObject(document.toObject()) : null;
  }

  async findShiftById(id: string, tx: TransactionContext) {
    const document = await CashRegisterShiftModel.findById(id).session(mongoSession(tx) ?? null);
    return document ? CashRegisterShiftEntity.fromObject(document.toObject()) : null;
  }

  async applySessionInsertion(id: string, update: CashSessionInsertionUpdate, tx: TransactionContext) {
    const document = await CashPaymentSessionModel.findByIdAndUpdate(
      id,
      {
        $set: {
          amountReceived: update.amountReceived,
          changeAmount: update.changeAmount,
          status: update.status,
          completedAt: update.completedAt,
        },
        $push: { events: { $each: update.events } },
      },
      { new: true, session: mongoSession(tx) },
    );
    return document ? CashPaymentSessionEntity.fromObject(document.toObject()) : null;
  }

  async markTicketPaid(id: string, paidAt: number, tx: TransactionContext) {
    await TicketModel.findByIdAndUpdate(id, { pagado: true, horaCobro: paidAt }, { session: mongoSession(tx) });
  }

  async findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext) {
    const document = await PaymentModel.findOne({ providerReference }).session(mongoSession(tx) ?? null);
    return document ? String(document._id) : null;
  }

  async findProjectById(id: string, tx: TransactionContext) {
    const document = await ProyectoModel.findById(id).session(mongoSession(tx) ?? null);
    return document
      ? { id: String(document._id), nombre: String(document.get("nombre") ?? ""), ciudad: String(document.get("ciudad") ?? "") }
      : null;
  }

  async createPayment(payment: CashPaymentRecordInput, tx: TransactionContext) {
    const [document] = await PaymentModel.create(
      [
        {
          user: payment.user,
          type: "ticket",
          concept: "Pago de ticket en POS",
          amount: payment.amount,
          currency: payment.currency,
          status: "succeeded",
          paidAt: payment.paidAt,
          providerReference: payment.providerReference,
          paymentMethod: undefined,
          reference: { type: "ticket", id: payment.ticketId },
          parking: payment.parking,
          rawProviderStatus: "pos_succeeded",
        },
      ],
      { session: mongoSession(tx) },
    );
    return String(document._id);
  }

  async hasMovementForCashPaymentSession(sessionId: string, tx: TransactionContext) {
    const document = await CashRegisterMovementModel.findOne({ relatedCashPaymentSessionId: sessionId }).session(
      mongoSession(tx) ?? null,
    );
    return Boolean(document);
  }

  async createIncomeMovement(movement: CashPaymentMovementInput, tx: TransactionContext) {
    await CashRegisterMovementModel.create(
      [
        {
          ...movement,
          type: "ticket_payment_income",
          direction: "in",
          concept: "Cobro de boleto en efectivo",
        },
      ],
      { session: mongoSession(tx) },
    );
  }
}

import { startSession as startMongoSession } from "mongoose";
import { CashRegisterMovementModel } from "../../../data/mongo/models/cash-register/cash-register-movement.schema";
import { CashRegisterShiftModel } from "../../../data/mongo/models/cash-register/cash-register-shift.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { TicketModel } from "../../../data/mongo/models/parking/ticket.schema";
import { CashPaymentSessionModel } from "../../../data/mongo/models/payments/cash-payment-session.schema";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { CashTicketPaymentDatasource } from "../../../domain/datasources/payments/cash-ticket-payment.datasource";

export class CashTicketPaymentMongoDatasource implements CashTicketPaymentDatasource {
  startSession() {
    return startMongoSession();
  }

  findModuloById(id: string) {
    return ModuloModel.findById(id);
  }

  findSessionById(id: string, session: unknown) {
    return CashPaymentSessionModel.findById(id).session(session as never);
  }

  findTicketById(id: string, session: unknown) {
    return TicketModel.findById(id).session(session as never);
  }

  findShiftById(id: string, session: unknown) {
    return CashRegisterShiftModel.findById(id).session(session as never);
  }

  updateSession(id: string, update: object, session: unknown) {
    return CashPaymentSessionModel.findByIdAndUpdate(id, update, {
      new: true,
      session: session as never,
    });
  }

  markTicketPaid(id: string, paidAt: number, session: unknown) {
    return TicketModel.findByIdAndUpdate(
      id,
      { pagado: true, horaCobro: paidAt },
      { session: session as never },
    );
  }

  findPaymentByProviderReference(providerReference: string, session: unknown) {
    return PaymentModel.findOne({ providerReference }).session(session as never);
  }

  findProjectById(id: unknown, session: unknown) {
    return ProyectoModel.findById(id).session(session as never);
  }

  async createPayment(payload: object, session: unknown) {
    const [paymentDocument] = await PaymentModel.create([payload], {
      session: session as never,
    });
    return paymentDocument;
  }

  findMovementByCashPaymentSessionId(sessionId: string, session: unknown) {
    return CashRegisterMovementModel.findOne({
      relatedCashPaymentSessionId: sessionId,
    }).session(session as never);
  }

  createMovement(payload: object, session: unknown) {
    return CashRegisterMovementModel.create([payload], {
      session: session as never,
    });
  }
}

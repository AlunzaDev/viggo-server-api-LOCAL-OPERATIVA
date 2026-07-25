import type { CashTicketPaymentDatasource } from "../../../domain/datasources/payments/cash-ticket-payment.datasource";
import { CashTicketPaymentRepository } from "../../../domain/repository/payments/cash-ticket-payment.repository";

export class CashTicketPaymentRepositoryImpl implements CashTicketPaymentRepository {
  constructor(private readonly datasource: CashTicketPaymentDatasource) {}

  startSession() {
    return this.datasource.startSession();
  }

  findModuloById(id: string) {
    return this.datasource.findModuloById(id);
  }

  findSessionById(id: string, session: unknown) {
    return this.datasource.findSessionById(id, session);
  }

  findTicketById(id: string, session: unknown) {
    return this.datasource.findTicketById(id, session);
  }

  findShiftById(id: string, session: unknown) {
    return this.datasource.findShiftById(id, session);
  }

  updateSession(id: string, update: object, session: unknown) {
    return this.datasource.updateSession(id, update, session);
  }

  markTicketPaid(id: string, paidAt: number, session: unknown) {
    return this.datasource.markTicketPaid(id, paidAt, session);
  }

  findPaymentByProviderReference(providerReference: string, session: unknown) {
    return this.datasource.findPaymentByProviderReference(providerReference, session);
  }

  findProjectById(id: unknown, session: unknown) {
    return this.datasource.findProjectById(id, session);
  }

  createPayment(payload: object, session: unknown) {
    return this.datasource.createPayment(payload, session);
  }

  findMovementByCashPaymentSessionId(sessionId: string, session: unknown) {
    return this.datasource.findMovementByCashPaymentSessionId(sessionId, session);
  }

  createMovement(payload: object, session: unknown) {
    return this.datasource.createMovement(payload, session);
  }
}

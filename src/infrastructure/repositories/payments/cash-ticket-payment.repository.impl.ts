import type {
  CashPaymentMovementInput,
  CashPaymentRecordInput,
  CashSessionInsertionUpdate,
  CashTicketPaymentDatasource,
} from "../../../domain/datasources/payments/cash-ticket-payment.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { CashTicketPaymentRepository } from "../../../domain/repositories/payments/cash-ticket-payment.repository";

export class CashTicketPaymentRepositoryImpl implements CashTicketPaymentRepository {
  constructor(private readonly datasource: CashTicketPaymentDatasource) {}

  findModuloById(id: string) {
    return this.datasource.findModuloById(id);
  }

  findSessionById(id: string, tx: TransactionContext) {
    return this.datasource.findSessionById(id, tx);
  }

  findTicketById(id: string, tx: TransactionContext) {
    return this.datasource.findTicketById(id, tx);
  }

  findShiftById(id: string, tx: TransactionContext) {
    return this.datasource.findShiftById(id, tx);
  }

  applySessionInsertion(id: string, update: CashSessionInsertionUpdate, tx: TransactionContext) {
    return this.datasource.applySessionInsertion(id, update, tx);
  }

  markTicketPaid(id: string, paidAt: number, tx: TransactionContext) {
    return this.datasource.markTicketPaid(id, paidAt, tx);
  }

  findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext) {
    return this.datasource.findPaymentIdByProviderReference(providerReference, tx);
  }

  findProjectById(id: string, tx: TransactionContext) {
    return this.datasource.findProjectById(id, tx);
  }

  createPayment(payment: CashPaymentRecordInput, tx: TransactionContext) {
    return this.datasource.createPayment(payment, tx);
  }

  hasMovementForCashPaymentSession(sessionId: string, tx: TransactionContext) {
    return this.datasource.hasMovementForCashPaymentSession(sessionId, tx);
  }

  createIncomeMovement(movement: CashPaymentMovementInput, tx: TransactionContext) {
    return this.datasource.createIncomeMovement(movement, tx);
  }
}

import type {
  CashPaymentMovementInput,
  CashPaymentRecordInput,
  CashSessionInsertionUpdate,
} from "../../datasources/payments/cash-ticket-payment.datasource";
import type { TransactionContext } from "../../datasources/system/transaction";
import type { CashRegisterShiftEntity } from "../../entities/cash-register/cash-register-shift.entity";
import type { ModuloEntity } from "../../entities/parking/modulo.entity";
import type { TicketEntity } from "../../entities/parking/ticket.entity";
import type { CashPaymentSessionEntity } from "../../entities/payments/cash-payment-session.entity";

export abstract class CashTicketPaymentRepository {
  abstract findModuloById(id: string): Promise<ModuloEntity | null>;
  abstract findSessionById(id: string, tx: TransactionContext): Promise<CashPaymentSessionEntity | null>;
  abstract findTicketById(id: string, tx: TransactionContext): Promise<TicketEntity | null>;
  abstract findShiftById(id: string, tx: TransactionContext): Promise<CashRegisterShiftEntity | null>;
  abstract applySessionInsertion(
    id: string,
    update: CashSessionInsertionUpdate,
    tx: TransactionContext,
  ): Promise<CashPaymentSessionEntity | null>;
  abstract markTicketPaid(id: string, paidAt: number, tx: TransactionContext): Promise<void>;
  abstract findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext): Promise<string | null>;
  abstract findProjectById(
    id: string,
    tx: TransactionContext,
  ): Promise<{ id: string; nombre: string; ciudad: string } | null>;
  abstract createPayment(payment: CashPaymentRecordInput, tx: TransactionContext): Promise<string>;
  abstract hasMovementForCashPaymentSession(sessionId: string, tx: TransactionContext): Promise<boolean>;
  abstract createIncomeMovement(movement: CashPaymentMovementInput, tx: TransactionContext): Promise<void>;
}

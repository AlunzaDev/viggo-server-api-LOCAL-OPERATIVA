import type { CashRegisterShiftEntity } from "../../entities/cash-register/cash-register-shift.entity";
import type { ModuloEntity } from "../../entities/parking/modulo.entity";
import type { TicketEntity } from "../../entities/parking/ticket.entity";
import type { CashPaymentSessionEntity } from "../../entities/payments/cash-payment-session.entity";
import type { TransactionContext } from "../system/transaction";

/** Fields written when cash is inserted into a payment session. */
export interface CashSessionInsertionUpdate {
  amountReceived: number;
  changeAmount: number;
  status: "paid" | "partially_paid";
  completedAt?: number;
  events: CashPaymentSessionEntity["events"];
}

export interface CashPaymentRecordInput {
  user: string;
  amount: number;
  currency: string;
  paidAt: number;
  providerReference: string;
  ticketId: string;
  parking?: { id: string; name: string; city: string };
}

export interface CashPaymentMovementInput {
  shiftId: string;
  proyectoId: string;
  moduloId: string;
  createdByUserId: string;
  createdByUserName?: string;
  amount: number;
  createdAt: number;
  relatedTicketId: string;
  relatedPaymentId: string;
  relatedCashPaymentSessionId: string;
  metadata: Record<string, unknown>;
}

/**
 * Reads and writes of the cash payment flow. Every method that takes `tx` runs inside the
 * caller's transaction (see TransactionRunner), so the whole payment commits atomically.
 */
export abstract class CashTicketPaymentDatasource {
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
  /** Id of the payment already recorded for this provider reference, if any. */
  abstract findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext): Promise<string | null>;
  abstract findProjectById(
    id: string,
    tx: TransactionContext,
  ): Promise<{ id: string; nombre: string; ciudad: string } | null>;
  /** Records a successful cash payment and returns its id. */
  abstract createPayment(payment: CashPaymentRecordInput, tx: TransactionContext): Promise<string>;
  abstract hasMovementForCashPaymentSession(sessionId: string, tx: TransactionContext): Promise<boolean>;
  abstract createIncomeMovement(movement: CashPaymentMovementInput, tx: TransactionContext): Promise<void>;
}

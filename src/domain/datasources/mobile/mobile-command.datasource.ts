import type { TicketEntity } from "../../entities/parking/ticket.entity";
import type { TransactionContext } from "../system/transaction";

export interface CloudTicketPaymentInput {
  user: string;
  ticketId: string;
  proyectoId: string;
  amount: number;
  currency: string;
  paidAt: number;
  providerReference: string;
}

/** Storage used to execute commands sent by ADMINISTRATIVO (mobile app operations). */
export abstract class MobileCommandDatasource {
  /** Result of an already executed command, so a re-delivered command is not run twice. */
  abstract findReceipt(operationId: string): Promise<{ result: unknown } | null>;
  /** Stores the result; if another delivery stored it first, returns that one. */
  /** With `tx`, the receipt commits (or rolls back) with the command's own changes. */
  abstract saveReceipt(operationId: string, type: string, result: unknown, tx?: TransactionContext): Promise<{ result: unknown }>;

  abstract findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext): Promise<string | null>;
  abstract findTicketById(id: string, tx: TransactionContext): Promise<TicketEntity | null>;
  abstract createCloudTicketPayment(payment: CloudTicketPaymentInput, tx: TransactionContext): Promise<void>;
  abstract markTicketPaid(id: string, paidAt: number, tx: TransactionContext): Promise<void>;
}

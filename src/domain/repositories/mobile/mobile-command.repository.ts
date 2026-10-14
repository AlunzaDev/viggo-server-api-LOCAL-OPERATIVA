import type { CloudTicketPaymentInput } from "../../datasources/mobile/mobile-command.datasource";
import type { TransactionContext } from "../../datasources/system/transaction";
import type { TicketEntity } from "../../entities/parking/ticket.entity";

export abstract class MobileCommandRepository {
  abstract findReceipt(operationId: string): Promise<{ result: unknown } | null>;
  abstract saveReceipt(operationId: string, type: string, result: unknown): Promise<{ result: unknown }>;
  abstract findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext): Promise<string | null>;
  abstract findTicketById(id: string, tx: TransactionContext): Promise<TicketEntity | null>;
  abstract createCloudTicketPayment(payment: CloudTicketPaymentInput, tx: TransactionContext): Promise<void>;
  abstract markTicketPaid(id: string, paidAt: number, tx: TransactionContext): Promise<void>;
}

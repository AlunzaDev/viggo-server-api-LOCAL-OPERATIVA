import type {
  CloudTicketPaymentInput,
  MobileCommandDatasource,
} from "../../../domain/datasources/mobile/mobile-command.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { MobileCommandRepository } from "../../../domain/repositories/mobile/mobile-command.repository";

export class MobileCommandRepositoryImpl implements MobileCommandRepository {
  constructor(private readonly datasource: MobileCommandDatasource) {}

  findReceipt(operationId: string) {
    return this.datasource.findReceipt(operationId);
  }

  saveReceipt(operationId: string, type: string, result: unknown) {
    return this.datasource.saveReceipt(operationId, type, result);
  }

  findPaymentIdByProviderReference(providerReference: string, tx: TransactionContext) {
    return this.datasource.findPaymentIdByProviderReference(providerReference, tx);
  }

  findTicketById(id: string, tx: TransactionContext) {
    return this.datasource.findTicketById(id, tx);
  }

  createCloudTicketPayment(payment: CloudTicketPaymentInput, tx: TransactionContext) {
    return this.datasource.createCloudTicketPayment(payment, tx);
  }

  markTicketPaid(id: string, paidAt: number, tx: TransactionContext) {
    return this.datasource.markTicketPaid(id, paidAt, tx);
  }
}

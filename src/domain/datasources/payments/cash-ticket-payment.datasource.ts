export abstract class CashTicketPaymentDatasource {
  abstract startSession(): Promise<any>;
  abstract findModuloById(id: string): any;
  abstract findSessionById(id: string, session: unknown): any;
  abstract findTicketById(id: string, session: unknown): any;
  abstract findShiftById(id: string, session: unknown): any;
  abstract updateSession(id: string, update: object, session: unknown): any;
  abstract markTicketPaid(id: string, paidAt: number, session: unknown): any;
  abstract findPaymentByProviderReference(providerReference: string, session: unknown): any;
  abstract findProjectById(id: unknown, session: unknown): any;
  abstract createPayment(payload: object, session: unknown): Promise<any>;
  abstract findMovementByCashPaymentSessionId(sessionId: string, session: unknown): any;
  abstract createMovement(payload: object, session: unknown): any;
}

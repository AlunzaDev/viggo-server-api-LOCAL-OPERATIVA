import {
  Prisma,
  type CashPaymentSessionEventType,
  type CashPaymentSessionStatus,
  type Payment as PaymentRow,
  type PaymentStatus,
  type PaymentType,
} from "../../../generated/prisma/client";
import {
  CashPaymentSessionEntity,
  type CashPaymentSessionEvent,
} from "../../../domain/entities/payments/cash-payment-session.entity";
import { PaymentEntity } from "../../../domain/entities/payments/payment.entity";
import { toEpochMs } from "../postgres/prisma-errors";

const decimal = (value: number) => new Prisma.Decimal(value);
const optionalDate = (value: number | undefined) => (value === undefined ? undefined : new Date(value));

// ───────────────────────────── Payment ─────────────────────────────

export const toPaymentEntity = (row: PaymentRow): PaymentEntity =>
  PaymentEntity.fromObject({
    id: row.id,
    user: row.usuarioId,
    type: row.type,
    concept: row.concept,
    amount: row.amount.toNumber(),
    currency: row.currency,
    status: row.status,
    paidAt: row.paidAt.getTime(),
    providerReference: row.providerReference ?? undefined,
    paymentMethod: row.paymentMethodBrand || row.paymentMethodLast4
      ? { brand: row.paymentMethodBrand, last4: row.paymentMethodLast4 }
      : undefined,
    reference: { type: row.referenceType, id: row.referenceId },
    parking: row.proyectoId || row.parkingName || row.parkingCity
      ? { id: row.proyectoId, name: row.parkingName, city: row.parkingCity }
      : undefined,
    rawProviderStatus: row.rawProviderStatus,
  });

export type PaymentValues = Partial<Omit<PaymentEntity, "id">>;

export const paymentColumns = (payment: PaymentValues) => {
  const data: Prisma.PaymentUncheckedUpdateInput = {};
  if (payment.user !== undefined) data.usuarioId = payment.user;
  if (payment.type !== undefined) data.type = payment.type as PaymentType;
  if (payment.concept !== undefined) data.concept = payment.concept;
  if (payment.amount !== undefined) data.amount = decimal(payment.amount);
  if (payment.currency !== undefined) data.currency = payment.currency.toUpperCase();
  if (payment.status !== undefined) data.status = payment.status as PaymentStatus;
  if (payment.paidAt !== undefined) data.paidAt = new Date(payment.paidAt);
  if (payment.providerReference !== undefined) data.providerReference = payment.providerReference || null;
  if (payment.paymentMethod !== undefined) {
    data.paymentMethodBrand = payment.paymentMethod?.brand ?? "";
    data.paymentMethodLast4 = (payment.paymentMethod?.last4 ?? "").slice(-4);
  }
  if (payment.reference !== undefined) {
    data.referenceType = payment.reference.type as PaymentType;
    data.referenceId = payment.reference.id;
  }
  if (payment.parking !== undefined) {
    data.proyectoId = payment.parking?.id ?? "";
    data.parkingName = payment.parking?.name ?? "";
    data.parkingCity = payment.parking?.city ?? "";
  }
  if (payment.rawProviderStatus !== undefined) data.rawProviderStatus = payment.rawProviderStatus;
  return data;
};

/** A succeeded ticket payment (cash at the POS or confirmed by the cloud). */
export const ticketPaymentRow = (payment: {
  user: string;
  concept: string;
  amount: number;
  currency: string;
  paidAt: number;
  providerReference: string;
  ticketId: string;
  parking?: { id?: string; name?: string; city?: string };
  rawProviderStatus: string;
}): Prisma.PaymentUncheckedCreateInput => ({
  usuarioId: payment.user,
  type: "ticket",
  concept: payment.concept,
  amount: decimal(payment.amount),
  currency: payment.currency.toUpperCase(),
  status: "succeeded",
  paidAt: new Date(payment.paidAt),
  providerReference: payment.providerReference,
  referenceType: "ticket",
  referenceId: payment.ticketId,
  proyectoId: payment.parking?.id ?? "",
  parkingName: payment.parking?.name ?? "",
  parkingCity: payment.parking?.city ?? "",
  rawProviderStatus: payment.rawProviderStatus,
});

// ─────────────────────── Cash payment session ───────────────────────

export const cashSessionInclude = {
  events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.CashPaymentSessionInclude;
export type CashSessionRow = Prisma.CashPaymentSessionGetPayload<{ include: typeof cashSessionInclude }>;

export const toCashSessionEntity = (row: CashSessionRow): CashPaymentSessionEntity =>
  CashPaymentSessionEntity.fromObject({
    id: row.id,
    ticketId: row.ticketId,
    idBoleto: row.idBoleto,
    status: row.status,
    amountExpected: row.amountExpected.toNumber(),
    amountReceived: row.amountReceived.toNumber(),
    changeAmount: row.changeAmount.toNumber(),
    moduloId: row.moduloId,
    moduloIdentificador: row.moduloIdentificador || undefined,
    moduloNombre: row.moduloNombre || undefined,
    deviceId: row.deviceId || undefined,
    cashRegisterShiftId: row.cashRegisterShiftId ?? undefined,
    startedAt: row.startedAt.getTime(),
    completedAt: toEpochMs(row.completedAt),
    cancelledAt: toEpochMs(row.cancelledAt),
    events: row.events.map((event) => ({
      type: event.type,
      amount: event.amount === null ? undefined : event.amount.toNumber(),
      payload: (event.payload ?? undefined) as Record<string, unknown> | undefined,
      createdAt: event.createdAt.getTime(),
    })),
  });

export type CashSessionValues = Partial<Omit<CashPaymentSessionEntity, "id">>;

export const cashSessionColumns = (session: CashSessionValues) => {
  const data: Prisma.CashPaymentSessionUncheckedUpdateInput = {};
  if (session.ticketId !== undefined) data.ticketId = session.ticketId;
  if (session.idBoleto !== undefined) data.idBoleto = session.idBoleto;
  if (session.status !== undefined) data.status = session.status as CashPaymentSessionStatus;
  if (session.amountExpected !== undefined) data.amountExpected = decimal(session.amountExpected);
  if (session.amountReceived !== undefined) data.amountReceived = decimal(session.amountReceived);
  if (session.changeAmount !== undefined) data.changeAmount = decimal(session.changeAmount);
  if (session.moduloId !== undefined) data.moduloId = session.moduloId;
  if (session.moduloIdentificador !== undefined) data.moduloIdentificador = session.moduloIdentificador;
  if (session.moduloNombre !== undefined) data.moduloNombre = session.moduloNombre;
  if (session.deviceId !== undefined) data.deviceId = session.deviceId;
  if (session.cashRegisterShiftId !== undefined) data.cashRegisterShiftId = session.cashRegisterShiftId || null;
  if (session.startedAt !== undefined) data.startedAt = new Date(session.startedAt);
  if (session.completedAt !== undefined) data.completedAt = optionalDate(session.completedAt);
  if (session.cancelledAt !== undefined) data.cancelledAt = optionalDate(session.cancelledAt);
  return data;
};

/** The device's idempotency key travels in the event payload; it gets its own column. */
export const cashSessionEventRow = (sessionId: string, event: CashPaymentSessionEvent) => {
  const idempotencyKey = event.payload?.idempotencyKey;
  return {
    sessionId,
    type: event.type as CashPaymentSessionEventType,
    amount: event.amount === undefined || event.amount === null ? null : decimal(event.amount),
    idempotencyKey: typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null,
    payload: (event.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    createdAt: new Date(event.createdAt),
  };
};

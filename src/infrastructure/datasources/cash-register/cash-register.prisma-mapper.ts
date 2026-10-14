import {
  Prisma,
  type CashMovementDirection,
  type CashRegisterCut as CutRow,
  type CashRegisterCutStatus,
  type CashRegisterMovement as MovementRow,
  type CashRegisterMovementType,
  type CashRegisterShift as ShiftRow,
  type CashRegisterShiftStatus,
} from "../../../generated/prisma/client";
import { CashRegisterCountEntity } from "../../../domain/entities/cash-register/cash-register-count.entity";
import { CashRegisterCutEntity } from "../../../domain/entities/cash-register/cash-register-cut.entity";
import { CashRegisterMovementEntity } from "../../../domain/entities/cash-register/cash-register-movement.entity";
import { CashRegisterShiftEntity } from "../../../domain/entities/cash-register/cash-register-shift.entity";
import { toEpochMs } from "../postgres/prisma-errors";

const decimal = (value: number) => new Prisma.Decimal(value);
const optionalNumber = (value: Prisma.Decimal | null) => (value === null ? undefined : value.toNumber());
const optionalText = (value: string) => value || undefined;
const json = (value: Record<string, unknown> | undefined) =>
  (value ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;

// ───────────────────────────── Shift ─────────────────────────────

export const toShiftEntity = (row: ShiftRow): CashRegisterShiftEntity =>
  CashRegisterShiftEntity.fromObject({
    id: row.id,
    proyectoId: row.proyectoId,
    moduloId: row.moduloId,
    moduloIdentificador: optionalText(row.moduloIdentificador),
    moduloNombre: optionalText(row.moduloNombre),
    openedByUserId: row.openedByUserId,
    openedByUserName: optionalText(row.openedByUserName),
    status: row.status,
    openingAmount: row.openingAmount.toNumber(),
    openedAt: row.openedAt.getTime(),
    closedAt: toEpochMs(row.closedAt),
    closingAmountExpected: optionalNumber(row.closingAmountExpected),
    closingAmountCounted: optionalNumber(row.closingAmountCounted),
    differenceAmount: optionalNumber(row.differenceAmount),
    notes: optionalText(row.notes),
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
  });

export type ShiftValues = Partial<Omit<CashRegisterShiftEntity, "id">>;

export const shiftColumns = (shift: ShiftValues) => {
  const data: Prisma.CashRegisterShiftUncheckedUpdateInput = {};
  if (shift.proyectoId !== undefined) data.proyectoId = shift.proyectoId;
  if (shift.moduloId !== undefined) data.moduloId = shift.moduloId;
  if (shift.moduloIdentificador !== undefined) data.moduloIdentificador = shift.moduloIdentificador;
  if (shift.moduloNombre !== undefined) data.moduloNombre = shift.moduloNombre;
  if (shift.openedByUserId !== undefined) data.openedByUserId = shift.openedByUserId;
  if (shift.openedByUserName !== undefined) data.openedByUserName = shift.openedByUserName;
  if (shift.status !== undefined) data.status = shift.status as CashRegisterShiftStatus;
  if (shift.openingAmount !== undefined) data.openingAmount = decimal(shift.openingAmount);
  if (shift.openedAt !== undefined) data.openedAt = new Date(shift.openedAt);
  if (shift.closedAt !== undefined) data.closedAt = new Date(shift.closedAt);
  if (shift.closingAmountExpected !== undefined) data.closingAmountExpected = decimal(shift.closingAmountExpected);
  if (shift.closingAmountCounted !== undefined) data.closingAmountCounted = decimal(shift.closingAmountCounted);
  if (shift.differenceAmount !== undefined) data.differenceAmount = decimal(shift.differenceAmount);
  if (shift.notes !== undefined) data.notes = shift.notes;
  if (shift.metadata !== undefined) data.metadata = json(shift.metadata);
  return data;
};

// ──────────────────────────── Movement ────────────────────────────

export const toMovementEntity = (row: MovementRow): CashRegisterMovementEntity =>
  CashRegisterMovementEntity.fromObject({
    id: row.id,
    shiftId: row.shiftId,
    proyectoId: row.proyectoId,
    moduloId: row.moduloId,
    createdByUserId: row.createdByUserId,
    createdByUserName: optionalText(row.createdByUserName),
    type: row.type,
    direction: row.direction,
    concept: row.concept,
    amount: row.amount.toNumber(),
    createdAt: row.createdAt.getTime(),
    relatedTicketId: row.relatedTicketId ?? undefined,
    relatedPaymentId: row.relatedPaymentId ?? undefined,
    relatedCashPaymentSessionId: row.relatedCashPaymentSessionId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    notes: optionalText(row.notes),
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
  });

export const movementRow = (
  movement: Omit<CashRegisterMovementEntity, "id">,
): Prisma.CashRegisterMovementUncheckedCreateInput => ({
  shiftId: movement.shiftId,
  proyectoId: movement.proyectoId,
  moduloId: movement.moduloId,
  createdByUserId: movement.createdByUserId,
  createdByUserName: movement.createdByUserName ?? "",
  type: movement.type as CashRegisterMovementType,
  direction: movement.direction as CashMovementDirection,
  concept: movement.concept,
  amount: decimal(movement.amount),
  createdAt: new Date(movement.createdAt),
  relatedTicketId: movement.relatedTicketId || null,
  relatedPaymentId: movement.relatedPaymentId || null,
  relatedCashPaymentSessionId: movement.relatedCashPaymentSessionId || null,
  idempotencyKey: movement.idempotencyKey || null,
  notes: movement.notes ?? "",
  metadata: json(movement.metadata),
});

// ───────────────────────────── Count ─────────────────────────────

export const countInclude = { lines: { orderBy: { position: "asc" } } } satisfies Prisma.CashRegisterCountInclude;
type CountRow = Prisma.CashRegisterCountGetPayload<{ include: typeof countInclude }>;

export const toCountEntity = (row: CountRow): CashRegisterCountEntity =>
  CashRegisterCountEntity.fromObject({
    id: row.id,
    shiftId: row.shiftId,
    countedByUserId: row.countedByUserId,
    countedByUserName: optionalText(row.countedByUserName),
    countedAt: row.countedAt.getTime(),
    denominations: row.lines.map((line) => ({
      label: line.label,
      value: line.value.toNumber(),
      quantity: line.quantity,
      subtotal: line.subtotal.toNumber(),
    })),
    totalAmount: row.totalAmount.toNumber(),
    notes: optionalText(row.notes),
  });

export const countRow = (count: Omit<CashRegisterCountEntity, "id">): Prisma.CashRegisterCountUncheckedCreateInput => ({
  shiftId: count.shiftId,
  countedByUserId: count.countedByUserId,
  countedByUserName: count.countedByUserName ?? "",
  countedAt: new Date(count.countedAt),
  totalAmount: decimal(count.totalAmount),
  notes: count.notes ?? "",
  lines: {
    create: count.denominations.map((line, position) => ({
      position,
      label: line.label,
      value: decimal(line.value),
      quantity: line.quantity,
      subtotal: decimal(line.subtotal),
    })),
  },
});

// ────────────────────────────── Cut ──────────────────────────────

export const toCutEntity = (row: CutRow): CashRegisterCutEntity =>
  CashRegisterCutEntity.fromObject({
    id: row.id,
    shiftId: row.shiftId,
    generatedByUserId: row.generatedByUserId,
    generatedByUserName: optionalText(row.generatedByUserName),
    generatedAt: row.generatedAt.getTime(),
    openingAmount: row.openingAmount.toNumber(),
    totalIn: row.totalIn.toNumber(),
    totalOut: row.totalOut.toNumber(),
    expectedAmount: row.expectedAmount.toNumber(),
    countedAmount: row.countedAmount.toNumber(),
    differenceAmount: row.differenceAmount.toNumber(),
    status: row.status,
    notes: optionalText(row.notes),
  });

export const cutRow = (cut: Omit<CashRegisterCutEntity, "id">): Prisma.CashRegisterCutUncheckedCreateInput => ({
  shiftId: cut.shiftId,
  generatedByUserId: cut.generatedByUserId,
  generatedByUserName: cut.generatedByUserName ?? "",
  generatedAt: new Date(cut.generatedAt),
  openingAmount: decimal(cut.openingAmount),
  totalIn: decimal(cut.totalIn),
  totalOut: decimal(cut.totalOut),
  expectedAmount: decimal(cut.expectedAmount),
  countedAmount: decimal(cut.countedAmount),
  differenceAmount: decimal(cut.differenceAmount),
  status: cut.status as CashRegisterCutStatus,
  notes: cut.notes ?? "",
});

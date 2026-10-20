import { randomUUID } from "node:crypto";
import { buildParkingFeeService } from "../../src/presentation/dependencies/parking.dependencies";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";
import type { TicketEntity } from "../../src/domain/entities/parking/ticket.entity";
import {
  CashRegisterCountPostgresDatasource,
  CashRegisterCutPostgresDatasource,
  CashRegisterModulePostgresDatasource,
  CashRegisterMovementPostgresDatasource,
  CashRegisterShiftPostgresDatasource,
} from "../../src/infrastructure/datasources/cash-register/cash-register.datasources.postgres";
import { MobileCommandPostgresDatasource } from "../../src/infrastructure/datasources/mobile/mobile-command.datasource.postgres";
import { TicketPostgresDatasource } from "../../src/infrastructure/datasources/parking/ticket.datasource.postgres";
import { CashPaymentSessionPostgresDatasource } from "../../src/infrastructure/datasources/payments/cash-payment-session.datasource.postgres";
import { CashTicketPaymentPostgresDatasource } from "../../src/infrastructure/datasources/payments/cash-ticket-payment.datasource.postgres";
import { PaymentPostgresDatasource } from "../../src/infrastructure/datasources/payments/payment.datasource.postgres";
import { PostgresTransactionRunner } from "../../src/infrastructure/datasources/system/transaction-runner.postgres";
import { CashRegisterCountRepositoryImpl } from "../../src/infrastructure/repositories/cash-register/cash-register-count.repository.impl";
import { CashRegisterCutRepositoryImpl } from "../../src/infrastructure/repositories/cash-register/cash-register-cut.repository.impl";
import { CashRegisterModuleRepositoryImpl } from "../../src/infrastructure/repositories/cash-register/cash-register-module.repository.impl";
import { CashRegisterMovementRepositoryImpl } from "../../src/infrastructure/repositories/cash-register/cash-register-movement.repository.impl";
import { CashRegisterShiftRepositoryImpl } from "../../src/infrastructure/repositories/cash-register/cash-register-shift.repository.impl";
import { TicketRepositoryImpl } from "../../src/infrastructure/repositories/parking/ticket.repository.impl";
import { CashPaymentSessionRepositoryImpl } from "../../src/infrastructure/repositories/payments/cash-payment-session.repository.impl";
import { CashTicketPaymentRepositoryImpl } from "../../src/infrastructure/repositories/payments/cash-ticket-payment.repository.impl";
import { PaymentRepositoryImpl } from "../../src/infrastructure/repositories/payments/payment.repository.impl";
import { CashRegisterService } from "../../src/presentation/services/cash-register/cash-register.service";
import type { OperationalLogsService } from "../../src/presentation/services/operational-logs/operational-logs.service";
import { CashTicketPaymentService } from "../../src/presentation/services/payments/cash-ticket-payment.service";

const db = () => PostgresDatabase.client;
const tickets = new TicketPostgresDatasource();
const payments = new PaymentPostgresDatasource();
const mobile = new MobileCommandPostgresDatasource();
const transactions = new PostgresTransactionRunner();

const shiftRepository = new CashRegisterShiftRepositoryImpl(new CashRegisterShiftPostgresDatasource());
const cashRegister = new CashRegisterService(
  shiftRepository,
  new CashRegisterMovementRepositoryImpl(new CashRegisterMovementPostgresDatasource()),
  new CashRegisterCountRepositoryImpl(new CashRegisterCountPostgresDatasource()),
  new CashRegisterCutRepositoryImpl(new CashRegisterCutPostgresDatasource()),
  new CashRegisterModuleRepositoryImpl(new CashRegisterModulePostgresDatasource()),
);
const noLogs = { logEvent: async () => undefined, logIncident: async () => undefined } as unknown as OperationalLogsService;
const cashPayments = new CashTicketPaymentService(
  new TicketRepositoryImpl(tickets),
  new CashPaymentSessionRepositoryImpl(new CashPaymentSessionPostgresDatasource()),
  new PaymentRepositoryImpl(payments),
  shiftRepository,
  cashRegister,
  new CashTicketPaymentRepositoryImpl(new CashTicketPaymentPostgresDatasource()),
  noLogs,
  transactions,
  buildParkingFeeService(),
);

const proyectoId = randomUUID();
const entradaId = randomUUID();
const posId = randomUUID();
const cashier = { userId: randomUUID(), userName: "Cajera", allowedProjectIds: [proyectoId], isSuperAdmin: false };

/** A ticket already quoted at the exit, as the POS sees it. */
const quotedTicket = (monto = 20) =>
  tickets.create({
    proyecto: proyectoId,
    entrada: entradaId,
    usuario: randomUUID(),
    idBoleto: `B-${randomUUID()}`,
    horaInicio: Date.now() - 90 * 60_000,
    horaConsulta: Date.now(),
    horaCobro: -1,
    horaSalida: -1,
    duracion: 90,
    monto,
    pagado: false,
    status: "ACTIVE",
    barrierOpenedAt: -1,
    barrierConfirmedAt: -1,
    fraudDetectedAt: -1,
    fraudReason: "",
  } as Omit<TicketEntity, "id">);

const insert = (sessionId: string, amount: number, idempotencyKey: string = randomUUID()) =>
  cashPayments.registerCashInsertion(sessionId, amount, cashier, { idempotencyKey });

const settled = async (promises: Promise<unknown>[]) => {
  const results = await Promise.allSettled(promises);
  return {
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected") as PromiseRejectedResult[],
  };
};

const paymentsOf = (ticketId: string) => db().payment.count({ where: { referenceType: "ticket", referenceId: ticketId } });

/** Same steps as MobileCommandService.applyCloudPayment, on the Postgres datasource. */
const payFromApp = (ticket: TicketEntity, providerReference: string) =>
  transactions.run(async (tx) => {
    const current = await mobile.findTicketById(ticket.id, tx);
    if (await mobile.findPaymentIdByProviderReference(providerReference, tx)) return "already-applied";
    if (current?.pagado) throw new Error("El ticket ya fue pagado");
    await mobile.createCloudTicketPayment(
      { user: ticket.usuario, ticketId: ticket.id, proyectoId, amount: ticket.monto, currency: "MXN", paidAt: Date.now(), providerReference },
      tx,
    );
    await mobile.markTicketPaid(ticket.id, Date.now(), tx);
    return "paid";
  });

describe("tickets, cash payments and cash register (Postgres)", () => {
  let shiftId = "";

  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 6 });
    await db().proyecto.create({
      data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` },
    });
    await db().modulo.createMany({
      data: [
        { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` },
        { id: posId, proyectoId, nombre: "Cajero", tipo: "POS", identificador: `POS-${posId}` },
      ],
    });
    const opened = await cashRegister.openShift({ moduloId: posId, openingAmount: 500 }, cashier);
    shiftId = opened.shift.id;
  });

  afterAll(async () => {
    const ticketIds = (await db().ticket.findMany({ where: { proyectoId }, select: { id: true } })).map((t) => t.id);
    await db().cashRegisterMovement.deleteMany({ where: { proyectoId } });
    await db().cashRegisterCut.deleteMany({ where: { shift: { proyectoId } } });
    await db().cashRegisterCount.deleteMany({ where: { shift: { proyectoId } } });
    await db().cashPaymentSession.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await db().cashRegisterShift.deleteMany({ where: { proyectoId } });
    await db().payment.deleteMany({ where: { referenceId: { in: ticketIds } } });
    await db().ticket.deleteMany({ where: { proyectoId } });
    await db().mobileCommandReceipt.deleteMany({ where: { type: "TEST" } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().proyecto.delete({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("stores tickets and keeps one open ticket per user", async () => {
    const ticket = await quotedTicket();
    expect(ticket.horaSalida).toBe(-1);
    expect(ticket.monto).toBe(20);
    expect((await tickets.getActiveByUsuario(ticket.usuario))?.id).toBe(ticket.id);

    const second = { ...ticket, idBoleto: `B-${randomUUID()}` };
    await expect(tickets.create(second)).rejects.toBeInstanceOf(UniqueConstraintError);
    await expect(tickets.create({ ...ticket, usuario: randomUUID() })).rejects.toBeInstanceOf(UniqueConstraintError);

    const exited = await tickets.update(ticket.id, { horaSalida: Date.now(), status: "COMPLETED" });
    expect(exited?.horaSalida).toBeGreaterThan(0);
    expect(await tickets.getActiveByUsuario(ticket.usuario)).toBeNull();
  });

  it("pays a ticket in cash once, ignoring a repeated insertion", async () => {
    const ticket = await quotedTicket(20);
    const session = await cashPayments.startCashSession(ticket.id, posId, cashier);
    const sessionId = String((session as { id: string }).id);

    await insert(sessionId, 10, "bill-1");
    const repeated = await insert(sessionId, 10, "bill-1");
    expect((repeated as { amountReceived: number }).amountReceived).toBe(10);

    const paid = (await insert(sessionId, 15, "bill-2")) as { status: string; amountReceived: number; changeAmount: number };
    expect(paid).toMatchObject({ status: "paid", amountReceived: 25, changeAmount: 5 });
    expect((await tickets.findById(ticket.id))?.pagado).toBe(true);
    expect(await paymentsOf(ticket.id)).toBe(1);
    expect(await db().cashRegisterMovement.count({ where: { relatedCashPaymentSessionId: sessionId } })).toBe(1);
    await expect(insert(sessionId, 10)).rejects.toThrow();
  });

  it("serializes concurrent insertions on the same session", async () => {
    const ticket = await quotedTicket(20);
    const sessionId = String(((await cashPayments.startCashSession(ticket.id, posId, cashier)) as { id: string }).id);

    const { ok, failed } = await settled([insert(sessionId, 10), insert(sessionId, 10), insert(sessionId, 10)]);
    expect(ok).toBe(2);
    expect(failed).toHaveLength(1);

    const session = await db().cashPaymentSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.amountReceived.toNumber()).toBe(20);
    expect(session.status).toBe("paid");
    expect(await paymentsOf(ticket.id)).toBe(1);
  });

  it("applies the same insertion once even when both requests arrive together", async () => {
    const ticket = await quotedTicket(20);
    const sessionId = String(((await cashPayments.startCashSession(ticket.id, posId, cashier)) as { id: string }).id);

    await settled([insert(sessionId, 10, "same-bill"), insert(sessionId, 10, "same-bill")]);
    const session = await db().cashPaymentSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.amountReceived.toNumber()).toBe(10);
  });

  it("never charges a ticket twice when cash and the app pay at the same time", async () => {
    const ticket = await quotedTicket(20);
    const sessionId = String(((await cashPayments.startCashSession(ticket.id, posId, cashier)) as { id: string }).id);
    await insert(sessionId, 10);

    const { ok } = await settled([insert(sessionId, 10), payFromApp(ticket, `pi_${randomUUID()}`)]);
    expect(ok).toBe(1);
    expect(await paymentsOf(ticket.id)).toBe(1);
    expect((await tickets.findById(ticket.id))?.pagado).toBe(true);
  });

  it("applies a re-delivered app payment once, even concurrently", async () => {
    const ticket = await quotedTicket(20);
    const reference = `pi_${randomUUID()}`;
    const results = await Promise.all([payFromApp(ticket, reference), payFromApp(ticket, reference)]);
    expect(results.sort()).toEqual(["already-applied", "paid"]);
    expect(await paymentsOf(ticket.id)).toBe(1);
  });

  it("stores the first result of a mobile command", async () => {
    const operationId = randomUUID();
    const [first, second] = await Promise.all([
      mobile.saveReceipt(operationId, "TEST", { attempt: 1 }),
      mobile.saveReceipt(operationId, "TEST", { attempt: 2 }),
    ]);
    expect(first.result).toEqual(second.result);
    expect(await mobile.findReceipt(operationId)).toEqual(first);
  });

  it("closes the shift with a balanced cut, only once", async () => {
    // The preview needs a count; a first rough count gives the expected amount.
    await cashRegister.saveCount(shiftId, { denominations: [{ label: "Billete 500", value: 500, quantity: 1 }] }, cashier);
    const preview = (await cashRegister.getCutPreview(shiftId, cashier)) as { expectedAmount: number; totalIn: number };
    // Opening fund + the cash payments of the previous tests.
    expect(preview.totalIn).toBeGreaterThanOrEqual(20);

    const expected = preview.expectedAmount;
    const denominations = [{ label: "Exacto", value: expected, quantity: 1 }];
    const closed = (await cashRegister.closeShift(shiftId, { denominations }, cashier)) as {
      cut: { status: string; differenceAmount: number; countedAmount: number };
    };
    expect(closed.cut).toMatchObject({ status: "balanced", differenceAmount: 0, countedAmount: expected });
    expect((await shiftRepository.findById(shiftId))?.status).toBe("closed");
    await expect(cashRegister.closeShift(shiftId, { denominations }, cashier)).rejects.toThrow();

    const counts = await db().cashRegisterCount.findMany({ where: { shiftId }, include: { lines: true } });
    expect(counts).toHaveLength(2);
    expect(counts.every((count) => count.lines.length === 1)).toBe(true);
  });
});

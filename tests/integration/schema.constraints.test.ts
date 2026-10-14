import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import type { PrismaClient } from "../../src/generated/prisma/client";

// Invariants the schema enforces (previously checked only in code).
describe("schema constraints", () => {
  let db: PrismaClient;
  const proyectoId = randomUUID();
  const entradaId = randomUUID();
  const posId = randomUUID();
  const pensionId = randomUUID();
  const passId = randomUUID();

  const uniqueViolation = expect.objectContaining({ code: "P2002" });

  beforeAll(async () => {
    db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 2 });
    await db.proyecto.create({
      data: { id: proyectoId, nombre: "Test", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `T-${proyectoId}` },
    });
    await db.modulo.createMany({
      data: [
        { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` },
        { id: posId, proyectoId, nombre: "Caja", tipo: "POS", identificador: `P-${posId}` },
      ],
    });
    await db.pension.create({ data: { id: pensionId, proyectoId, nombre: "Mensual", precio: "1500.00" } });
    await db.pensionPass.create({
      data: { id: passId, pensionId, name: "Pase", idPass: `PASS-${passId}`, created: new Date() },
    });
  });

  afterAll(async () => {
    const tickets = await db.ticket.findMany({ where: { proyectoId }, select: { id: true } });
    const shifts = await db.cashRegisterShift.findMany({ where: { moduloId: posId }, select: { id: true } });
    await db.cashPaymentSession.deleteMany({ where: { ticketId: { in: tickets.map((t) => t.id) } } });
    await db.cashRegisterShift.deleteMany({ where: { id: { in: shifts.map((s) => s.id) } } });
    await db.ticket.deleteMany({ where: { proyectoId } });
    await db.pensionMove.deleteMany({ where: { proyectoId } });
    await db.pensionPass.deleteMany({ where: { pensionId } });
    await db.pension.deleteMany({ where: { proyectoId } });
    await db.modulo.deleteMany({ where: { proyectoId } });
    await db.proyecto.delete({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  const newTicket = (usuarioId: string, status: "ACTIVE" | "COMPLETED" = "ACTIVE") =>
    db.ticket.create({
      data: { proyectoId, entradaId, usuarioId, idBoleto: `B-${randomUUID()}`, horaInicio: new Date(), status },
    });

  it("allows one active ticket per user", async () => {
    const usuarioId = randomUUID();
    await newTicket(usuarioId);
    await expect(newTicket(usuarioId)).rejects.toThrow(uniqueViolation);
    await expect(newTicket(usuarioId, "COMPLETED")).resolves.toBeDefined();
  });

  it("rejects a repeated idempotency key", async () => {
    const idempotencyKey = randomUUID();
    await db.ticket.create({
      data: { proyectoId, entradaId, usuarioId: randomUUID(), idBoleto: `B-${randomUUID()}`, horaInicio: new Date(), idempotencyKey },
    });
    await expect(
      db.ticket.create({
        data: { proyectoId, entradaId, usuarioId: randomUUID(), idBoleto: `B-${randomUUID()}`, horaInicio: new Date(), idempotencyKey },
      }),
    ).rejects.toThrow(uniqueViolation);
  });

  it("allows one open shift per cash register", async () => {
    const shift = (status: "open" | "closed") =>
      db.cashRegisterShift.create({
        data: { proyectoId, moduloId: posId, openedByUserId: randomUUID(), status, openingAmount: "500.00", openedAt: new Date() },
      });
    const open = await shift("open");
    await expect(shift("open")).rejects.toThrow(uniqueViolation);
    await db.cashRegisterShift.update({ where: { id: open.id }, data: { status: "closed", closedAt: new Date() } });
    await expect(shift("open")).resolves.toBeDefined();
  });

  it("allows one open cash session per ticket and ignores repeated insertions", async () => {
    const ticket = await newTicket(randomUUID());
    const session = (status: "pending_cash" | "cancelled") =>
      db.cashPaymentSession.create({
        data: { ticketId: ticket.id, idBoleto: ticket.idBoleto, status, amountExpected: "20.00", moduloId: posId, startedAt: new Date() },
      });
    const open = await session("pending_cash");
    await expect(session("pending_cash")).rejects.toThrow(uniqueViolation);
    await expect(session("cancelled")).resolves.toBeDefined();

    const insertion = { sessionId: open.id, type: "cash_inserted" as const, amount: "10.00", idempotencyKey: "bill-1", createdAt: new Date() };
    await db.cashPaymentSessionEvent.create({ data: insertion });
    await expect(db.cashPaymentSessionEvent.create({ data: insertion })).rejects.toThrow(uniqueViolation);
    // Events without a key are never treated as duplicates.
    const unkeyed = { sessionId: open.id, type: "session_created" as const, createdAt: new Date() };
    await db.cashPaymentSessionEvent.createMany({ data: [unkeyed, unkeyed] });
    expect(await db.cashPaymentSessionEvent.count({ where: { sessionId: open.id } })).toBe(3);
  });

  it("stores money as exact decimals and pension move types with their API names", async () => {
    const pension = await db.pension.findUniqueOrThrow({ where: { id: pensionId } });
    expect(pension.precio.toString()).toBe("1500");
    await db.pensionMove.create({
      data: { moduloId: entradaId, proyectoId, pensionPassId: passId, tipo: "ENTRADA_PENSION", fecha: new Date() },
    });
    const [row] = await db.$queryRaw<Array<{ tipo: string }>>`SELECT tipo::text FROM pension_moves WHERE pension_pass_id = ${passId}::uuid`;
    expect(row.tipo).toBe("ENTRADA-PENSION");
  });

  it("keeps a projected module while local data references it", async () => {
    await expect(db.modulo.delete({ where: { id: entradaId } })).rejects.toThrow();
  });
});

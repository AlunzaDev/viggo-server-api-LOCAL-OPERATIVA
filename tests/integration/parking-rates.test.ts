import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildParkingRateRepository } from "../../src/presentation/dependencies/repositories.dependencies";
import { buildTicketService } from "../../src/presentation/dependencies/parking.dependencies";
import { SocketServerPlugin } from "../../src/presentation/sockets/socket-server";

// The project's own rate prices tickets; until one is saved, the legacy $10/$20 applies.
const db = () => PostgresDatabase.client;
const rates = buildParkingRateRepository();
const tickets = buildTicketService();
const proyectoId = randomUUID();
const entradaId = randomUUID();
const salidaId = randomUUID();
let entryToken = "";
let exitToken = "";
const rules = { toleranceMinutes: 15, firstBlockMinutes: 60, firstBlockPrice: 20, fractionMinutes: 15, fractionPrice: 5, dailyMax: 150 };

/** A ticket that entered `minutes` ago. */
const ticketSince = async (minutes: number) => {
  const usuarioId = randomUUID();
  const ticket = await tickets.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: `key-${randomUUID()}` });
  await db().ticket.update({ where: { id: ticket.id }, data: { horaInicio: new Date(Date.now() - minutes * 60_000) } });
  return usuarioId;
};

describe("parking rates", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    await db().proyecto.create({ data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` } });
    await db().modulo.createMany({ data: [
      { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` },
      { id: salidaId, proyectoId, nombre: "Salida", tipo: "SALIDA", identificador: `S-${salidaId}` },
    ] });
    entryToken = String(await JwtPlugin.generateToken({ id: entradaId }));
    exitToken = String(await JwtPlugin.generateToken({ id: salidaId }));
  });

  beforeEach(() => { vi.spyOn(SocketServerPlugin, "openBarrier").mockResolvedValue(); });

  afterAll(async () => {
    vi.restoreAllMocks();
    await db().ticket.deleteMany({ where: { proyectoId } });
    await db().parkingRate.deleteMany({ where: { proyectoId } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().proyecto.delete({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("keeps the legacy fixed rate while none is configured", async () => {
    expect(await rates.findCurrent(proyectoId)).toBeNull();
    const quoted = await tickets.getActiveTicketByUsuario(await ticketSince(90));
    expect(quoted).toMatchObject({ monto: 20, tarifaVersion: null });
  });

  it("saves each change as a new version, even two at the same time", async () => {
    const first = await rates.createVersion(proyectoId, rules, "admin-1");
    expect(first).toMatchObject({ version: 1, ...rules, createdBy: "admin-1" });
    const [a, b] = await Promise.all([
      rates.createVersion(proyectoId, { ...rules, firstBlockPrice: 25 }, "admin-2"),
      rates.createVersion(proyectoId, { ...rules, firstBlockPrice: 30 }, "admin-3"),
    ]);
    expect([a.version, b.version].sort()).toEqual([2, 3]);
    expect((await rates.getHistory(proyectoId, 10)).map((rate) => rate.version)).toEqual([3, 2, 1]);

    // The rules are checked before saving, and by the database too.
    await expect(rates.createVersion(proyectoId, { ...rules, toleranceMinutes: 90 }, "admin-1")).rejects.toMatchObject({ statusCode: 400 });
    await expect(db().parkingRate.create({ data: { proyectoId, version: 99, toleranceMinutes: 0, firstBlockMinutes: 60, firstBlockPrice: 0,
      fractionMinutes: 15, fractionPrice: 5 } })).rejects.toThrow();

    await rates.createVersion(proyectoId, rules, "admin-1");
  });

  it("quotes with the current rate and records its version on the ticket", async () => {
    const current = (await rates.findCurrent(proyectoId))!;
    // 1 h 20 min: first hour $20 + 2 fractions of $5.
    const quoted = await tickets.getActiveTicketByUsuario(await ticketSince(80));
    expect(quoted).toMatchObject({ monto: 30, duracion: 80, tarifaVersion: current.version });
    expect((await db().ticket.findUniqueOrThrow({ where: { id: quoted!.id } })).tarifaVersion).toBe(current.version);
  });

  it("lets a stay inside the tolerance leave without paying", async () => {
    const usuarioId = await ticketSince(5);
    const exited = await tickets.killTicketFromModuleToken(usuarioId, exitToken, { idempotencyKey: `exit-${randomUUID()}` });
    expect(exited).toMatchObject({ status: "COMPLETED", pagado: true, monto: 0 });

    // Past the tolerance the exit still requires a payment.
    const late = await ticketSince(20);
    await expect(tickets.killTicketFromModuleToken(late, exitToken, { idempotencyKey: `exit-${randomUUID()}` }))
      .rejects.toThrow("No cuenta con un ticket pagado para salir");
  });
});

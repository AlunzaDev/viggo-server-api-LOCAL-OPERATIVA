import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildMobileCommandRepository } from "../../src/presentation/dependencies/repositories.dependencies";
import { buildPensionPassService } from "../../src/presentation/dependencies/pension.dependencies";
import { MobileCommandService } from "../../src/presentation/services/mobile/mobile-command.service";
import { SocketServerPlugin } from "../../src/presentation/sockets/socket-server";
import { localClock } from "../../src/domain/entities/parking/time-zone";

// The app opens a barrier with its Pension Pass through a cloud command (#32).
const db = () => PostgresDatabase.client;
const proyectoId = randomUUID();
const entradaId = randomUUID();
const salidaId = randomUUID();
const pensionId = randomUUID();
const passId = randomUUID();
const userId = randomUUID();
const otherUserId = randomUUID();
let entradaToken = "";
let salidaToken = "";

const service = () => new MobileCommandService({} as never, buildMobileCommandRepository(), {} as never);
/** Runs a cloud command as the scheduler does after a delivery (execute is the part under test). */
const execute = (operationId: string, payload: Record<string, unknown>, user = userId) =>
  (service() as unknown as { execute(operation: unknown): Promise<{ pensionMove: { tipo: string } }> })
    .execute({ operationId, type: "PENSION_PASS_ACCESS", proyectoId, userId: user, payload });
const inside = async () => (await db().pensionPass.findUniqueOrThrow({ where: { id: passId } })).inParking;
const receipt = (operationId: string) => db().mobileCommandReceipt.findUnique({ where: { operationId } });

describe("Pension Pass access from the app (PENSION_PASS_ACCESS)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    await db().usuario.createMany({ data: [userId, otherUserId].map((id) => ({
      id, nombre: "Pensionado", apellido: "Prueba", correo: `${id}@example.com`, telefono: id.slice(0, 10), password: "hash",
    })) });
    await db().proyecto.create({ data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` } });
    await db().modulo.createMany({ data: [
      { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` },
      { id: salidaId, proyectoId, nombre: "Salida", tipo: "SALIDA", identificador: `S-${salidaId}` },
    ] });
    await db().pension.create({ data: { id: pensionId, proyectoId, nombre: "Mensual", precio: "1500.00",
      // Every day, all day: the schedule is not what these tests check.
      horarios: { create: [0, 1, 2, 3, 4, 5, 6].map((weekDay) => ({ weekDay, fromMinutes: 0, toMinutes: 1439 })) } } });
    await db().pensionPass.create({ data: { id: passId, pensionId, usuarioId: userId, name: "Pase", idPass: `PASS-${passId}`,
      vigent: true, created: new Date(), validFrom: new Date(Date.now() - 86_400_000), validTo: new Date(Date.now() + 30 * 86_400_000) } });
    entradaToken = (await JwtPlugin.generateToken({ id: entradaId }))!;
    salidaToken = (await JwtPlugin.generateToken({ id: salidaId }))!;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  afterAll(async () => {
    await db().mobileCommandReceipt.deleteMany({ where: { type: "PENSION_PASS_ACCESS" } });
    await db().pensionMove.deleteMany({ where: { proyectoId } });
    await db().pensionPass.deleteMany({ where: { id: passId } });
    await db().pension.deleteMany({ where: { id: pensionId } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await db().usuario.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await PostgresDatabase.disconnect();
  });

  it("opens the barrier, records the passage and stores the receipt with it", async () => {
    const open = vi.spyOn(SocketServerPlugin, "openBarrier").mockResolvedValue();
    const operationId = randomUUID();
    const result = await execute(operationId, { pensionPassId: passId, moduleToken: entradaToken });
    expect(result.pensionMove).toMatchObject({ tipo: "ENTRADA", pensionPass: passId, modulo: { _id: entradaId, nombre: "Entrada" } });
    expect(open).toHaveBeenCalledWith(entradaId);
    expect(await inside()).toBe(true);
    // The receipt committed with the passage: a re-delivery returns this result.
    expect((await receipt(operationId))?.result).toMatchObject({ pensionMove: { tipo: "ENTRADA" } });
  });

  it("keeps anti-passback: a second entry is rejected", async () => {
    vi.spyOn(SocketServerPlugin, "openBarrier").mockResolvedValue();
    await expect(execute(randomUUID(), { pensionPassId: passId, moduleToken: entradaToken })).rejects.toMatchObject({ code: "PENSION_PASSBACK_ENTRY" });
  });

  it("records nothing, not even the receipt, when the barrier does not open", async () => {
    vi.spyOn(SocketServerPlugin, "openBarrier").mockRejectedValue(new Error("Modulo desconectado"));
    const operationId = randomUUID();
    await expect(execute(operationId, { pensionPassId: passId, moduleToken: salidaToken })).rejects.toThrow("Modulo desconectado");
    expect(await inside()).toBe(true);
    expect(await receipt(operationId)).toBeNull();
  });

  it("exits, and refuses another user's pass or a missing token", async () => {
    vi.spyOn(SocketServerPlugin, "openBarrier").mockResolvedValue();
    await expect(execute(randomUUID(), { pensionPassId: passId, moduleToken: salidaToken }, otherUserId)).rejects.toMatchObject({ statusCode: 401 });
    await expect(execute(randomUUID(), { pensionPassId: passId, moduleToken: "" })).rejects.toMatchObject({ statusCode: 400 });
    expect((await execute(randomUUID(), { pensionPassId: passId, moduleToken: salidaToken })).pensionMove.tipo).toBe("SALIDA");
    expect(await inside()).toBe(false);
  });

  it("checks the pension schedule in the parking's local time", async () => {
    vi.spyOn(SocketServerPlugin, "openBarrier").mockResolvedValue();
    // A window of ±20 min around now in Tijuana: open there, closed for a parking in Tokyo.
    const tijuana = localClock(Date.now(), "America/Tijuana");
    await db().pensionHorario.deleteMany({ where: { pensionId } });
    await db().pensionHorario.create({ data: { pensionId, weekDay: tijuana.weekDay,
      fromMinutes: Math.max(0, tijuana.minutes - 20), toMinutes: Math.min(1439, tijuana.minutes + 20) } });
    try {
      await db().proyecto.update({ where: { id: proyectoId }, data: { zonaHoraria: "Asia/Tokyo" } });
      await expect(execute(randomUUID(), { pensionPassId: passId, moduleToken: entradaToken })).rejects.toThrow(/horario|rango/);

      await db().proyecto.update({ where: { id: proyectoId }, data: { zonaHoraria: "America/Tijuana" } });
      expect((await execute(randomUUID(), { pensionPassId: passId, moduleToken: entradaToken })).pensionMove.tipo).toBe("ENTRADA");
      await execute(randomUUID(), { pensionPassId: passId, moduleToken: salidaToken });
    } finally {
      await db().pensionHorario.deleteMany({ where: { pensionId } });
      await db().pensionHorario.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekDay) => ({ pensionId, weekDay, fromMinutes: 0, toMinutes: 1439 })) });
      await db().proyecto.update({ where: { id: proyectoId }, data: { zonaHoraria: "America/Mexico_City" } });
    }
  });

  it("refuses an expired pass", async () => {
    vi.spyOn(SocketServerPlugin, "openBarrier").mockResolvedValue();
    await db().pensionPass.update({ where: { id: passId }, data: { validTo: new Date(Date.now() - 1000) } });
    await expect(execute(randomUUID(), { pensionPassId: passId, moduleToken: entradaToken })).rejects.toMatchObject({ code: "PENSION_PASS_EXPIRED" });
  });
});

import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildOccupancyRepository, buildProyectoRepository } from "../../src/presentation/dependencies/repositories.dependencies";
import { OccupancyRoutes } from "../../src/presentation/routes/parking/occupancy.routes";
import { OccupancyService } from "../../src/presentation/services/parking/occupancy.service";

// /api/ocupacion: how full this installation's parking is (#22).
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const proyectoId = randomUUID();
const entradaId = randomUUID();
const pensionId = randomUUID();
const passes = { inside: randomUUID(), outside: randomUUID() };
const clients: string[] = [];
const staff = { tickets: { id: randomUUID(), profile: randomUUID(), modules: ["tickets" as const], token: "" }, cashier: { id: randomUUID(), profile: randomUUID(), modules: ["cashPayments" as const], token: "" } };
const service = new OccupancyService(buildOccupancyRepository(), buildProyectoRepository());
// 12:30 in Mexico City (UTC-6): today's hours are 00:00 to 12:00.
const now = Date.parse("2026-10-22T18:30:00Z");
const minutes = (n: number) => new Date(now - n * 60_000);
let server: Server;
let base = "";

const ticket = async (horaInicio: Date, horaSalida: Date | null, status: "ACTIVE" | "COMPLETED" | "FRAUD" = horaSalida ? "COMPLETED" : "ACTIVE") => {
  const usuarioId = randomUUID();
  clients.push(usuarioId);
  await db().usuario.create({ data: { id: usuarioId, nombre: "Cliente", apellido: tag, correo: `${usuarioId}@viggo.test`, telefono: usuarioId.slice(0, 10), password: "hash" } });
  return db().ticket.create({ data: { proyectoId, entradaId, usuarioId, idBoleto: `${tag}-${randomUUID().slice(0, 6)}`, horaInicio, horaSalida, status, pagado: Boolean(horaSalida), monto: horaSalida ? 40 : 0 } });
};
const move = (pensionPassId: string, tipo: "ENTRADA_PENSION" | "SALIDA_PENSION", fecha: Date) =>
  db().pensionMove.create({ data: { moduloId: entradaId, proyectoId, pensionPassId, tipo, fecha } });

describe("/api/ocupacion", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    await db().proyecto.create({ data: { id: proyectoId, nombre: "Plaza", coordinates: [0, 0], ciudad: "CDMX", identificador: `P-${tag}`, capacidad: 10 } });
    await db().modulo.create({ data: { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${tag}` } });
    const titular = randomUUID();
    clients.push(titular);
    await db().usuario.create({ data: { id: titular, nombre: "Ana", apellido: "Pérez", correo: `${titular}@viggo.test`, telefono: titular.slice(0, 10), password: "hash" } });
    await db().pension.create({ data: { id: pensionId, proyectoId, nombre: "Mensual", precio: 1500 } });
    await db().pensionPass.create({ data: { id: passes.inside, pensionId, usuarioId: titular, name: "Pase Ana", idPass: `${tag}-a`, created: new Date(), inParking: true } });
    await db().pensionPass.create({ data: { id: passes.outside, pensionId, name: "Pase libre", idPass: `${tag}-b`, created: new Date() } });

    await ticket(minutes(150), null); // inside since 10:00
    await ticket(minutes(20), null); // inside since 12:10
    await ticket(new Date(now - 8 * 86_400_000), null); // forgotten: more than 7 days without exit
    await ticket(minutes(60), null, "FRAUD"); // fraud without exit: not inside
    await ticket(minutes(240), minutes(200)); // 08:30 to 09:10
    await move(passes.inside, "ENTRADA_PENSION", minutes(300)); // 07:30
    await move(passes.outside, "ENTRADA_PENSION", minutes(330));
    await move(passes.outside, "SALIDA_PENSION", minutes(100)); // 10:50

    for (const user of Object.values(staff)) {
      await db().permissionProfile.create({ data: { id: user.profile, app: "OPERATIVE_WEB", nombre: `occ-${user.profile}`, modules: user.modules } });
      await db().usuario.create({ data: { id: user.id, nombre: "Staff", apellido: tag, correo: `${user.id}@viggo.test`, telefono: user.id.slice(0, 10),
        password: "hash", rol: "ADMIN_ROLE", emailValidated: true, allowedApps: ["OPERATIVE_WEB"],
        appPermissions: { create: { app: "OPERATIVE_WEB", permissionProfileId: user.profile } } } });
      user.token = String(await JwtPlugin.generateToken({ id: user.id, app: "OPERATIVE_WEB" }));
    }
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as express.Request & { localProjectId: string }).localProjectId = proyectoId; next(); });
    app.use("/api/ocupacion", OccupancyRoutes.routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db().pensionMove.deleteMany({ where: { proyectoId } });
    await db().pensionPass.deleteMany({ where: { pensionId } });
    await db().pension.deleteMany({ where: { id: pensionId } });
    await db().ticket.deleteMany({ where: { proyectoId } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().usuarioAppPermission.deleteMany({ where: { permissionProfileId: { in: Object.values(staff).map((user) => user.profile) } } });
    await db().usuario.deleteMany({ where: { id: { in: [...clients, ...Object.values(staff).map((user) => user.id)] } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: Object.values(staff).map((user) => user.profile) } } });
    await db().proyecto.delete({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("counts who is inside now against the capacity", async () => {
    const result = await service.get(proyectoId, now);
    // Two recent open tickets and the pensioner marked inside.
    expect(result.ahora).toEqual({ autosDentro: 3, tickets: 2, pensionados: 1, capacidad: 10, porcentaje: 30, lugaresLibres: 7 });
    expect(result.zonaHoraria).toBe("America/Mexico_City");
  });

  it("gives today's hours with who was inside and the entries and exits", async () => {
    const { horas } = (await service.get(proyectoId, now)).hoy;
    expect(horas.map((hour) => hour.hora)).toEqual(Array.from({ length: 13 }, (_, index) => `${String(index).padStart(2, "0")}:00`));
    const at = (hora: string) => horas.find((hour) => hour.hora === hora)!;
    // 09:00: the 08:30 ticket and both pensioners (entered 07:00 and 07:30).
    expect(at("09:00")).toMatchObject({ dentro: 3 });
    // 11:00: the 10:00 ticket and the pensioner still inside (the other left at 10:50).
    expect(at("11:00")).toMatchObject({ dentro: 2, salidas: 0 });
    expect(at("10:00")).toMatchObject({ entradas: 1, salidas: 1 });
    expect(horas.reduce((sum, hour) => sum + hour.entradas, 0)).toBe(6);
  });

  it("lists the open tickets oldest first, flagging the forgotten ones, and the pensioners inside", async () => {
    const result = await service.get(proyectoId, now);
    expect(result.ticketsAbiertos.total).toBe(3);
    expect(result.ticketsAbiertos.items.map((item) => [item.minutosDentro, item.olvidado])).toEqual([[8 * 24 * 60, true], [150, false], [20, false]]);
    expect(result.pensionadosDentro).toEqual({ total: 1, items: [expect.objectContaining({
      pensionPassId: passes.inside, nombre: "Pase Ana", titular: "Ana Pérez", pension: "Mensual", desde: now - 300 * 60_000,
    })] });
  });

  it("gives no percentage without a captured capacity", async () => {
    await db().proyecto.update({ where: { id: proyectoId }, data: { capacidad: null } });
    expect((await service.get(proyectoId, now)).ahora).toMatchObject({ autosDentro: 3, capacidad: null, porcentaje: null, lugaresLibres: null });
    await db().proyecto.update({ where: { id: proyectoId }, data: { capacidad: 10 } });
  });

  it("is served to users with the tickets module only", async () => {
    const call = (token: string) => fetch(`${base}/api/ocupacion`, { headers: { Authorization: `Bearer ${token}` } });
    const allowed = await call(staff.tickets.token);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ ahora: { capacidad: 10 }, hoy: { horas: expect.any(Array) } });
    expect((await call(staff.cashier.token)).status).toBe(403);
    expect((await call("")).status).toBe(401);
  });
});

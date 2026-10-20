import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { ParkingRateRoutes } from "../../src/presentation/routes/parking/parking-rate.routes";

// /api/tarifa: the rate of this installation's project, edited from OPERATIVO's web.
const db = () => PostgresDatabase.client;
const proyectoId = randomUUID();
// Both are ADMIN_ROLE (every OPERATIVO web user is): the tickets module is what lets one edit.
const profiles = { admin: randomUUID(), cashier: randomUUID() };
const users = { admin: { id: randomUUID(), rol: "ADMIN_ROLE", token: "", profile: profiles.admin }, cashier: { id: randomUUID(), rol: "ADMIN_ROLE", token: "", profile: profiles.cashier } };
let server: Server;
let base = "";
const rules = { toleranceMinutes: 15, firstBlockMinutes: 60, firstBlockPrice: 20, fractionMinutes: 15, fractionPrice: 5, dailyMax: 150 };

const call = async (method: string, path: string, body: unknown, user: { token: string }) => {
  const response = await fetch(`${base}/api/tarifa${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
};

describe("/api/tarifa", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    await db().proyecto.create({ data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` } });
    await db().permissionProfile.create({ data: { id: profiles.admin, app: "OPERATIVE_WEB", nombre: `tarifa-${profiles.admin}`, modules: ["tickets"] } });
    await db().permissionProfile.create({ data: { id: profiles.cashier, app: "OPERATIVE_WEB", nombre: `caja-${profiles.cashier}`, modules: ["cashPayments"] } });
    for (const user of Object.values(users)) {
      await db().usuario.create({ data: {
        id: user.id, nombre: "Staff", apellido: user.rol, correo: `${user.id}@viggo.test`, telefono: user.id.slice(0, 10),
        password: "hash", rol: user.rol, emailValidated: true, allowedApps: ["OPERATIVE_WEB"],
        appPermissions: { create: { app: "OPERATIVE_WEB", permissionProfileId: user.profile } },
      } });
      user.token = String(await JwtPlugin.generateToken({ id: user.id, app: "OPERATIVE_WEB" }));
    }
    const app = express();
    app.use(express.json());
    // What requireLocalProject sets for a linked installation.
    app.use((req, _res, next) => { (req as express.Request & { localProjectId: string }).localProjectId = proyectoId; next(); });
    app.use("/api/tarifa", ParkingRateRoutes.routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db().outboxEvent.deleteMany({ where: { aggregateType: "parking_rate" } });
    await db().parkingRate.deleteMany({ where: { proyectoId } });
    await db().usuarioAppPermission.deleteMany({ where: { usuarioId: { in: Object.values(users).map((user) => user.id) } } });
    await db().usuario.deleteMany({ where: { id: { in: Object.values(users).map((user) => user.id) } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: Object.values(profiles) } } });
    await db().proyecto.delete({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("shows the legacy rate while none is configured", async () => {
    expect(await call("GET", "", undefined, users.cashier)).toMatchObject({ status: 200, body: { tarifa: null, configurada: false,
      descripcion: "Tarifa base: menos de 1 hora $10.00, 1 hora o mas $20.00" } });
    expect((await call("POST", "/simular", { minutes: 90 }, users.cashier)).body).toMatchObject({ minutes: 90, amount: 20 });
  });

  it("lets only users with the tickets module change it, with valid rules", async () => {
    expect((await call("PUT", "", rules, users.cashier)).status).toBe(403);
    expect(await call("PUT", "", { ...rules, toleranceMinutes: 90 }, users.admin)).toMatchObject({ status: 400, body: { error: expect.stringContaining("tolerancia") } });
    expect((await call("PUT", "", { ...rules, firstBlockPrice: "veinte" }, users.admin)).status).toBe(400);

    const saved = await call("PUT", "", rules, users.admin);
    expect(saved).toMatchObject({ status: 200, body: { configurada: true, tarifa: { version: 1, ...rules, createdBy: users.admin.id },
      descripcion: "15 min gratis, primera hora $20.00, cada 15 min adicional $5.00, maximo $150.00 por dia" } });

    // An empty cap means no cap; each save is a new version, listed newest first.
    await call("PUT", "", { ...rules, dailyMax: "" }, users.admin);
    const history = await call("GET", "/historial", undefined, users.admin);
    expect(history.body.historial.map((rate: { version: number; dailyMax: number | null }) => [rate.version, rate.dailyMax])).toEqual([[2, null], [1, 150]]);
    expect((await call("GET", "/historial", undefined, users.cashier)).status).toBe(403);
  });

  it("sends every version to the cloud through the outbox", async () => {
    const events = await db().outboxEvent.findMany({ where: { aggregateType: "parking_rate", payload: { path: ["proyecto_id"], equals: proyectoId } }, orderBy: { position: "asc" } });
    expect(events.map((event) => event.eventType)).toEqual(["parking_rate.created", "parking_rate.created"]);
    expect(events[0].payload).toMatchObject({ proyecto_id: proyectoId, version: 1, tolerance_minutes: 15, created_by: users.admin.id });
  });

  it("simulates the current rate or a draft, with its breakdown", async () => {
    // Current: version 2, no cap.
    expect((await call("POST", "/simular", { minutes: 600 }, users.cashier)).body.amount).toBe(20 + 36 * 5);
    // A draft from the form, not saved.
    const draft = await call("POST", "/simular", { minutes: 80, rules: { ...rules, fractionPrice: 7.5 } }, users.cashier);
    expect(draft.body).toEqual({ minutes: 80, amount: 35, lines: [
      { concept: "Primer bloque (60 min)", amount: 20 },
      { concept: "2 fracciones de 15 min", amount: 15 },
    ] });
    expect((await call("POST", "/simular", { minutes: -1 }, users.cashier)).status).toBe(400);
    expect((await call("POST", "/simular", { minutes: 10, rules: { ...rules, fractionMinutes: 0 } }, users.cashier)).status).toBe(400);
  });
});

import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { TicketRoutes } from "../../src/presentation/routes/parking/ticket.routes";

// /api/tickets from OPERATIVO's web: listing, reading and editing, limited to the user's parkings.
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const projects = { own: randomUUID(), other: randomUUID() };
const modules = { own: randomUUID(), other: randomUUID() };
const profileId = randomUUID();
const staff = { super: { id: randomUUID(), rol: "SUPER_ROLE", parkings: [] as string[], token: "" }, scoped: { id: randomUUID(), rol: "ADMIN_ROLE", parkings: [projects.own], token: "" } };
const clients = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
const tickets: Record<string, string> = {};
let server: Server;
let base = "";
const day = (n: number, hour = 12) => Date.UTC(2026, 9, n, hour);

const call = async (method: string, path: string, body?: unknown, token = staff.scoped.token) => {
  const response = await fetch(`${base}/api/tickets${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, any> };
};
const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

describe("/api/tickets", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const [key, id] of Object.entries(projects)) {
      await db().proyecto.create({ data: { id, nombre: `Plaza ${key}`, coordinates: [0, 0], ciudad: "GDL", identificador: `${tag}-${key}` } });
      await db().modulo.create({ data: { id: modules[key as keyof typeof modules], proyectoId: id, nombre: `Entrada ${key}`, tipo: "ENTRADA", identificador: `${tag}-E-${key}` } });
    }
    await db().permissionProfile.create({ data: { id: profileId, app: "OPERATIVE_WEB", nombre: `tickets-${tag}`, modules: ["tickets"] } });
    for (const user of Object.values(staff)) {
      await db().usuario.create({ data: {
        id: user.id, nombre: "Staff", apellido: user.rol, correo: `${user.id}@viggo.test`, telefono: user.id.slice(0, 10),
        password: "hash", rol: user.rol, emailValidated: true, allowedApps: ["OPERATIVE_WEB"], parkings: user.parkings,
        appPermissions: { create: { app: "OPERATIVE_WEB", permissionProfileId: profileId } },
      } });
      user.token = String(await JwtPlugin.generateToken({ id: user.id, app: "OPERATIVE_WEB" }));
    }
    for (const id of Object.values(clients)) {
      await db().usuario.create({ data: { id, nombre: "Cliente", apellido: tag, correo: `${id}@viggo.test`, telefono: id.slice(0, 10), password: "hash" } });
    }
    const ticket = (key: string, proyecto: "own" | "other", usuarioId: string, horaInicio: number, extra: Record<string, unknown> = {}) =>
      db().ticket.create({ data: { proyectoId: projects[proyecto], entradaId: modules[proyecto], usuarioId, idBoleto: `${tag}-${key}`,
        horaInicio: new Date(horaInicio), ...extra } }).then((row) => { tickets[key] = row.id; });
    await ticket("paid", "own", clients.a, day(10), { pagado: true, monto: 40, status: "COMPLETED", horaSalida: new Date(day(10, 14)) });
    await ticket("open", "own", clients.b, day(12));
    await ticket("foreign", "other", clients.c, day(11));

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as express.Request & { localProjectId: string }).localProjectId = projects.own; next(); });
    app.use("/api/tickets", TicketRoutes.routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db().outboxEvent.deleteMany({ where: { aggregateType: "ticket", aggregateId: { in: Object.values(tickets) } } }).catch(() => undefined);
    await db().ticket.deleteMany({ where: { proyectoId: { in: Object.values(projects) } } });
    await db().modulo.deleteMany({ where: { proyectoId: { in: Object.values(projects) } } });
    await db().usuarioAppPermission.deleteMany({ where: { permissionProfileId: profileId } });
    await db().usuario.deleteMany({ where: { id: { in: [...Object.values(staff).map((user) => user.id), ...Object.values(clients)] } } });
    await db().permissionProfile.deleteMany({ where: { id: profileId } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await PostgresDatabase.disconnect();
  });

  it("lists the user's tickets newest first, with filters and pagination", async () => {
    const mine = await call("GET", `/?search=${tag}`);
    expect(mine.status).toBe(200);
    expect(ids(mine.body.tickets)).toEqual([tickets.open, tickets.paid]);
    // The installation decides: even SUPER only sees this installation's parking.
    expect(ids((await call("GET", `/?search=${tag}`, undefined, staff.super.token)).body.tickets)).toEqual([tickets.open, tickets.paid]);

    expect(ids((await call("GET", `/?search=${tag}&pagado=true`)).body.tickets)).toEqual([tickets.paid]);
    expect(ids((await call("GET", `/?search=${tag}&status=completed`)).body.tickets)).toEqual([tickets.paid]);
    expect((await call("GET", `/?search=${tag}&proyecto=${projects.other}`, undefined, staff.super.token)).body.tickets).toEqual([]);
    expect(ids((await call("GET", `/?search=${tag}&from=${day(11, 0)}&to=${day(13, 0)}`)).body.tickets)).toEqual([tickets.open]);
    expect(ids((await call("GET", `/?search=${tag}-open`)).body.tickets)).toEqual([tickets.open]);
    expect(await call("GET", "/?pagado=quizas")).toMatchObject({ status: 400, body: { error: "'pagado' debe ser boolean" } });

    const paged = await call("GET", `/?search=${tag}&page=1&limit=1`);
    expect(paged.body).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(ids(paged.body.tickets)).toEqual([tickets.open]);
  });

  it("lists a client's tickets only from the user's parkings", async () => {
    expect(ids((await call("GET", `/usuario/${clients.a}`)).body.tickets)).toEqual([tickets.paid]);
    expect((await call("GET", `/usuario/${clients.c}`)).body.tickets).toEqual([]);
    expect(await call("GET", `/usuario/${clients.a}?pagado=x`)).toMatchObject({ status: 400 });
  });

  it("reads a ticket and a client's active ticket only from the user's parkings", async () => {
    expect((await call("GET", `/${tickets.open}`)).body.ticket.id).toBe(tickets.open);
    expect(await call("GET", `/${tickets.foreign}`)).toMatchObject({ status: 403, body: { error: "Forbidden" } });
    expect((await call("GET", `/${randomUUID()}`)).status).toBe(404);
    expect((await call("GET", `/usuario/${clients.b}/activo`)).body.ticket.id).toBe(tickets.open);
    expect((await call("GET", `/usuario/${clients.c}/activo`)).status).toBe(403);
    expect(await call("GET", `/usuario/${randomUUID()}/activo`)).toMatchObject({ status: 200, body: { ticket: null } });
  });

  it("creates and edits tickets only in the user's parkings", async () => {
    const body = { proyecto: projects.own, entrada: modules.own, usuario: clients.a, idBoleto: `${tag}-new`, horaInicio: day(13) };
    const created = await call("POST", "/", body);
    expect(created).toMatchObject({ status: 201, body: { ticket: { proyecto: projects.own, idBoleto: `${tag}-new`, pagado: false } } });
    tickets.created = created.body.ticket.id;
    expect(await call("POST", "/", { ...body, proyecto: projects.other, idBoleto: `${tag}-x` })).toMatchObject({ status: 403, body: { error: "Forbidden" } });
    expect(await call("POST", "/", { ...body, idBoleto: "" })).toMatchObject({ status: 400, body: { error: "'idBoleto' es requerido" } });

    expect((await call("PATCH", `/${tickets.open}`, { status: "FRAUD" })).body.ticket.status).toBe("FRAUD");
    // Money only changes through a confirmed payment.
    expect((await call("PATCH", `/${tickets.open}`, { pagado: true })).status).toBe(400);
    expect((await call("PATCH", `/${tickets.open}`, { proyecto: projects.other })).status).toBe(403);
    expect((await call("PATCH", `/${tickets.foreign}`, { status: "FRAUD" })).status).toBe(403);
  });
});

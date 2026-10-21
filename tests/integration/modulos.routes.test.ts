import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { ModuloRoutes } from "../../src/presentation/routes/parking/modulo.routes";

// /api/modulos from OPERATIVO's web: the installation's devices and their binding.
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const projects = { own: randomUUID(), other: randomUUID() };
const modules = { entrada: randomUUID(), salida: randomUUID(), pos: randomUUID(), foreign: randomUUID() };
const profileId = randomUUID();
const user = { id: randomUUID(), token: "" };
let server: Server;
let base = "";

const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${base}/api/modulos${path}`, {
    method,
    headers: { Authorization: `Bearer ${user.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, any> };
};
const ids = (list: Array<{ id: string }>) => list.map((item) => item.id).sort();

describe("/api/modulos (OPERATIVO)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const [key, id] of Object.entries(projects)) {
      await db().proyecto.create({ data: { id, nombre: `Plaza ${key}`, coordinates: [0, 0], ciudad: "GDL", identificador: `${tag}-${key}` } });
    }
    const modulo = (id: string, proyectoId: string, tipo: "ENTRADA" | "SALIDA" | "POS", nombre: string, estado = true) =>
      db().modulo.create({ data: { id, proyectoId, nombre, tipo, estado, identificador: `${tag}-${nombre}` } });
    await modulo(modules.entrada, projects.own, "ENTRADA", "Entrada Ñandú");
    await modulo(modules.salida, projects.own, "SALIDA", "Salida");
    await modulo(modules.pos, projects.own, "POS", "Cajero", false);
    await modulo(modules.foreign, projects.other, "ENTRADA", "Ajena");
    await db().permissionProfile.create({ data: { id: profileId, app: "OPERATIVE_WEB", nombre: `mod-${tag}`, modules: ["modules"] } });
    await db().usuario.create({ data: {
      id: user.id, nombre: "Staff", apellido: tag, correo: `${user.id}@viggo.test`, telefono: user.id.slice(0, 10),
      password: "hash", rol: "ADMIN_ROLE", emailValidated: true, allowedApps: ["OPERATIVE_WEB"],
      appPermissions: { create: { app: "OPERATIVE_WEB", permissionProfileId: profileId } },
    } });
    user.token = String(await JwtPlugin.generateToken({ id: user.id, app: "OPERATIVE_WEB" }));

    const app = express();
    app.use(express.json());
    // What requireLocalProject sets for a linked installation.
    app.use((req, _res, next) => { (req as express.Request & { localProjectId: string }).localProjectId = projects.own; next(); });
    app.use("/api/modulos", ModuloRoutes.routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db().modulo.deleteMany({ where: { proyectoId: { in: Object.values(projects) } } });
    await db().usuarioAppPermission.deleteMany({ where: { permissionProfileId: profileId } });
    await db().usuario.deleteMany({ where: { id: user.id } });
    await db().permissionProfile.deleteMany({ where: { id: profileId } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await PostgresDatabase.disconnect();
  });

  it("lists only the installation's modules, with filters, search and pagination", async () => {
    expect(ids((await call("GET", "/")).body.modulos)).toEqual(ids([{ id: modules.entrada }, { id: modules.salida }, { id: modules.pos }]));
    expect(ids((await call("GET", "/?tipos=ENTRADA,SALIDA")).body.modulos)).toEqual([modules.entrada, modules.salida].sort());
    expect(ids((await call("GET", "/?tipo=POS")).body.modulos)).toEqual([modules.pos]);
    expect(ids((await call("GET", "/?estado=false")).body.modulos)).toEqual([modules.pos]);
    // Search ignores accents and case.
    expect(ids((await call("GET", "/?search=nandu")).body.modulos)).toEqual([modules.entrada]);
    expect(await call("GET", "/?tipo=NAVE")).toMatchObject({ status: 400, body: { error: "'tipo' no es valido" } });
    expect(await call("GET", "/?estado=quizas")).toMatchObject({ status: 400, body: { error: "'estado' debe ser boolean" } });
    expect((await call("GET", `/?proyecto=${projects.other}`)).status).toBe(403);

    const paged = await call("GET", "/?page=1&limit=2");
    expect(paged.body).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(paged.body.modulos).toHaveLength(2);
    expect(ids((await call("GET", `/proyecto/${projects.own}?tipo=SALIDA`)).body.modulos)).toEqual([modules.salida]);
    expect((await call("GET", `/proyecto/${projects.other}`)).status).toBe(403);
  });

  it("reads a module only of the installation", async () => {
    expect((await call("GET", `/${modules.entrada}`)).body.modulo).toMatchObject({ id: modules.entrada, tipo: "ENTRADA" });
    expect((await call("GET", `/identificador/${tag}-Salida`)).body.modulo.id).toBe(modules.salida);
    expect((await call("GET", `/${modules.entrada}/submodulos`)).body.submodulos).toEqual([]);
    for (const path of [`/${modules.foreign}`, `/identificador/${tag}-Ajena`, `/${modules.foreign}/submodulos`]) {
      expect(await call("GET", path)).toMatchObject({ status: 403, body: { error: "Forbidden" } });
    }
    expect((await call("GET", `/${randomUUID()}`)).status).toBe(404);
  });

  it("manages device bindings and remote support only of the installation", async () => {
    expect((await call("GET", "/pending-device-bindings")).body.modulos).toEqual([]);
    const reset = await call("PATCH", `/${modules.entrada}/device-binding/reset`, {});
    expect(reset).toMatchObject({ status: 200, body: { modulo: { id: modules.entrada, deviceBinding: null } } });
    expect((await call("PATCH", `/${modules.foreign}/device-binding/reset`, {})).status).toBe(403);
    expect((await call("POST", `/${modules.foreign}/remote-support/resolve-device`)).status).toBe(403);
    expect((await call("POST", `/${modules.foreign}/remote-support/session-url`, {})).status).toBe(403);
    expect(await call("POST", "/remote-support/session-url", {})).toMatchObject({ status: 400, body: { error: "projectId es requerido" } });
    expect((await call("POST", "/remote-support/session-url", { projectId: projects.other })).status).toBe(403);
  });
});

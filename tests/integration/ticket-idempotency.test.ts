import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No real barrier or operational log in these tests.
const openBarrier = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../src/presentation/sockets/socket-server", () => ({ SocketServerPlugin: { openBarrier } }));
vi.mock("../../src/presentation/dependencies/operational-logs.dependencies", () => ({
  buildOperationalLogsService: () => ({ logEvent: async () => undefined, logIncident: async () => undefined }),
}));

import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { ModuloPostgresDatasource } from "../../src/infrastructure/datasources/parking/modulo.datasource.postgres";
import { ProyectoPostgresDatasource } from "../../src/infrastructure/datasources/parking/proyecto.datasource.postgres";
import { TicketPostgresDatasource } from "../../src/infrastructure/datasources/parking/ticket.datasource.postgres";
import { ModuloRepositoryImpl } from "../../src/infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../src/infrastructure/repositories/parking/proyecto.repository.impl";
import { TicketRepositoryImpl } from "../../src/infrastructure/repositories/parking/ticket.repository.impl";
import { TicketService } from "../../src/presentation/services/parking/ticket.service";

const db = () => PostgresDatabase.client;
const service = new TicketService(
  new TicketRepositoryImpl(new TicketPostgresDatasource()),
  new ProyectoRepositoryImpl(new ProyectoPostgresDatasource()),
  new ModuloRepositoryImpl(new ModuloPostgresDatasource()),
);

const proyectoId = randomUUID();
const entradaId = randomUUID();
const salidaId = randomUUID();
const key = () => `key-${randomUUID()}`;
let entryToken = "";
let exitToken = "";

// idBoleto has one-second resolution per gate (separate issue): move the clock
// between entries so these tests only exercise idempotency.
const nextSecond = () => vi.setSystemTime(Date.now() + 1000);

describe("ticket entry and exit idempotency", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
    await db().proyecto.create({
      data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` },
    });
    await db().modulo.createMany({
      data: [
        { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` },
        { id: salidaId, proyectoId, nombre: "Salida", tipo: "SALIDA", identificador: `S-${salidaId}` },
      ],
    });
    entryToken = String(await JwtPlugin.generateToken({ id: entradaId }));
    exitToken = String(await JwtPlugin.generateToken({ id: salidaId }));
  });

  afterAll(async () => {
    await db().ticket.deleteMany({ where: { proyectoId } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().proyecto.delete({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
    vi.useRealTimers();
  });

  it("returns the same ticket when an entry is retried with the same key", async () => {
    const usuarioId = randomUUID();
    const entryKey = key();
    const first = await service.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: entryKey });
    const retried = await service.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: entryKey });

    expect(retried.id).toBe(first.id);
    expect(await db().ticket.count({ where: { usuarioId } })).toBe(1);
    // The barrier only opens once.
    expect(openBarrier).toHaveBeenCalledTimes(1);

    // A different key is a new entry, rejected while the first ticket is active.
    nextSecond();
    await expect(service.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: key() })).rejects.toThrow(
      "El usuario ya tiene un ticket activo",
    );
  });

  it("returns the completed ticket when an exit is retried with the same key", async () => {
    const usuarioId = randomUUID();
    nextSecond();
    const ticket = await service.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: key() });
    await db().ticket.update({ where: { id: ticket.id }, data: { pagado: true } });

    const exitKey = key();
    const exited = await service.killTicketFromModuleToken(usuarioId, exitToken, { idempotencyKey: exitKey });
    expect(exited.status).toBe("COMPLETED");
    const retried = await service.killTicketFromModuleToken(usuarioId, exitToken, { idempotencyKey: exitKey });
    expect(retried.id).toBe(ticket.id);

    // The entry key does not count as an exit.
    nextSecond();
    const other = await service.createTicketFromModuleToken(randomUUID(), entryToken, { idempotencyKey: exitKey.replace("key-", "entry-") });
    await expect(service.killTicketFromModuleToken(other.usuario, exitToken, { idempotencyKey: key() })).rejects.toThrow(
      "No cuenta con un ticket pagado para salir",
    );
  });
});

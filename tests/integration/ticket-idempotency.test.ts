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
import { buildParkingFeeService } from "../../src/presentation/dependencies/parking.dependencies";

const db = () => PostgresDatabase.client;
const service = new TicketService(
  new TicketRepositoryImpl(new TicketPostgresDatasource()),
  new ProyectoRepositoryImpl(new ProyectoPostgresDatasource()),
  new ModuloRepositoryImpl(new ModuloPostgresDatasource()),
  buildParkingFeeService(),
);

const proyectoId = randomUUID();
const entradaId = randomUUID();
const salidaId = randomUUID();
const key = () => `key-${randomUUID()}`;
let entryToken = "";
let exitToken = "";

describe("ticket entry and exit", () => {
  beforeAll(async () => {
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
    await expect(service.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: key() })).rejects.toThrow(
      "El usuario ya tiene un ticket activo",
    );
  });

  it("issues distinct tickets for entries in the same second at the same gate", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
      const first = await service.createTicketFromModuleToken(randomUUID(), entryToken);
      vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
      const second = await service.createTicketFromModuleToken(randomUUID(), entryToken);
      expect(second.id).not.toBe(first.id);
      expect(second.idBoleto).not.toBe(first.idBoleto);
      // The readable prefix (00 + date and time to the second) is kept.
      expect(first.idBoleto.slice(0, 14)).toBe(second.idBoleto.slice(0, 14));
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the completed ticket when an exit is retried with the same key", async () => {
    const usuarioId = randomUUID();
    const ticket = await service.createTicketFromModuleToken(usuarioId, entryToken, { idempotencyKey: key() });
    await db().ticket.update({ where: { id: ticket.id }, data: { pagado: true } });

    const exitKey = key();
    const exited = await service.killTicketFromModuleToken(usuarioId, exitToken, { idempotencyKey: exitKey });
    expect(exited.status).toBe("COMPLETED");
    const retried = await service.killTicketFromModuleToken(usuarioId, exitToken, { idempotencyKey: exitKey });
    expect(retried.id).toBe(ticket.id);

    // The entry key does not count as an exit.
    const other = await service.createTicketFromModuleToken(randomUUID(), entryToken, { idempotencyKey: exitKey.replace("key-", "entry-") });
    await expect(service.killTicketFromModuleToken(other.usuario, exitToken, { idempotencyKey: key() })).rejects.toThrow(
      "No cuenta con un ticket pagado para salir",
    );
  });
});

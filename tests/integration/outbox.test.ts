import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import type { TicketEntity } from "../../src/domain/entities/parking/ticket.entity";
import { TicketPostgresDatasource } from "../../src/infrastructure/datasources/parking/ticket.datasource.postgres";
import { OutboxPostgresDatasource } from "../../src/infrastructure/datasources/system/outbox.datasource.postgres";
import { prismaDb, PostgresTransactionRunner } from "../../src/infrastructure/datasources/system/transaction-runner.postgres";
import { OutboxRepositoryImpl } from "../../src/infrastructure/repositories/system/outbox.repository.impl";
import type { LocalInstallationService } from "../../src/presentation/services/installation/local-installation.service";
import { OutboxPublisherService } from "../../src/presentation/services/outbox/outbox-publisher.service";

const DAY = 24 * 60 * 60 * 1000;
const db = () => PostgresDatabase.client;
const tickets = new TicketPostgresDatasource();
const outbox = new OutboxRepositoryImpl(new OutboxPostgresDatasource());
const proyectoId = randomUUID();
const entradaId = randomUUID();

const installations = {
  findDefault: async () => ({ status: "linked", proyectoId, installationId: "viggo-test-local-001", encryptedSyncToken: "" }),
} as unknown as LocalInstallationService;
const publisher = new OutboxPublisherService(outbox, installations, { batchSize: 10, baseDelayMs: 1_000, maxDelayMs: 60_000 });

/** In-memory ADMINISTRATIVO inbox with the same dedupe rule (by eventId). */
const cloud = {
  mode: "up" as "up" | "down" | "lose-response",
  rejectEventIds: new Set<string>(),
  inbox: new Map<string, Record<string, unknown>>(),
  received: [] as string[],
};

const newTicket = () =>
  tickets.create({
    proyecto: proyectoId,
    entrada: entradaId,
    usuario: randomUUID(),
    idBoleto: `B-${randomUUID()}`,
    horaInicio: Date.now(),
    horaConsulta: -1,
    horaCobro: -1,
    horaSalida: -1,
    duracion: 0,
    monto: 0,
    pagado: false,
    status: "ACTIVE",
    barrierOpenedAt: -1,
    barrierConfirmedAt: -1,
    fraudDetectedAt: -1,
    fraudReason: "",
  } as Omit<TicketEntity, "id">);

const pendingIds = async () =>
  (await db().outboxEvent.findMany({ where: { sentAt: null }, orderBy: { position: "asc" } })).map((event) => event.eventId);

describe("outbox (Postgres)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
    await db().proyecto.create({
      data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` },
    });
    await db().modulo.create({ data: { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` } });
  });

  beforeEach(async () => {
    // Other test files leave events behind; each test starts with an empty queue.
    await db().outboxEvent.deleteMany({});
    cloud.mode = "up";
    cloud.rejectEventIds.clear();
    cloud.inbox.clear();
    cloud.received = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      if (cloud.mode === "down") throw new TypeError("fetch failed");
      const event = JSON.parse(String(init.body)) as Record<string, unknown>;
      const eventId = String(event.eventId);
      if (cloud.rejectEventIds.has(eventId)) {
        return new Response(JSON.stringify({ error: "payload invalido" }), { status: 400 });
      }
      const duplicate = cloud.inbox.has(eventId);
      if (!duplicate) {
        cloud.inbox.set(eventId, event);
        cloud.received.push(eventId);
      }
      if (cloud.mode === "lose-response") throw new TypeError("socket hang up");
      return new Response(JSON.stringify({ accepted: true, duplicate }), { status: duplicate ? 200 : 202 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await db().ticket.deleteMany({ where: { proyectoId } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().proyecto.delete({ where: { id: proyectoId } });
    await db().outboxEvent.deleteMany({});
    await PostgresDatabase.disconnect();
  });

  it("records an event in the same transaction as each change", async () => {
    const ticket = await newTicket();
    await tickets.update(ticket.id, { horaSalida: Date.now(), status: "COMPLETED" });

    const events = await db().outboxEvent.findMany({ where: { aggregateId: ticket.id }, orderBy: { position: "asc" } });
    expect(events.map((event) => event.eventType)).toEqual(["ticket.created", "ticket.updated"]);
    expect(events[1].payload).toMatchObject({ id: ticket.id, status: "COMPLETED", proyecto_id: proyectoId });

    // A rolled back change leaves no event behind.
    const before = await db().outboxEvent.count();
    await expect(
      new PostgresTransactionRunner().run(async (tx) => {
        await prismaDb(tx).ticket.update({ where: { id: ticket.id }, data: { fraudReason: "x" } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await db().outboxEvent.count()).toBe(before);
  });

  it("keeps every event through days without connection, then delivers them in order", async () => {
    cloud.mode = "down";
    for (let index = 0; index < 4; index += 1) await newTicket();
    const queued = await pendingIds();
    expect(queued).toHaveLength(4);

    const start = Date.now();
    for (const day of [0, 1, 2, 3]) {
      const result = await publisher.publishPending(start + day * DAY);
      expect(result).toMatchObject({ sent: 0, stopped: true, reason: "UNREACHABLE" });
    }
    // Only the head of the queue is retried; it now waits before trying again.
    expect((await db().outboxEvent.findUniqueOrThrow({ where: { eventId: queued[0] } })).attempts).toBe(4);
    expect(await publisher.publishPending(start + 3 * DAY)).toMatchObject({ stopped: true, reason: "BACKOFF" });
    expect(await pendingIds()).toEqual(queued);

    cloud.mode = "up";
    const result = await publisher.publishPending(start + 4 * DAY);
    expect(result).toMatchObject({ sent: 4, stopped: false });
    expect(cloud.received).toEqual(queued);
    expect(await pendingIds()).toEqual([]);
    expect((await publisher.stats()).pending).toBe(0);
  });

  it("resends after a crash mid-delivery without duplicating in the cloud", async () => {
    await newTicket();
    const [eventId] = await pendingIds();

    // The cloud stored the event but the answer never arrived (crash / lost connection).
    cloud.mode = "lose-response";
    expect(await publisher.publishPending()).toMatchObject({ sent: 0, reason: "UNREACHABLE" });
    expect(await pendingIds()).toEqual([eventId]);

    cloud.mode = "up";
    expect(await publisher.publishPending(Date.now() + DAY)).toMatchObject({ sent: 1 });
    expect(cloud.received).toEqual([eventId]);
    expect(cloud.inbox.size).toBe(1);
  });

  it("does not let an event the cloud refuses block the rest", async () => {
    await newTicket();
    await newTicket();
    const [refused, next] = await pendingIds();
    cloud.rejectEventIds.add(refused);

    expect(await publisher.publishPending()).toMatchObject({ sent: 1, rejected: 1, stopped: false });
    expect(cloud.received).toEqual([next]);

    // Later batches skip it while it waits, and new events still flow.
    await newTicket();
    expect(await publisher.publishPending()).toMatchObject({ sent: 1, rejected: 0 });
    const refusedRow = await db().outboxEvent.findUniqueOrThrow({ where: { eventId: refused } });
    expect(refusedRow.sentAt).toBeNull();
    expect(refusedRow.lastError).toMatch(/^rejected: HTTP 400/);
  });

  it("purges delivered events after the retention period", async () => {
    await newTicket();
    await publisher.publishPending();
    expect(await outbox.purgeSentBefore(Date.now() - DAY)).toBe(0);
    expect(await outbox.purgeSentBefore(Date.now() + 1)).toBe(1);
  });
});

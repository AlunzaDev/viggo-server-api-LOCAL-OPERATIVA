import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildLocalRetentionRepository } from "../../src/presentation/dependencies/retention.dependencies";
import { LocalRetentionScheduler, localRetentionPlan } from "../../src/presentation/services/retention/local-retention.scheduler";

// LOCAL-OPERATIVA#26: the PC drops old operation the cloud already has; nothing else.
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const DAY = 86_400_000;
const NOW = Date.now();
const old = new Date(NOW - 200 * DAY);
const recent = new Date(NOW - 10 * DAY);
const proyectoId = randomUUID();
const moduloId = randomUUID();
const usuarioId = randomUUID();
const pensionId = randomUUID();
const passId = randomUUID();
const ids: Record<string, string> = {};
/** Rows whose cloud copy is still pending: an unsent outbox event keeps them. */
const unconfirmed: Array<[string, string]> = [];

let boletos = 0;
const ticket = async (key: string, horaInicio: Date, horaSalida: Date | null) => {
  ids[key] = (await db().ticket.create({ data: {
    proyectoId, entradaId: moduloId, usuarioId, idBoleto: `${tag}-${++boletos}`, horaInicio, horaSalida, status: horaSalida ? "COMPLETED" : "ACTIVE",
  } })).id;
};
const shift = async (key: string, status: "open" | "closed", closedAt: Date | null) => {
  ids[key] = (await db().cashRegisterShift.create({ data: {
    proyectoId, moduloId, openedByUserId: usuarioId, status, openingAmount: 0, openedAt: old, closedAt,
  } })).id;
};
const movement = async (key: string, shiftKey: string, sessionKey?: string) => {
  ids[key] = (await db().cashRegisterMovement.create({ data: {
    shiftId: ids[shiftKey]!, proyectoId, moduloId, createdByUserId: usuarioId, type: "manual_income", direction: "in", concept: "x", amount: 10, createdAt: old,
    ...(sessionKey ? { relatedCashPaymentSessionId: ids[sessionKey] } : {}),
  } })).id;
};
const scheduler = () => new LocalRetentionScheduler(buildLocalRetentionRepository(),
  localRetentionPlan({ operation: 180, audit: 90, commandReceipts: 30 }), { batchSize: 2 });
const exists = async (table: string, id: string) =>
  (await db().$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM ${table} WHERE id = $1::uuid`, id))[0]!.n === 1;

describe("LocalRetentionScheduler", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    await db().proyecto.create({ data: { id: proyectoId, nombre: "Plaza", coordinates: [0, 0], ciudad: "CDMX", identificador: `R-${tag}` } });
    await db().modulo.create({ data: { id: moduloId, proyectoId, nombre: "Caja", tipo: "POS", identificador: `RC-${tag}` } });
    await db().usuario.create({ data: { id: usuarioId, nombre: "Ana", apellido: tag, correo: `${usuarioId}@viggo.test`, telefono: usuarioId.slice(0, 10), password: "hash" } });
    await db().pension.create({ data: { id: pensionId, proyectoId, nombre: "Mensual", precio: 1500 } });
    await db().pensionPass.create({ data: { id: passId, pensionId, name: "Pase", idPass: `${tag}-p`, created: old } });

    await ticket("ticketOld", old, old);
    await ticket("ticketPending", old, old);
    await ticket("ticketOpen", old, null);
    await ticket("ticketRecent", recent, recent);
    await ticket("ticketInShift", old, old);

    // Shift 1: closed long ago, everything confirmed -> goes as a whole.
    await shift("shiftOld", "closed", old);
    ids.session = (await db().cashPaymentSession.create({ data: {
      ticketId: ids.ticketInShift!, idBoleto: "x", status: "paid", amountExpected: 10, moduloId, startedAt: old, completedAt: old, cashRegisterShiftId: ids.shiftOld,
    } })).id;
    await movement("movementOld", "shiftOld", "session");
    ids.cut = (await db().cashRegisterCut.create({ data: {
      shiftId: ids.shiftOld!, generatedByUserId: usuarioId, generatedAt: old, openingAmount: 0, totalIn: 10, totalOut: 0, expectedAmount: 10, countedAmount: 10, differenceAmount: 0, status: "balanced",
    } })).id;
    // Shift 2: closed long ago, one movement not in the cloud yet -> stays. Shift 3: still open.
    await shift("shiftPending", "closed", old);
    await movement("movementPending", "shiftPending");
    await shift("shiftOpen", "open", null);

    for (const [key, status] of [["paymentOld", "succeeded"], ["paymentPending", "pending"]] as const) {
      ids[key] = (await db().payment.create({ data: { usuarioId, type: "ticket", concept: tag, amount: 10, currency: "MXN", status, paidAt: old, referenceType: "ticket", referenceId: randomUUID() } })).id;
      await db().$executeRawUnsafe(`UPDATE payments SET updated_at = $1 WHERE id = $2::uuid`, old, ids[key]);
    }
    for (const key of ["moveOld", "movePending"]) {
      ids[key] = (await db().pensionMove.create({ data: { moduloId, proyectoId, pensionPassId: passId, tipo: "ENTRADA_PENSION", fecha: old } })).id;
    }
    ids.auditOld = (await db().configSyncAudit.create({ data: { installationId: tag, proyectoId, status: "success", startedAt: old, finishedAt: old, durationMs: 1 } })).id;
    ids.auditRecent = (await db().configSyncAudit.create({ data: { installationId: tag, proyectoId, status: "success", startedAt: recent, finishedAt: recent, durationMs: 1 } })).id;
    ids.requestApproved = (await db().moduloDeviceBindingRequest.create({ data: { moduloId, fingerprint: `${tag}-a`, status: "APPROVED", requestedAt: old, resolvedAt: old } })).id;
    ids.requestPending = (await db().moduloDeviceBindingRequest.create({ data: { moduloId, fingerprint: `${tag}-b`, status: "PENDING", requestedAt: old } })).id;
    await db().mobileCommandReceipt.create({ data: { operationId: `${tag}-old`, type: "x", result: {}, processedAt: old } });

    // Everything reached the cloud, except these three.
    const ours = Object.values(ids);
    await db().$executeRawUnsafe(`UPDATE outbox_events SET sent_at = now() WHERE aggregate_id = ANY($1::text[])`, ours);
    unconfirmed.push(["ticket", ids.ticketPending!], ["cash_register_movement", ids.movementPending!], ["pension_move", ids.movePending!]);
    for (const [type, id] of unconfirmed) {
      await db().$executeRawUnsafe(`INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload) VALUES ($1, $2, $3, '{}')`, `${type}.updated`, type, id);
    }
  });

  afterAll(async () => {
    const ours = Object.values(ids);
    await db().cashRegisterMovement.deleteMany({ where: { proyectoId } });
    await db().cashPaymentSession.deleteMany({ where: { moduloId } });
    await db().cashRegisterCut.deleteMany({ where: { generatedByUserId: usuarioId } });
    await db().cashRegisterShift.deleteMany({ where: { proyectoId } });
    await db().ticket.deleteMany({ where: { proyectoId } });
    await db().payment.deleteMany({ where: { concept: tag } });
    await db().pensionMove.deleteMany({ where: { proyectoId } });
    await db().configSyncAudit.deleteMany({ where: { installationId: tag } });
    await db().moduloDeviceBindingRequest.deleteMany({ where: { moduloId } });
    await db().mobileCommandReceipt.deleteMany({ where: { operationId: { startsWith: tag } } });
    await db().$executeRawUnsafe(`DELETE FROM outbox_events WHERE aggregate_id = ANY($1::text[])`, ours);
    await db().pensionPass.deleteMany({ where: { id: passId } });
    await db().pension.deleteMany({ where: { id: pensionId } });
    await db().modulo.deleteMany({ where: { id: moduloId } });
    await db().usuario.deleteMany({ where: { id: usuarioId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("drops old operation the cloud already has, and keeps the rest", async () => {
    const run = await scheduler().runOnce(NOW);
    expect(run?.complete).toBe(true);

    // A closed old shift goes with its movement, payment session and cut; then its ticket can go.
    for (const [table, key] of [["cash_register_shifts", "shiftOld"], ["cash_register_movements", "movementOld"], ["cash_payment_sessions", "session"],
      ["cash_register_cuts", "cut"], ["tickets", "ticketInShift"], ["tickets", "ticketOld"], ["payments", "paymentOld"], ["pension_moves", "moveOld"],
      ["config_sync_audits", "auditOld"], ["modulo_device_binding_requests", "requestApproved"]] as const) {
      expect(await exists(table, ids[key]!), `${key} should be purged`).toBe(false);
    }
    // Not in the cloud yet, still open, recent or pending.
    for (const [table, key] of [["tickets", "ticketPending"], ["tickets", "ticketOpen"], ["tickets", "ticketRecent"],
      ["cash_register_shifts", "shiftPending"], ["cash_register_movements", "movementPending"], ["cash_register_shifts", "shiftOpen"],
      ["payments", "paymentPending"], ["pension_moves", "movePending"], ["config_sync_audits", "auditRecent"],
      ["modulo_device_binding_requests", "requestPending"]] as const) {
      expect(await exists(table, ids[key]!), `${key} should stay`).toBe(true);
    }
    expect(await db().mobileCommandReceipt.count({ where: { operationId: { startsWith: tag } } })).toBe(0);
  });

  it("deletes nothing in the cloud: deletions do not reach the outbox", async () => {
    const rows = await db().$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = ANY($1::text[]) AND event_type LIKE '%deleted%'`, Object.values(ids));
    expect(rows[0]!.n).toBe(0);
  });

  it("once the cloud has the pending ticket, it goes too", async () => {
    await db().$executeRawUnsafe(`UPDATE outbox_events SET sent_at = now() WHERE aggregate_id = $1`, ids.ticketPending);
    await scheduler().runOnce(NOW);
    expect(await exists("tickets", ids.ticketPending!)).toBe(false);
  });
});

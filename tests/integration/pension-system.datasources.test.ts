import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { LocalInstallationPostgresDatasource } from "../../src/infrastructure/datasources/installation/local-installation.datasource.postgres";
import { LocalReportsPostgresDatasource } from "../../src/infrastructure/datasources/local-reports/local-reports.datasource.postgres";
import { PensionMovePostgresDatasource } from "../../src/infrastructure/datasources/pension/pension-move.datasource.postgres";
import { HealthPostgresDatasource } from "../../src/infrastructure/datasources/system/health.datasource.postgres";
import { MonthlyFlushPostgresDatasource } from "../../src/infrastructure/datasources/system/monthly-flush.datasource.postgres";
import { OperationalLogPostgresDatasource } from "../../src/infrastructure/datasources/system/operational-log.datasource.postgres";
import { PostgresTransactionRunner } from "../../src/infrastructure/datasources/system/transaction-runner.postgres";
import { MonthlyFlushRepositoryImpl } from "../../src/infrastructure/repositories/system/monthly-flush.repository.impl";
import { OperationalLogRepositoryImpl } from "../../src/infrastructure/repositories/system/operational-log.repository.impl";
import { MonthlyFlushAdminService, STALE_RUNNING_FLUSH_MS } from "../../src/presentation/services/monthly-flush/monthly-flush-admin.service";

const db = () => PostgresDatabase.client;
const moves = new PensionMovePostgresDatasource();
const logs = new OperationalLogPostgresDatasource();
const flush = new MonthlyFlushPostgresDatasource();
const installations = new LocalInstallationPostgresDatasource();
const transactions = new PostgresTransactionRunner();

const proyectoId = randomUUID();
const entradaId = randomUUID();
const salidaId = randomUUID();
const pensionId = randomUUID();
const passId = randomUUID();
// An old month nobody else writes to, so the flush only touches these logs.
const MONTH = "2020-02";
const inMonth = (day: number) => Date.UTC(2020, 1, day, 12, 0, 0);

const passage = (tipo: "ENTRADA" | "SALIDA") => ({
  pensionPassId: passId,
  moduloId: tipo === "ENTRADA" ? entradaId : salidaId,
  proyectoId,
  tipo,
  fecha: Date.now(),
});

const insideNow = async () => (await db().pensionPass.findUniqueOrThrow({ where: { id: passId } })).inParking;
const movesCount = (tipo: "ENTRADA" | "SALIDA") => db().pensionMove.count({ where: { pensionPassId: passId, tipo } });

describe("pension passages, logs, flush and installation (Postgres)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    await db().proyecto.create({
      data: { id: proyectoId, nombre: "Plaza", coordinates: [-103.3, 20.6], ciudad: "GDL", identificador: `P-${proyectoId}` },
    });
    await db().modulo.createMany({
      data: [
        { id: entradaId, proyectoId, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${entradaId}` },
        { id: salidaId, proyectoId, nombre: "Salida", tipo: "SALIDA", identificador: `S-${salidaId}` },
      ],
    });
    await db().pension.create({ data: { id: pensionId, proyectoId, nombre: "Mensual", precio: "1500.00" } });
    await db().pensionPass.create({
      data: { id: passId, pensionId, name: "Pase", idPass: `PASS-${passId}`, vigent: true, created: new Date() },
    });
  });

  afterAll(async () => {
    await db().pensionMove.deleteMany({ where: { proyectoId } });
    await db().pensionPass.deleteMany({ where: { id: passId } });
    await db().pension.deleteMany({ where: { id: pensionId } });
    await db().modulo.deleteMany({ where: { proyectoId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await db().operationalLog.deleteMany({ where: { projectId: proyectoId } });
    await db().operationalLogFlushSummary.deleteMany({ where: { projectId: proyectoId } });
    await db().monthlyFlushJob.deleteMany({ where: { monthKey: MONTH } });
    await db().localInstallation.deleteMany({});
    await PostgresDatabase.disconnect();
  });

  describe("anti-passback", () => {
    it("records an entry and rejects a second one", async () => {
      const move = await moves.registerPassage(passage("ENTRADA"));
      expect(move.tipo).toBe("ENTRADA");
      expect(await insideNow()).toBe(true);
      await expect(moves.registerPassage(passage("ENTRADA"))).rejects.toMatchObject({ code: "PENSION_PASSBACK_ENTRY" });
      expect(await movesCount("ENTRADA")).toBe(1);
    });

    it("lets only one of two simultaneous exits through", async () => {
      const results = await Promise.allSettled([moves.registerPassage(passage("SALIDA")), moves.registerPassage(passage("SALIDA"))]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await insideNow()).toBe(false);
      expect(await movesCount("SALIDA")).toBe(1);
    });

    it("keeps nothing when the barrier does not open", async () => {
      await expect(
        transactions.run(async (tx) => {
          await moves.registerPassage(passage("ENTRADA"), tx);
          throw new Error("La barrera no respondio");
        }),
      ).rejects.toThrow("La barrera no respondio");
      expect(await insideNow()).toBe(false);
      expect(await movesCount("ENTRADA")).toBe(1);
    });

    it("lists the moves of the pass with their API types", async () => {
      const history = await moves.getByPensionPass(passId);
      expect(history.map((move) => move.tipo)).toEqual(["ENTRADA", "SALIDA"]);
    });
  });

  describe("operational logs and monthly flush", () => {
    const log = (day: number, severity: "info" | "critical", message: string) =>
      logs.create({
        kind: severity === "critical" ? "incident" : "event",
        scope: "access_flow",
        type: "ticket_created",
        severity,
        projectId: proyectoId,
        projectName: "Plaza",
        source: "backend",
        message,
        metadata: { day },
        createdAt: inMonth(day),
        updatedAt: inMonth(day),
      });

    it("lists logs with filters, search and counts", async () => {
      await log(3, "info", "Entrada registrada");
      await log(3, "info", "Entrada registrada");
      await log(4, "critical", "Barrera sin confirmar paso");

      const page = await logs.list({ page: 1, limit: 10, projectId: proyectoId, from: inMonth(1), to: inMonth(28) });
      expect(page.total).toBe(3);
      expect(page.summary.byKind).toEqual({ event: 2, incident: 1 });
      expect(page.logs[0].createdAt).toBe(inMonth(4));

      const search = await logs.list({ page: 1, limit: 10, projectId: proyectoId, search: "BARRERA" });
      expect(search.total).toBe(1);
      expect(search.logs[0].metadata).toEqual({ day: 4 });
    });

    it("summarizes and deletes the logs of a month, idempotently", async () => {
      const service = new MonthlyFlushAdminService(new MonthlyFlushRepositoryImpl(flush), new OperationalLogRepositoryImpl(logs));
      const result = await service.runManual({ monthKey: MONTH, userId: "u1", userName: "Admin" });
      expect(result.summary).toMatchObject({ totalSourceRecordsAffected: 3, deletedLogs: 3, flushedDocuments: 2 });
      expect(await db().operationalLog.count({ where: { projectId: proyectoId } })).toBe(0);

      const summaries = await flush.listSummaries({ projectId: proyectoId });
      expect(summaries.map((summary) => [summary.dayKey, summary.totalLogs]).sort()).toEqual([
        ["2020-02-03", 2],
        ["2020-02-04", 1],
      ]);

      // Re-running with the logs gone changes nothing.
      await service.runManual({ monthKey: MONTH, userId: "u1", userName: "Admin" });
      expect(await db().operationalLogFlushSummary.count({ where: { projectId: proyectoId } })).toBe(2);
      expect((await flush.listRecentJobs(2)).every((job) => job.status === "completed")).toBe(true);
    });

    it("allows only one running flush", async () => {
      const job = { monthKey: MONTH, triggerType: "manual" as const, status: "running" as const, startedAt: Date.now(), completedAt: null, error: null, summary: null };
      const running = await flush.createJob(job);
      await expect(flush.createJob(job)).rejects.toThrow("Ya hay un flush en ejecucion");
      await flush.updateJob({ ...running, status: "failed", completedAt: Date.now(), error: "test" });
      expect(await flush.findRunningJob()).toBeNull();
    });

    it("does not let an interrupted flush block the next ones", async () => {
      const service = new MonthlyFlushAdminService(new MonthlyFlushRepositoryImpl(flush), new OperationalLogRepositoryImpl(logs));
      const job = { monthKey: MONTH, triggerType: "manual" as const, status: "running" as const, completedAt: null, error: null, summary: null };

      // A flush that is still running (recent) blocks a new one.
      const recent = await flush.createJob({ ...job, startedAt: Date.now() });
      await expect(service.runManual({ monthKey: MONTH })).rejects.toThrow("Ya hay un flush en ejecucion");
      await flush.updateJob({ ...recent, status: "failed", completedAt: Date.now(), error: "test" });

      // One left `running` by a crash is marked failed and the new flush runs.
      const stuck = await flush.createJob({ ...job, startedAt: Date.now() - STALE_RUNNING_FLUSH_MS - 60_000 });
      expect(await service.runManual({ monthKey: MONTH })).toMatchObject({ ok: true });
      const stored = await db().monthlyFlushJob.findUniqueOrThrow({ where: { id: stuck.id } });
      expect(stored).toMatchObject({ status: "failed" });
      expect(stored.error).toContain("interrumpido");
      expect(await flush.findRunningJob()).toBeNull();
    });
  });

  describe("local installation", () => {
    it("stores the link and the sync state in the shape callers read", async () => {
      await installations.upsertRequest({ installationId: "viggo-test-local-001", status: "requested", requestedAt: inMonth(1) });
      const linked = await installations.linkProject({
        proyectoId,
        proyectoNombre: "Plaza",
        proyectoIdentificador: "P1",
        source: "cloudApproval",
        cloudRequestId: "req-1",
        encryptedSyncToken: "cipher",
      });
      expect(linked).toMatchObject({ key: "default", status: "linked", proyectoId, installationId: "viggo-test-local-001" });
      expect(typeof linked.syncTokenIssuedAt).toBe("number");
      expect(linked.requestedAt).toBe(inMonth(1));

      // Snapshot versions are 40-bit hashes.
      const version = 0xfffffffffe;
      const synced = await installations.updateSyncState({ lastConfigurationVersion: version, lastSyncAt: Date.now(), lastSyncStatus: "success" });
      expect(synced.lastConfigurationVersion).toBe(version);
      expect((await installations.findDefault())?.lastSyncStatus).toBe("success");
    });

    it("reports database health and local activity", async () => {
      const health = new HealthPostgresDatasource();
      expect((await health.getDatabaseHealth()).status).toBe("ok");
      expect(await health.countDevices(new Date())).toMatchObject({ total: 0 });

      const reports = new LocalReportsPostgresDatasource();
      const snapshot = await reports.getSnapshotData({ proyectoId, from: 0, to: Date.now() });
      expect(snapshot.summary.tickets).toEqual({ total: 0, paid: 0, unpaid: 0, amount: 0 });
      expect((await reports.getInstallation())?.proyectoId).toBe(proyectoId);
    });
  });
});

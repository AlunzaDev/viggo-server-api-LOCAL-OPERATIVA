import { PostgresDatabase } from "../../../data/postgres";
import type {
  MonthlyFlushJob as JobRow,
  OperationalLogFlushSummary as SummaryRow,
  Prisma,
} from "../../../generated/prisma/client";
import { MonthlyFlushDatasource } from "../../../domain/datasources/system/monthly-flush.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { MonthlyFlushConfigEntity } from "../../../domain/entities/system/monthly-flush-config.entity";
import { MonthlyFlushJobEntity } from "../../../domain/entities/system/monthly-flush-job.entity";
import { OperationalLogFlushSummaryEntity } from "../../../domain/entities/system/operational-log-flush-summary.entity";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import { isUuid, toEpochMs, translatePrismaError } from "../postgres/prisma-errors";

type SummaryQuery = Parameters<MonthlyFlushDatasource["listSummaries"]>[0];

const toJobEntity = (row: JobRow): MonthlyFlushJobEntity =>
  MonthlyFlushJobEntity.fromObject({
    ...row,
    startedAt: row.startedAt.getTime(),
    completedAt: toEpochMs(row.completedAt) ?? null,
  });

const toSummaryEntity = (row: SummaryRow): OperationalLogFlushSummaryEntity =>
  new OperationalLogFlushSummaryEntity({
    ...row,
    firstCreatedAt: row.firstCreatedAt.getTime(),
    lastCreatedAt: row.lastCreatedAt.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });

const jobColumns = (job: Omit<MonthlyFlushJobEntity, "id">) => ({
  monthKey: job.monthKey,
  triggerType: job.triggerType,
  status: job.status,
  startedAt: new Date(job.startedAt),
  completedAt: job.completedAt === null ? null : new Date(job.completedAt),
  error: job.error,
  requestedByUserId: job.requestedByUserId ?? "",
  requestedByUserName: job.requestedByUserName ?? "",
  summary: (job.summary ?? undefined) as Prisma.InputJsonValue | undefined,
});

export class MonthlyFlushPostgresDatasource implements MonthlyFlushDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async findConfigByKey(key: string): Promise<MonthlyFlushConfigEntity | null> {
    const row = await this.db.monthlyFlushConfig.findUnique({ where: { key } });
    return row
      ? MonthlyFlushConfigEntity.fromObject({
          ...row,
          id: row.key,
          lastAutomaticRunAt: toEpochMs(row.lastAutomaticRunAt) ?? null,
          updatedAt: row.updatedAt.getTime(),
        })
      : null;
  }

  async saveConfig(config: MonthlyFlushConfigEntity): Promise<MonthlyFlushConfigEntity> {
    const data = {
      enabled: config.enabled,
      partialCurrentMonthEnabled: config.partialCurrentMonthEnabled,
      closeDay: config.closeDay,
      partialDays: config.partialDays,
      hour: config.hour,
      minute: config.minute,
      lastAutomaticRunAt: config.lastAutomaticRunAt === null ? null : new Date(config.lastAutomaticRunAt),
      updatedAt: new Date(config.updatedAt),
      updatedByUserId: config.updatedByUserId ?? "",
      updatedByUserName: config.updatedByUserName ?? "",
    };
    await this.db.monthlyFlushConfig.upsert({ where: { key: config.key }, create: { key: config.key, ...data }, update: data });
    return (await this.findConfigByKey(config.key))!;
  }

  /** A second running job is rejected by the database (partial unique index). */
  async createJob(job: Omit<MonthlyFlushJobEntity, "id">): Promise<MonthlyFlushJobEntity> {
    try {
      return toJobEntity(await this.db.monthlyFlushJob.create({ data: jobColumns(job) }));
    } catch (error) {
      const translated = translatePrismaError(error);
      if (translated instanceof UniqueConstraintError) throw CustomError.badRequest("Ya hay un flush en ejecucion");
      throw translated;
    }
  }

  async updateJob(job: MonthlyFlushJobEntity): Promise<MonthlyFlushJobEntity> {
    if (!isUuid(job.id)) throw CustomError.notFound("Flush no encontrado");
    const { id, ...values } = job;
    return toJobEntity(await this.db.monthlyFlushJob.update({ where: { id }, data: jobColumns(values) }));
  }

  async findRunningJob(): Promise<MonthlyFlushJobEntity | null> {
    const row = await this.db.monthlyFlushJob.findFirst({ where: { status: "running" } });
    return row ? toJobEntity(row) : null;
  }

  async listRecentJobs(limit: number): Promise<MonthlyFlushJobEntity[]> {
    const rows = await this.db.monthlyFlushJob.findMany({ orderBy: { startedAt: "desc" }, take: limit });
    return rows.map(toJobEntity);
  }

  /** Upserts by the summary key; recomputed totals replace the stored ones (idempotent). */
  async bulkUpsertSummaries(summaries: Array<Omit<OperationalLogFlushSummaryEntity, "id">>): Promise<void> {
    if (summaries.length === 0) return;
    await this.db.$transaction(async (tx) => {
      for (const summary of summaries) {
        const key = {
          monthKey: summary.monthKey,
          dayKey: summary.dayKey,
          flushType: summary.flushType,
          kind: summary.kind,
          scope: summary.scope,
          severity: summary.severity,
          type: summary.type,
          installationId: summary.installationId ?? "",
          projectId: summary.projectId ?? "",
          moduloId: summary.moduloId ?? "",
          source: summary.source,
        };
        const values = {
          projectName: summary.projectName ?? "",
          moduloNombre: summary.moduloNombre ?? "",
          totalLogs: summary.totalLogs,
          firstCreatedAt: new Date(summary.firstCreatedAt),
          lastCreatedAt: new Date(summary.lastCreatedAt),
          sampleMessage: summary.sampleMessage ?? "",
          createdAt: new Date(summary.createdAt),
          updatedAt: new Date(summary.updatedAt),
        };
        await tx.operationalLogFlushSummary.upsert({
          where: { monthKey_dayKey_flushType_kind_scope_severity_type_installationId_projectId_moduloId_source: key },
          create: { ...key, ...values },
          update: values,
        });
      }
    }, { timeout: 60_000 });
  }

  async listSummaries(query: SummaryQuery): Promise<OperationalLogFlushSummaryEntity[]> {
    const where: Prisma.OperationalLogFlushSummaryWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.scope) where.scope = query.scope;
    if (query.severity) where.severity = query.severity;
    if (query.projectId) where.projectId = query.projectId;
    else if (query.projectIds?.length) where.projectId = { in: query.projectIds };
    if (query.moduloId) where.moduloId = query.moduloId;
    if (query.type) where.type = query.type;
    if (query.from !== undefined || query.to !== undefined) {
      where.lastCreatedAt = {
        ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
        ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
      };
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = (["sampleMessage", "type", "moduloNombre", "projectName"] as const).map((field) => ({
        [field]: { contains: search, mode: "insensitive" },
      }));
    }
    const rows = await this.db.operationalLogFlushSummary.findMany({ where, orderBy: { lastCreatedAt: "desc" } });
    return rows.map(toSummaryEntity);
  }
}

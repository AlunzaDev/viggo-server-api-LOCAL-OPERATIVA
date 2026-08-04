import { MonthlyFlushConfigModel } from "../../../data/mongo/models/system/monthly-flush-config.schema";
import { MonthlyFlushJobModel } from "../../../data/mongo/models/system/monthly-flush-job.schema";
import { OperationalLogFlushSummaryModel } from "../../../data/mongo/models/system/operational-log-flush-summary.schema";
import { MonthlyFlushDatasource } from "../../../domain/datasources/system/monthly-flush.datasource";
import { MonthlyFlushConfigEntity } from "../../../domain/entities/system/monthly-flush-config.entity";
import { MonthlyFlushJobEntity } from "../../../domain/entities/system/monthly-flush-job.entity";
import { OperationalLogFlushSummaryEntity } from "../../../domain/entities/system/operational-log-flush-summary.entity";

export class MonthlyFlushMongoDatasource implements MonthlyFlushDatasource {
  async findConfigByKey(key: string): Promise<MonthlyFlushConfigEntity | null> {
    const document = await MonthlyFlushConfigModel.findOne({ key }).lean();
    return document ? MonthlyFlushConfigEntity.fromObject(document) : null;
  }

  async saveConfig(config: MonthlyFlushConfigEntity): Promise<MonthlyFlushConfigEntity> {
    const updated = await MonthlyFlushConfigModel.findOneAndUpdate(
      { key: config.key },
      {
        $set: {
          enabled: config.enabled,
          partialCurrentMonthEnabled: config.partialCurrentMonthEnabled,
          closeDay: config.closeDay,
          partialDays: config.partialDays,
          hour: config.hour,
          minute: config.minute,
          lastAutomaticRunAt: config.lastAutomaticRunAt,
          updatedAt: config.updatedAt,
          updatedByUserId: config.updatedByUserId ?? "",
          updatedByUserName: config.updatedByUserName ?? "",
        },
      },
      { new: true, upsert: true },
    ).lean();

    return MonthlyFlushConfigEntity.fromObject(updated as Record<string, unknown>);
  }

  async createJob(job: Omit<MonthlyFlushJobEntity, "id">): Promise<MonthlyFlushJobEntity> {
    const created = await MonthlyFlushJobModel.create(job);
    return MonthlyFlushJobEntity.fromObject(created.toJSON());
  }

  async updateJob(job: MonthlyFlushJobEntity): Promise<MonthlyFlushJobEntity> {
    const updated = await MonthlyFlushJobModel.findByIdAndUpdate(
      job.id,
      {
        $set: {
          monthKey: job.monthKey,
          triggerType: job.triggerType,
          status: job.status,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          error: job.error,
          requestedByUserId: job.requestedByUserId ?? "",
          requestedByUserName: job.requestedByUserName ?? "",
          summary: job.summary,
        },
      },
      { new: true },
    ).lean();

    return MonthlyFlushJobEntity.fromObject(updated as Record<string, unknown>);
  }

  async findRunningJob(): Promise<MonthlyFlushJobEntity | null> {
    const document = await MonthlyFlushJobModel.findOne({ status: "running" }).lean();
    return document ? MonthlyFlushJobEntity.fromObject(document) : null;
  }

  async listRecentJobs(limit: number): Promise<MonthlyFlushJobEntity[]> {
    const items = await MonthlyFlushJobModel.find({}).sort({ startedAt: -1 }).limit(limit).lean();
    return items.map((item) => MonthlyFlushJobEntity.fromObject(item));
  }

  async bulkUpsertSummaries(
    summaries: Array<Omit<OperationalLogFlushSummaryEntity, "id">>,
  ): Promise<void> {
    if (summaries.length === 0) return;

    const operations = summaries.map((summary) => ({
      updateOne: {
        filter: {
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
        },
        update: {
          $set: {
            monthKey: summary.monthKey,
            dayKey: summary.dayKey,
            flushType: summary.flushType,
            kind: summary.kind,
            scope: summary.scope,
            severity: summary.severity,
            type: summary.type,
            installationId: summary.installationId ?? "",
            projectId: summary.projectId ?? "",
            projectName: summary.projectName ?? "",
            moduloId: summary.moduloId ?? "",
            moduloNombre: summary.moduloNombre ?? "",
            source: summary.source,
            totalLogs: summary.totalLogs,
            firstCreatedAt: summary.firstCreatedAt,
            lastCreatedAt: summary.lastCreatedAt,
            sampleMessage: summary.sampleMessage ?? "",
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
          },
        },
        upsert: true,
      },
    }));

    await OperationalLogFlushSummaryModel.bulkWrite(operations as never, { ordered: false });
  }

  async listSummaries(query: {
    kind?: OperationalLogFlushSummaryEntity["kind"];
    scope?: OperationalLogFlushSummaryEntity["scope"];
    severity?: OperationalLogFlushSummaryEntity["severity"];
    projectId?: string;
    projectIds?: string[];
    moduloId?: string;
    type?: string;
    search?: string;
    from?: number;
    to?: number;
  }): Promise<OperationalLogFlushSummaryEntity[]> {
    const filters: Record<string, unknown> = {};

    if (query.kind) filters.kind = query.kind;
    if (query.scope) filters.scope = query.scope;
    if (query.severity) filters.severity = query.severity;
    if (query.projectId) filters.projectId = query.projectId;
    else if (Array.isArray(query.projectIds) && query.projectIds.length > 0) {
      filters.projectId = { $in: query.projectIds };
    }
    if (query.moduloId) filters.moduloId = query.moduloId;
    if (query.type) filters.type = query.type;
    if (query.from !== undefined || query.to !== undefined) {
      filters.lastCreatedAt = {
        ...(query.from !== undefined ? { $gte: query.from } : {}),
        ...(query.to !== undefined ? { $lte: query.to } : {}),
      };
    }
    if (query.search) {
      const safePattern = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filters.$or = [
        { sampleMessage: { $regex: safePattern, $options: "i" } },
        { type: { $regex: safePattern, $options: "i" } },
        { moduloNombre: { $regex: safePattern, $options: "i" } },
        { projectName: { $regex: safePattern, $options: "i" } },
      ];
    }

    const items = await OperationalLogFlushSummaryModel.find(filters)
      .sort({ lastCreatedAt: -1 })
      .lean();

    return items.map(
      (item) =>
        new OperationalLogFlushSummaryEntity({
          id: String(item._id ?? ""),
          monthKey: String(item.monthKey ?? ""),
          dayKey: String(item.dayKey ?? ""),
          flushType: item.flushType as OperationalLogFlushSummaryEntity["flushType"],
          kind: item.kind as OperationalLogFlushSummaryEntity["kind"],
          scope: item.scope as OperationalLogFlushSummaryEntity["scope"],
          severity: item.severity as OperationalLogFlushSummaryEntity["severity"],
          type: String(item.type ?? ""),
          installationId: String(item.installationId ?? ""),
          projectId: String(item.projectId ?? ""),
          projectName: String(item.projectName ?? ""),
          moduloId: String(item.moduloId ?? ""),
          moduloNombre: String(item.moduloNombre ?? ""),
          source: item.source as OperationalLogFlushSummaryEntity["source"],
          totalLogs: Number(item.totalLogs ?? 0),
          firstCreatedAt: Number(item.firstCreatedAt ?? 0),
          lastCreatedAt: Number(item.lastCreatedAt ?? 0),
          sampleMessage: String(item.sampleMessage ?? ""),
          createdAt: Number(item.createdAt ?? 0),
          updatedAt: Number(item.updatedAt ?? 0),
        }),
    );
  }
}

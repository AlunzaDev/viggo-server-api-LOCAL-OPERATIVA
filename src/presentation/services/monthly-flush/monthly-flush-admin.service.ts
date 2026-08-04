import { CustomError } from "../../../domain/errors/custom.error";
import { MonthlyFlushConfigEntity } from "../../../domain/entities/system/monthly-flush-config.entity";
import {
  MonthlyFlushJobEntity,
  type MonthlyFlushTriggerType,
} from "../../../domain/entities/system/monthly-flush-job.entity";
import { OperationalLogFlushSummaryEntity } from "../../../domain/entities/system/operational-log-flush-summary.entity";
import type { OperationalLogRepository } from "../../../domain/repository/system/operational-log.repository";
import type { MonthlyFlushRepository } from "../../../domain/repository/system/monthly-flush.repository";
import { normalizeFlushSummaryMessage } from "../operational-logs/operational-logs.helpers";

const CONFIG_KEY = "monthly-flush";
const DAY_MS = 24 * 60 * 60 * 1000;

export type MonthlyFlushStatusResponse = {
  enabled: boolean;
  partialCurrentMonthEnabled: boolean;
  closeDay: number;
  partialDays: number[];
  hour: string;
  minute: string;
  updatedAt: number | null;
  updatedBy: string | null;
  history: Array<{
    monthKey: string;
    status: "running" | "completed" | "failed";
    startedAt: number;
    completedAt: number | null;
    error: string | null;
    summary: {
      daysProcessed: number;
      totalSourceRecordsAffected: number;
      flushedDocuments: number;
      deletedLogs: number;
    } | null;
  }>;
};

export type UpdateMonthlyFlushSettingsInput = {
  enabled: boolean;
  partialCurrentMonthEnabled: boolean;
  partialDays: number[];
  hour: string;
  minute: string;
  userId?: string;
  userName?: string;
};

export type RunMonthlyFlushInput = {
  monthKey: string;
  userId?: string;
  userName?: string;
  triggerType?: MonthlyFlushTriggerType;
};

const pad2 = (value: number) => String(value).padStart(2, "0");
const monthKeyRegex = /^\d{4}-\d{2}$/;

const normalizePartialDays = (days: number[]) =>
  Array.from(
    new Set(
      days
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 2 && value <= 31),
    ),
  ).sort((a, b) => a - b);

const parseMonthKey = (monthKey: string) => {
  if (!monthKeyRegex.test(monthKey)) {
    throw CustomError.badRequest("Mes invalido");
  }

  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw CustomError.badRequest("Mes invalido");
  }

  return { year, month };
};

const buildMonthRange = (monthKey: string) => {
  const { year, month } = parseMonthKey(monthKey);
  const from = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const to = Date.UTC(year, month, 1, 0, 0, 0, 0) - 1;
  return { from, to };
};

const buildCurrentMonthYesterdayRange = (now: number) => {
  const current = new Date(now);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const from = Date.UTC(year, month, 1, 0, 0, 0, 0);
  const todayStart = Date.UTC(year, month, current.getUTCDate(), 0, 0, 0, 0);
  return {
    from,
    to: Math.max(from, todayStart - 1),
  };
};

export class MonthlyFlushAdminService {
  constructor(
    private readonly repository: MonthlyFlushRepository,
    private readonly operationalLogRepository: OperationalLogRepository,
  ) {}

  async getStatus(): Promise<MonthlyFlushStatusResponse> {
    const [config, history] = await Promise.all([
      this.ensureConfig(),
      this.repository.listRecentJobs(12),
    ]);

    return {
      enabled: Boolean(config.enabled),
      partialCurrentMonthEnabled: Boolean(config.partialCurrentMonthEnabled),
      closeDay: 1,
      partialDays: normalizePartialDays(Array.isArray(config.partialDays) ? config.partialDays : []),
      hour: pad2(Number(config.hour ?? 2)),
      minute: pad2(Number(config.minute ?? 0)),
      updatedAt: Number.isFinite(Number(config.updatedAt)) ? Number(config.updatedAt) : null,
      updatedBy:
        typeof config.updatedByUserName === "string" && config.updatedByUserName.trim()
          ? config.updatedByUserName.trim()
          : null,
      history: history.map((item) => ({
        monthKey: item.monthKey,
        status: item.status,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        error: item.error,
        summary: item.summary,
      })),
    };
  }

  async updateSettings(input: UpdateMonthlyFlushSettingsInput) {
    const hour = Number(input.hour);
    const minute = Number(input.minute);

    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw CustomError.badRequest("Hora invalida");
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw CustomError.badRequest("Minuto invalido");
    }

    const config = await this.ensureConfig();
    config.enabled = Boolean(input.enabled);
    config.partialCurrentMonthEnabled = Boolean(input.partialCurrentMonthEnabled);
    config.partialDays = normalizePartialDays(input.partialDays);
    config.hour = hour;
    config.minute = minute;
    config.updatedAt = Date.now();
    config.updatedByUserId = String(input.userId ?? "").trim();
    config.updatedByUserName = String(input.userName ?? "").trim();
    await this.repository.saveConfig(config);

    return this.getStatus();
  }

  async runManual(input: RunMonthlyFlushInput) {
    return this.run({
      monthKey: input.monthKey,
      userId: input.userId ?? "",
      userName: input.userName ?? "",
      triggerType: input.triggerType ?? "manual",
    });
  }

  async runAutomaticIfDue(now = Date.now()) {
    const config = await this.ensureConfig();
    if (!config.enabled) return null;

    const current = new Date(now);
    const currentDay = current.getUTCDate();
    const currentMinutes = current.getUTCHours() * 60 + current.getUTCMinutes();
    const scheduledMinutes = Number(config.hour) * 60 + Number(config.minute);
    const lastRunAt = Number(config.lastAutomaticRunAt ?? 0);
    const lastRun = lastRunAt > 0 ? new Date(lastRunAt) : null;
    const sameUtcDay =
      lastRun &&
      lastRun.getUTCFullYear() === current.getUTCFullYear() &&
      lastRun.getUTCMonth() === current.getUTCMonth() &&
      lastRun.getUTCDate() === current.getUTCDate();

    if (sameUtcDay) return null;

    if (currentDay === 1 && currentMinutes >= scheduledMinutes) {
      const previousMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1));
      const monthKey = `${previousMonth.getUTCFullYear()}-${pad2(previousMonth.getUTCMonth() + 1)}`;
      const result = await this.run({
        monthKey,
        userId: "system",
        userName: "operativo-auto",
        triggerType: "automatic",
      });
      config.lastAutomaticRunAt = now;
      await this.repository.saveConfig(config);
      return result;
    }

    if (config.partialCurrentMonthEnabled && currentDay > 1 && config.partialDays.includes(currentDay) && currentMinutes >= scheduledMinutes) {
      const monthKey = `${current.getUTCFullYear()}-${pad2(current.getUTCMonth() + 1)}`;
      const result = await this.run({
        monthKey,
        userId: "system",
        userName: "operativo-auto",
        triggerType: "partial",
      });
      config.lastAutomaticRunAt = now;
      await this.repository.saveConfig(config);
      return result;
    }

    return null;
  }

  private async run(
    input: {
      monthKey: string;
      userId: string;
      userName: string;
      triggerType: MonthlyFlushTriggerType;
    },
  ) {
    const runningJob = await this.repository.findRunningJob();
    if (runningJob) {
      throw CustomError.badRequest("Ya hay un flush en ejecucion");
    }

    const startedAt = Date.now();
    const job = await this.repository.createJob(new MonthlyFlushJobEntity({
      id: "",
      monthKey: input.monthKey,
      triggerType: input.triggerType,
      status: "running",
      startedAt,
      completedAt: null,
      error: null,
      requestedByUserId: String(input.userId ?? "").trim(),
      requestedByUserName: String(input.userName ?? "").trim(),
      summary: null,
    }));

    try {
      const summary = await this.flushOperationalLogs(input.monthKey, input.triggerType, startedAt);
      job.status = "completed";
      job.completedAt = Date.now();
      job.summary = summary;
      await this.repository.updateJob(job);
      return { ok: true, summary };
    } catch (error) {
      job.status = "failed";
      job.completedAt = Date.now();
      job.error = error instanceof Error ? error.message : "No se pudo ejecutar el flush";
      await this.repository.updateJob(job);
      throw error;
    }
  }

  private async flushOperationalLogs(monthKey: string, triggerType: MonthlyFlushTriggerType, now: number) {
    const { from, to } =
      triggerType === "partial" ? buildCurrentMonthYesterdayRange(now) : buildMonthRange(monthKey);

    if (to < from) {
      throw CustomError.badRequest("No hay rango valido para flushear");
    }

    const sourceRecords = await this.operationalLogRepository.listByCreatedAtRange({ from, to });

    if (sourceRecords.length === 0) {
      return {
        daysProcessed: 0,
        totalSourceRecordsAffected: 0,
        flushedDocuments: 0,
        deletedLogs: 0,
      };
    }

    type Bucket = {
      monthKey: string;
      dayKey: string;
      flushType: "monthly" | "partial";
      kind: OperationalLogFlushSummaryEntity["kind"];
      scope: OperationalLogFlushSummaryEntity["scope"];
      severity: OperationalLogFlushSummaryEntity["severity"];
      type: string;
      installationId: string;
      projectId: string;
      projectName: string;
      moduloId: string;
      moduloNombre: string;
      source: OperationalLogFlushSummaryEntity["source"];
      totalLogs: number;
      firstCreatedAt: number;
      lastCreatedAt: number;
      sampleMessage: string;
    };

    const buckets = new Map<string, Bucket>();

    sourceRecords.forEach((item) => {
      const createdAt = Number(item.createdAt ?? 0);
      const dayDate = new Date(createdAt);
      const dayKey = `${dayDate.getUTCFullYear()}-${pad2(dayDate.getUTCMonth() + 1)}-${pad2(dayDate.getUTCDate())}`;
      const bucketKey = [
        dayKey,
        item.kind,
        item.scope,
        item.severity,
        item.type,
        item.installationId ?? "",
        item.projectId ?? "",
        item.moduloId ?? "",
        item.source,
      ].join("|");

      const current = buckets.get(bucketKey);
      if (current) {
        current.totalLogs += 1;
        current.lastCreatedAt = Math.max(current.lastCreatedAt, createdAt);
        current.sampleMessage = normalizeFlushSummaryMessage(
          current.sampleMessage,
          current.totalLogs,
        );
        return;
      }

      buckets.set(bucketKey, {
        monthKey,
        dayKey,
        flushType: triggerType === "partial" ? "partial" : "monthly",
        kind: item.kind,
        scope: item.scope,
        severity: item.severity,
        type: item.type,
        installationId: item.installationId ?? "",
        projectId: item.projectId ?? "",
        projectName: item.projectName ?? "",
        moduloId: item.moduloId ?? "",
        moduloNombre: item.moduloNombre ?? "",
        source: item.source,
        totalLogs: 1,
        firstCreatedAt: createdAt,
        lastCreatedAt: createdAt,
        sampleMessage: normalizeFlushSummaryMessage(item.message, 1),
      });
    });

    const summaries = Array.from(buckets.values()).map(
      (bucket) =>
        new OperationalLogFlushSummaryEntity({
          id: "",
          monthKey: bucket.monthKey,
          dayKey: bucket.dayKey,
          flushType: bucket.flushType,
          kind: bucket.kind,
          scope: bucket.scope,
          severity: bucket.severity,
          type: bucket.type,
          installationId: bucket.installationId,
          projectId: bucket.projectId,
          projectName: bucket.projectName,
          moduloId: bucket.moduloId,
          moduloNombre: bucket.moduloNombre,
          source: bucket.source,
          totalLogs: bucket.totalLogs,
          firstCreatedAt: bucket.firstCreatedAt,
          lastCreatedAt: bucket.lastCreatedAt,
          sampleMessage: bucket.sampleMessage,
          createdAt: bucket.firstCreatedAt,
          updatedAt: now,
        }),
    );

    await this.repository.bulkUpsertSummaries(summaries);

    const deletedLogs = await this.operationalLogRepository.deleteByCreatedAtRange({
      from,
      to,
    });

    return {
      daysProcessed: Math.max(1, Math.ceil((to - from + 1) / DAY_MS)),
      totalSourceRecordsAffected: sourceRecords.length,
      flushedDocuments: summaries.length,
      deletedLogs,
    };
  }

  private async ensureConfig() {
    const existing = await this.repository.findConfigByKey(CONFIG_KEY);
    if (existing) return existing;

    return this.repository.saveConfig(
      new MonthlyFlushConfigEntity({
        id: "",
      key: CONFIG_KEY,
      enabled: false,
      partialCurrentMonthEnabled: false,
      closeDay: 1,
      partialDays: [],
      hour: 2,
      minute: 0,
      lastAutomaticRunAt: null,
      updatedAt: Date.now(),
      updatedByUserId: "",
      updatedByUserName: "",
      }),
    );
  }
}

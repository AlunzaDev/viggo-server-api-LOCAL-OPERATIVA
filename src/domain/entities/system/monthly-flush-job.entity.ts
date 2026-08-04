export const MONTHLY_FLUSH_JOB_STATUSES = ["running", "completed", "failed"] as const;
export const MONTHLY_FLUSH_TRIGGER_TYPES = ["manual", "automatic", "partial"] as const;

export type MonthlyFlushJobStatus = (typeof MONTHLY_FLUSH_JOB_STATUSES)[number];
export type MonthlyFlushTriggerType = (typeof MONTHLY_FLUSH_TRIGGER_TYPES)[number];

export interface MonthlyFlushJobSummary {
  daysProcessed: number;
  totalSourceRecordsAffected: number;
  flushedDocuments: number;
  deletedLogs: number;
}

export interface MonthlyFlushJobEntityOptions {
  id: string;
  monthKey: string;
  triggerType: MonthlyFlushTriggerType;
  status: MonthlyFlushJobStatus;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  requestedByUserId?: string;
  requestedByUserName?: string;
  summary: MonthlyFlushJobSummary | null;
}

export class MonthlyFlushJobEntity {
  public id: string;
  public monthKey: string;
  public triggerType: MonthlyFlushTriggerType;
  public status: MonthlyFlushJobStatus;
  public startedAt: number;
  public completedAt: number | null;
  public error: string | null;
  public requestedByUserId?: string;
  public requestedByUserName?: string;
  public summary: MonthlyFlushJobSummary | null;

  constructor(options: MonthlyFlushJobEntityOptions) {
    this.id = options.id;
    this.monthKey = options.monthKey;
    this.triggerType = options.triggerType;
    this.status = options.status;
    this.startedAt = options.startedAt;
    this.completedAt = options.completedAt;
    this.error = options.error;
    this.requestedByUserId = options.requestedByUserId;
    this.requestedByUserName = options.requestedByUserName;
    this.summary = options.summary;
  }

  static fromObject(object: Record<string, unknown>): MonthlyFlushJobEntity {
    const rawSummary =
      object.summary && typeof object.summary === "object"
        ? (object.summary as Record<string, unknown>)
        : null;

    return new MonthlyFlushJobEntity({
      id: String(object.id ?? object._id ?? ""),
      monthKey: String(object.monthKey ?? ""),
      triggerType: String(object.triggerType ?? "manual") as MonthlyFlushTriggerType,
      status: String(object.status ?? "failed") as MonthlyFlushJobStatus,
      startedAt: Number(object.startedAt ?? 0),
      completedAt:
        object.completedAt === null || object.completedAt === undefined
          ? null
          : Number(object.completedAt),
      error:
        object.error === null || object.error === undefined || object.error === ""
          ? null
          : String(object.error),
      requestedByUserId: String(object.requestedByUserId ?? "").trim(),
      requestedByUserName: String(object.requestedByUserName ?? "").trim(),
      summary: rawSummary
        ? {
            daysProcessed: Number(rawSummary.daysProcessed ?? 0),
            totalSourceRecordsAffected: Number(rawSummary.totalSourceRecordsAffected ?? 0),
            flushedDocuments: Number(rawSummary.flushedDocuments ?? 0),
            deletedLogs: Number(rawSummary.deletedLogs ?? 0),
          }
        : null,
    });
  }
}

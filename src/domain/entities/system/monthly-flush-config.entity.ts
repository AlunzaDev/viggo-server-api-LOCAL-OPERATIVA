export interface MonthlyFlushConfigEntityOptions {
  id: string;
  key: string;
  enabled: boolean;
  partialCurrentMonthEnabled: boolean;
  closeDay: number;
  partialDays: number[];
  hour: number;
  minute: number;
  lastAutomaticRunAt: number | null;
  updatedAt: number;
  updatedByUserId?: string;
  updatedByUserName?: string;
}

export class MonthlyFlushConfigEntity {
  public id: string;
  public key: string;
  public enabled: boolean;
  public partialCurrentMonthEnabled: boolean;
  public closeDay: number;
  public partialDays: number[];
  public hour: number;
  public minute: number;
  public lastAutomaticRunAt: number | null;
  public updatedAt: number;
  public updatedByUserId?: string;
  public updatedByUserName?: string;

  constructor(options: MonthlyFlushConfigEntityOptions) {
    this.id = options.id;
    this.key = options.key;
    this.enabled = options.enabled;
    this.partialCurrentMonthEnabled = options.partialCurrentMonthEnabled;
    this.closeDay = options.closeDay;
    this.partialDays = options.partialDays;
    this.hour = options.hour;
    this.minute = options.minute;
    this.lastAutomaticRunAt = options.lastAutomaticRunAt;
    this.updatedAt = options.updatedAt;
    this.updatedByUserId = options.updatedByUserId;
    this.updatedByUserName = options.updatedByUserName;
  }

  static fromObject(object: Record<string, unknown>): MonthlyFlushConfigEntity {
    return new MonthlyFlushConfigEntity({
      id: String(object.id ?? object._id ?? ""),
      key: String(object.key ?? ""),
      enabled: Boolean(object.enabled),
      partialCurrentMonthEnabled: Boolean(object.partialCurrentMonthEnabled),
      closeDay: Number(object.closeDay ?? 1),
      partialDays: Array.isArray(object.partialDays)
        ? object.partialDays.map((value) => Number(value)).filter(Number.isInteger)
        : [],
      hour: Number(object.hour ?? 2),
      minute: Number(object.minute ?? 0),
      lastAutomaticRunAt:
        object.lastAutomaticRunAt === null || object.lastAutomaticRunAt === undefined
          ? null
          : Number(object.lastAutomaticRunAt),
      updatedAt: Number(object.updatedAt ?? Date.now()),
      updatedByUserId: String(object.updatedByUserId ?? "").trim(),
      updatedByUserName: String(object.updatedByUserName ?? "").trim(),
    });
  }
}

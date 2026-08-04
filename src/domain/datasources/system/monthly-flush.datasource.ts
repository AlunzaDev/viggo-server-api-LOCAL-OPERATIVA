import { MonthlyFlushConfigEntity } from "../../entities/system/monthly-flush-config.entity";
import {
  MonthlyFlushJobEntity,
} from "../../entities/system/monthly-flush-job.entity";
import { OperationalLogFlushSummaryEntity } from "../../entities/system/operational-log-flush-summary.entity";
import type {
  OperationalLogKind,
  OperationalLogScope,
  OperationalLogSeverity,
} from "../../entities/system/operational-log.entity";

export abstract class MonthlyFlushDatasource {
  abstract findConfigByKey(key: string): Promise<MonthlyFlushConfigEntity | null>;
  abstract saveConfig(config: MonthlyFlushConfigEntity): Promise<MonthlyFlushConfigEntity>;
  abstract createJob(job: Omit<MonthlyFlushJobEntity, "id">): Promise<MonthlyFlushJobEntity>;
  abstract updateJob(job: MonthlyFlushJobEntity): Promise<MonthlyFlushJobEntity>;
  abstract findRunningJob(): Promise<MonthlyFlushJobEntity | null>;
  abstract listRecentJobs(limit: number): Promise<MonthlyFlushJobEntity[]>;
  abstract bulkUpsertSummaries(
    summaries: Array<Omit<OperationalLogFlushSummaryEntity, "id">>,
  ): Promise<void>;
  abstract listSummaries(query: {
    kind?: OperationalLogKind;
    scope?: OperationalLogScope;
    severity?: OperationalLogSeverity;
    projectId?: string;
    projectIds?: string[];
    moduloId?: string;
    type?: string;
    search?: string;
    from?: number;
    to?: number;
  }): Promise<OperationalLogFlushSummaryEntity[]>;
}

import { MonthlyFlushDatasource } from "../../../domain/datasources/system/monthly-flush.datasource";
import { MonthlyFlushConfigEntity } from "../../../domain/entities/system/monthly-flush-config.entity";
import { MonthlyFlushJobEntity } from "../../../domain/entities/system/monthly-flush-job.entity";
import { OperationalLogFlushSummaryEntity } from "../../../domain/entities/system/operational-log-flush-summary.entity";
import { MonthlyFlushRepository } from "../../../domain/repository/system/monthly-flush.repository";

export class MonthlyFlushRepositoryImpl implements MonthlyFlushRepository {
  constructor(private readonly datasource: MonthlyFlushDatasource) {}

  findConfigByKey(key: string): Promise<MonthlyFlushConfigEntity | null> {
    return this.datasource.findConfigByKey(key);
  }

  saveConfig(config: MonthlyFlushConfigEntity): Promise<MonthlyFlushConfigEntity> {
    return this.datasource.saveConfig(config);
  }

  createJob(job: Omit<MonthlyFlushJobEntity, "id">): Promise<MonthlyFlushJobEntity> {
    return this.datasource.createJob(job);
  }

  updateJob(job: MonthlyFlushJobEntity): Promise<MonthlyFlushJobEntity> {
    return this.datasource.updateJob(job);
  }

  findRunningJob(): Promise<MonthlyFlushJobEntity | null> {
    return this.datasource.findRunningJob();
  }

  listRecentJobs(limit: number): Promise<MonthlyFlushJobEntity[]> {
    return this.datasource.listRecentJobs(limit);
  }

  bulkUpsertSummaries(
    summaries: Array<Omit<OperationalLogFlushSummaryEntity, "id">>,
  ): Promise<void> {
    return this.datasource.bulkUpsertSummaries(summaries);
  }

  listSummaries(query: {
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
    return this.datasource.listSummaries(query);
  }
}

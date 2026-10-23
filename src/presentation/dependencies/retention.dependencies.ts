import { envs } from "../../config";
import { LocalRetentionPostgresDatasource } from "../../infrastructure/datasources/system/local-retention.datasource.postgres";
import { LocalRetentionRepositoryImpl } from "../../infrastructure/repositories/system/local-retention.repository.impl";
import { LocalRetentionScheduler, localRetentionPlan } from "../services/retention/local-retention.scheduler";

export const buildLocalRetentionRepository = () =>
  new LocalRetentionRepositoryImpl(new LocalRetentionPostgresDatasource());

export const buildLocalRetentionScheduler = (): LocalRetentionScheduler =>
  new LocalRetentionScheduler(buildLocalRetentionRepository(), localRetentionPlan({
    operation: envs.RETENTION_LOCAL_OPERATION_DAYS,
    audit: envs.RETENTION_LOCAL_AUDIT_DAYS,
    commandReceipts: envs.RETENTION_COMMAND_RECEIPTS_DAYS,
  }));

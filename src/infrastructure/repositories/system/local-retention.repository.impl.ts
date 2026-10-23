import type { LocalRetentionDatasource, LocalRetentionTarget } from "../../../domain/datasources/system/local-retention.datasource";
import { LocalRetentionRepository } from "../../../domain/repositories/system/local-retention.repository";

export class LocalRetentionRepositoryImpl implements LocalRetentionRepository {
  constructor(private readonly datasource: LocalRetentionDatasource) {}

  purgeBatch(target: LocalRetentionTarget, before: number, limit: number) {
    return this.datasource.purgeBatch(target, before, limit);
  }
}

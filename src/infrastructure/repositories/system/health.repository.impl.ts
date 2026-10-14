import type { HealthDatasource } from "../../../domain/datasources/system/health.datasource";
import { HealthRepository } from "../../../domain/repositories/system/health.repository";

export class HealthRepositoryImpl implements HealthRepository {
  constructor(private readonly datasource: HealthDatasource) {}

  getDatabaseHealth() {
    return this.datasource.getDatabaseHealth();
  }

  countDevices(staleBefore: Date) {
    return this.datasource.countDevices(staleBefore);
  }
}

import type { DatabaseHealth, DeviceCounts } from "../../datasources/system/health.datasource";

export abstract class HealthRepository {
  abstract getDatabaseHealth(): Promise<DatabaseHealth>;
  abstract countDevices(staleBefore: Date): Promise<DeviceCounts>;
}

import { PostgresDatabase } from "../../../data/postgres";
import { HealthDatasource, type DatabaseHealth } from "../../../domain/datasources/system/health.datasource";

export class HealthPostgresDatasource implements HealthDatasource {
  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const { status, ...details } = await PostgresDatabase.getHealthSnapshot();
    return { status: status === "ok" ? "ok" : "error", ...details };
  }

  async countDevices(staleBefore: Date) {
    const db = PostgresDatabase.client;
    const bound = { estado: true, deviceBinding: { isNot: null } } as const;
    const [total, connected, stale] = await Promise.all([
      db.modulo.count({ where: bound }),
      db.modulo.count({
        where: { estado: true, deviceRuntime: { is: { isConnected: true, lastHeartbeatAt: { gte: staleBefore } } } },
      }),
      db.modulo.count({
        where: {
          ...bound,
          OR: [
            { deviceRuntime: { is: null } },
            { deviceRuntime: { is: { isConnected: false } } },
            { deviceRuntime: { is: { OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleBefore } }] } } },
          ],
        },
      }),
    ]);
    return { total, connected, stale };
  }
}

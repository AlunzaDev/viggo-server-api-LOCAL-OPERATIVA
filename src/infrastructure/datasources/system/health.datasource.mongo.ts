import { MongoDatabase } from "../../../data/mongo";
import { PostgresDatabase } from "../../../data/postgres";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import {
  HealthDatasource,
  type DatabaseHealth,
} from "../../../domain/datasources/system/health.datasource";

export class HealthMongoDatasource implements HealthDatasource {
  // While datasources move to Postgres both databases are required; the Mongo fields
  // stay at the top level for compatibility until MongoDB is retired (#7).
  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const mongo = MongoDatabase.getHealthSnapshot();
    const postgres = await PostgresDatabase.getHealthSnapshot();
    return {
      ...mongo,
      status: mongo.status === "ok" && postgres.status === "ok" ? "ok" : "error",
      postgres,
    };
  }

  async countDevices(staleBefore: Date) {
    const [total, connected, stale] = await Promise.all([
      ModuloModel.countDocuments({ estado: true, deviceBinding: { $ne: null } }),
      ModuloModel.countDocuments({
        estado: true,
        "deviceRuntime.isConnected": true,
        "deviceRuntime.lastHeartbeatAt": { $gte: staleBefore },
      }),
      ModuloModel.countDocuments({
        estado: true,
        deviceBinding: { $ne: null },
        $or: [
          { "deviceRuntime.isConnected": { $ne: true } },
          { "deviceRuntime.lastHeartbeatAt": { $lt: staleBefore } },
          { deviceRuntime: null },
        ],
      }),
    ]);
    return { total, connected, stale };
  }
}

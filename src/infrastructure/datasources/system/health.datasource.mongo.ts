import { MongoDatabase } from "../../../data/mongo";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import {
  HealthDatasource,
  type DatabaseHealth,
} from "../../../domain/datasources/system/health.datasource";

export class HealthMongoDatasource implements HealthDatasource {
  getDatabaseHealth(): DatabaseHealth {
    const { status, ...details } = MongoDatabase.getHealthSnapshot();
    return { status: status === "ok" ? "ok" : "error", ...details };
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

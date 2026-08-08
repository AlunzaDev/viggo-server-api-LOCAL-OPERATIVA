import { Request, Response } from "express";
import { MongoDatabase } from "../../../data/mongo";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { LocalInstallationModel } from "../../../data/mongo/models/system/local-installation.schema";

const deviceHeartbeatThresholdMs = 30_000;

export class HealthController {
  summary = async (_req: Request, res: Response) => {
    const db = MongoDatabase.getHealthSnapshot();
    const [localProject, devices] = await Promise.all([
      this.getLocalProjectSnapshot(),
      this.getDevicesSnapshot(),
    ]);
    const status =
      db.status === "ok" && localProject.status === "ok" && devices.status !== "down"
        ? "ok"
        : "degraded";
    return res.status(status === "ok" ? 200 : 503).json({
      service: "viggo-operativo",
      status,
      serverTime: Date.now(),
      db,
      localProject,
      devices,
    });
  };

  db = async (_req: Request, res: Response) => {
    const db = MongoDatabase.getHealthSnapshot();
    return res.status(db.status === "ok" ? 200 : 503).json({
      service: "viggo-operativo",
      ...db,
    });
  };

  localProject = async (_req: Request, res: Response) => {
    const localProject = await this.getLocalProjectSnapshot();
    return res.status(localProject.status === "ok" ? 200 : 503).json(localProject);
  };

  devices = async (_req: Request, res: Response) => {
    const devices = await this.getDevicesSnapshot();
    return res.status(devices.status === "down" ? 503 : 200).json(devices);
  };

  private async getLocalProjectSnapshot() {
    const installation = await LocalInstallationModel.findOne({ key: "default" }).lean();
    const linked = installation?.status === "linked" && Boolean(installation.proyectoId);
    return {
      status: linked ? "ok" : "down",
      installationId: installation?.installationId ?? "",
      proyectoId: installation?.proyectoId ?? "",
      proyectoNombre: installation?.proyectoNombre ?? "",
      linked,
      lastSyncAt: installation?.lastSyncAt ?? null,
      lastSyncStatus: installation?.lastSyncStatus ?? null,
      lastSyncError: installation?.lastSyncError ?? "",
    };
  }

  private async getDevicesSnapshot() {
    const now = Date.now();
    const [total, connected, stale] = await Promise.all([
      ModuloModel.countDocuments({ estado: true, deviceBinding: { $ne: null } }),
      ModuloModel.countDocuments({
        estado: true,
        "deviceRuntime.isConnected": true,
        "deviceRuntime.lastHeartbeatAt": { $gte: new Date(now - deviceHeartbeatThresholdMs) },
      }),
      ModuloModel.countDocuments({
        estado: true,
        deviceBinding: { $ne: null },
        $or: [
          { "deviceRuntime.isConnected": { $ne: true } },
          { "deviceRuntime.lastHeartbeatAt": { $lt: new Date(now - deviceHeartbeatThresholdMs) } },
          { deviceRuntime: null },
        ],
      }),
    ]);
    return {
      status: total === 0 ? "degraded" : connected > 0 ? "ok" : "down",
      totalBoundDevices: total,
      connectedDevices: connected,
      staleOrDisconnectedDevices: stale,
      heartbeatThresholdMs: deviceHeartbeatThresholdMs,
      serverTime: now,
    };
  }
}

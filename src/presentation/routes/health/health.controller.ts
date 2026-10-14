import { Request, Response } from "express";
import { HealthRepository } from "../../../domain/repositories/system/health.repository";
import { LocalInstallationService } from "../../services/installation/local-installation.service";

const deviceHeartbeatThresholdMs = 30_000;

export class HealthController {
  constructor(
    private readonly health: HealthRepository,
    private readonly installations: LocalInstallationService,
  ) {}

  summary = async (_req: Request, res: Response) => {
    const db = this.health.getDatabaseHealth();
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
    const db = this.health.getDatabaseHealth();
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
    const installation = await this.installations.findDefault();
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
    const { total, connected, stale } = await this.health.countDevices(
      new Date(now - deviceHeartbeatThresholdMs),
    );
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

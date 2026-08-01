import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { InstallationIdentityService } from "../../services/installation/installation-identity.service";
import { LocalReportsService } from "../../services/local-reports/local-reports.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getRange = (req: Request) => {
  const now = Date.now();
  const from = toNumber(req.query.from, now - DAY_MS);
  const to = toNumber(req.query.to, now);
  return from <= to ? { from, to } : { from: to, to: from };
};

export class LocalReportsController {
  constructor(private readonly service: LocalReportsService) {}

  getSnapshot = async (req: Request, res: Response) => {
    try {
      const installationId = await InstallationIdentityService.getInstallationId();
      const installation = await this.service.getInstallation();
      const proyectoId = String(req.query.proyectoId ?? installation?.proyectoId ?? "").trim();
      const { from, to } = getRange(req);
      const data = await this.service.getSnapshotData({ proyectoId, from, to });

      return res.status(200).json({
        mode: "direct-local-query",
        generatedAt: Date.now(),
        installation: {
          installationId,
          status: installation?.status ?? "pending",
          proyectoId: installation?.proyectoId ?? null,
          proyectoNombre: installation?.proyectoNombre ?? null,
          proyectoIdentificador: installation?.proyectoIdentificador ?? null,
        },
        range: { from, to },
        health: this.service.getHealth(),
        ...data,
        futureEventBridge: {
          enabled: false,
          note: "Outbox/inbox queda reservado para reintentos offline; este snapshot usa consulta directa entre servicios central y local.",
        },
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getHeartbeat = async (req: Request, res: Response) => {
    try {
      const installationId = await InstallationIdentityService.getInstallationId();
      const installation = await this.service.getInstallation();
      const proyectoId = String(req.query.proyectoId ?? installation?.proyectoId ?? "").trim();

      if (!proyectoId) {
        return res.status(400).json({ error: "proyectoId es requerido" });
      }

      const heartbeat = await this.service.getHeartbeatSnapshot(proyectoId);

      return res.status(200).json({
        mode: "direct-local-query",
        generatedAt: Date.now(),
        installation: {
          installationId,
          status: installation?.status ?? "pending",
          proyectoId: installation?.proyectoId ?? null,
          proyectoNombre: installation?.proyectoNombre ?? null,
          proyectoIdentificador: installation?.proyectoIdentificador ?? null,
        },
        project: heartbeat.project,
        snapshot: heartbeat.snapshot,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

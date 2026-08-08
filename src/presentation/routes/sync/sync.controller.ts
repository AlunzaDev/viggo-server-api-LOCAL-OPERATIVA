import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { SyncRequest } from "../../middlewares";
import { SyncService } from "../../services/sync/sync.service";
import { ModuloService } from "../../services/parking/modulo.service";

type SnapshotItem = Record<string, unknown> & { id?: unknown; _id?: unknown };

export class SyncController {
  constructor(
    private readonly service: SyncService,
    private readonly moduloService: ModuloService,
  ) {}

  status = async (req: Request, res: Response) => {
    return res.status(200).json({
      service: "viggo-operativo-sync",
      source: (req as SyncRequest).syncSource,
      status: "ok",
      serverTime: Date.now(),
    });
  };

  applyAccessSnapshot = async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        version?: unknown;
        users?: SnapshotItem[];
        permissionProfiles?: SnapshotItem[];
      };
      const users = Array.isArray(body.users) ? body.users : [];
      const permissionProfiles = Array.isArray(body.permissionProfiles)
        ? body.permissionProfiles
        : [];

      const result = await this.service.applyAccessSnapshot({
        users,
        permissionProfiles,
      });

      return res.status(200).json({
        applied: true,
        version: body.version ?? null,
        users: result.users,
        permissionProfiles: result.permissionProfiles,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  applyConfigurationSnapshot = async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        version?: unknown;
        proyecto?: SnapshotItem | null;
        modulos?: SnapshotItem[];
        pensiones?: SnapshotItem[];
        pensionPasses?: SnapshotItem[];
      };

      const result = await this.service.applyConfigurationSnapshot({
        proyecto: body.proyecto ?? null,
        modulos: Array.isArray(body.modulos) ? body.modulos : [],
        pensiones: Array.isArray(body.pensiones) ? body.pensiones : [],
        pensionPasses: Array.isArray(body.pensionPasses) ? body.pensionPasses : [],
      });

      return res.status(200).json({
        applied: true,
        version: body.version ?? null,
        ...result,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  approveDeviceBinding = async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        fingerprint?: unknown;
        resolvedByUserId?: unknown;
        resolvedByUserName?: unknown;
        notes?: unknown;
      };
      const modulo = await this.moduloService.approveDeviceBindingRequest(
        String(req.params.id ?? "").trim(),
        {
          fingerprint:
            typeof body.fingerprint === "string"
              ? body.fingerprint.trim()
              : undefined,
          notes:
            typeof body.notes === "string"
              ? body.notes.trim()
              : `Aprobado desde Administrativo por ${String(
                  body.resolvedByUserName ?? "usuario administrativo",
                ).trim()}`,
        },
      );

      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  rejectDeviceBinding = async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        fingerprint?: unknown;
        resolvedByUserId?: unknown;
        resolvedByUserName?: unknown;
        rejectionReason?: unknown;
        notes?: unknown;
      };
      const modulo = await this.moduloService.rejectDeviceBindingRequest(
        String(req.params.id ?? "").trim(),
        {
          fingerprint:
            typeof body.fingerprint === "string"
              ? body.fingerprint.trim()
              : undefined,
          notes:
            typeof body.notes === "string"
              ? body.notes.trim()
              : typeof body.rejectionReason === "string"
                ? body.rejectionReason.trim()
                : `Rechazado desde Administrativo por ${String(
                    body.resolvedByUserName ?? "usuario administrativo",
                  ).trim()}`,
        },
      );

      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

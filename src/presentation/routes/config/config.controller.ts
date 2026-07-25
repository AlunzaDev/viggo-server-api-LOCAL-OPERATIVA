import { Request, Response } from "express";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ConfigSyncService } from "../../services/config/config-sync.service";
import { ErrorService } from "../../services/error.service";

export class ConfigController {
  constructor(private readonly service: ConfigSyncService) {}

  status = async (_req: Request, res: Response) => {
    try {
      const status = await this.service.getStatus();
      return res.status(200).json({ status });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  syncNow = async (req: Request, res: Response) => {
    try {
      const user = getAuthenticatedRequestUser(req);
      const userName = [user?.nombre, user?.apellido].filter(Boolean).join(" ").trim();
      const result = await this.service.syncNow({
        userId: user?.id,
        userName,
        triggerSource: "manual",
      });
      return res.status(200).json({ synced: true, ...result });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getSyncAudits = async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit ?? 20);
      const audits = await this.service.getAuditHistory(limit);
      return res.status(200).json({ audits });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

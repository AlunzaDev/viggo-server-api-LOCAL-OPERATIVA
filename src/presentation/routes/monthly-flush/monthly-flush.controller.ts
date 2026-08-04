import { Request, Response } from "express";
import { MonthlyFlushSchedulerService } from "../../services/monthly-flush/monthly-flush-scheduler.service";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { MonthlyFlushAdminService } from "../../services/monthly-flush/monthly-flush-admin.service";

export class MonthlyFlushController {
  constructor(
    private readonly service: MonthlyFlushAdminService,
    private readonly scheduler: MonthlyFlushSchedulerService,
  ) {}

  status = async (_req: Request, res: Response) => {
    try {
      const status = await this.service.getStatus();
      return res.status(200).json(status);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const user = getAuthenticatedRequestUser(req);
      const userName = [user?.nombre, user?.apellido].filter(Boolean).join(" ").trim();
      const status = await this.service.updateSettings({
        enabled: Boolean(req.body?.enabled),
        partialCurrentMonthEnabled: Boolean(req.body?.partialCurrentMonthEnabled),
        partialDays: Array.isArray(req.body?.partialDays) ? req.body.partialDays : [],
        hour: String(req.body?.hour ?? ""),
        minute: String(req.body?.minute ?? ""),
        userId: user?.id,
        userName,
      });
      await this.scheduler.refresh();
      return res.status(200).json(status);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  runManual = async (req: Request, res: Response) => {
    try {
      const user = getAuthenticatedRequestUser(req);
      const userName = [user?.nombre, user?.apellido].filter(Boolean).join(" ").trim();
      const result = await this.service.runManual({
        monthKey: String(req.body?.monthKey ?? "").trim(),
        userId: user?.id,
        userName,
      });
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

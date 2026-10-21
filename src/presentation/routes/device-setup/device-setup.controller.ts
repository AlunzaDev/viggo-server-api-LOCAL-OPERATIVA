import type { Request, Response } from "express";
import type { DeviceSetupService } from "../../services/device-setup/device-setup.service";
import { ErrorService } from "../../services/error.service";

export class DeviceSetupController {
  constructor(private readonly deviceSetup: DeviceSetupService) {}

  catalogs = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.deviceSetup.catalogs());
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  projectModules = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.deviceSetup.projectModules(String(req.params.projectId || "").trim()));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { PensionService } from "../../services/pension/pension.service";

export class PensionController {
  constructor(private readonly pensionService: PensionService) {}

  getPensiones = async (req: Request, res: Response) => {
    try {
      const allowed = getAllowedProjectIdsFromRequest(req);
      const pensiones = await this.pensionService.getPensiones();
      const visible = isSuperAdminRequest(req)
        ? pensiones
        : pensiones.filter((pension) => allowed.includes(pension.proyecto));
      return res.status(200).json({ pensiones: visible });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionById = async (req: Request, res: Response) => {
    try {
      const pension = await this.pensionService.getPensionById(String(req.params.id));
      if (!canAccessProjectFromRequest(req, pension.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionesByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      if (!canAccessProjectFromRequest(req, proyectoId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const pensiones = await this.pensionService.getPensionesByProyecto(proyectoId);
      return res.status(200).json({ pensiones });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

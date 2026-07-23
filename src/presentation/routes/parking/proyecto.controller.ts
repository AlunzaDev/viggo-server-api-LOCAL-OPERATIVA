import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { ProyectoService } from "../../services/parking/proyecto.service";

export class ProyectoController {
  constructor(private readonly proyectoService: ProyectoService) {}

  getProyectos = async (req: Request, res: Response) => {
    try {
      const proyectos = await this.proyectoService.getProyectos();
      const allowed = getAllowedProjectIdsFromRequest(req);
      const visible = isSuperAdminRequest(req)
        ? proyectos
        : proyectos.filter((proyecto) => allowed.includes(proyecto.id));
      return res.status(200).json({ proyectos: visible });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProyectoById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const proyecto = await this.proyectoService.getProyectoById(id);
      return res.status(200).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

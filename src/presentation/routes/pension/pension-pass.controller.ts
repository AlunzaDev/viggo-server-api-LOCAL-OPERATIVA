import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { PensionPassService } from "../../services/pension/pension-pass.service";

export class PensionPassController {
  constructor(private readonly service: PensionPassService) {}

  getPensionPasses = async (req: Request, res: Response) => {
    try {
      const allowed = getAllowedProjectIdsFromRequest(req);
      const passes = await this.service.getPensionPasses();
      const visible = isSuperAdminRequest(req)
        ? passes
        : (
            await Promise.all(
              passes.map(async (pass) =>
                allowed.includes(await this.service.getProyectoIdByPensionPassId(pass.id))
                  ? pass
                  : null,
              ),
            )
          ).filter((pass): pass is (typeof passes)[number] => pass !== null);
      return res.status(200).json({ pensionPasses: visible });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const projectId = await this.service.getProyectoIdByPensionPassId(id);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const pensionPass = await this.service.getPensionPassCardById(id);
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassesByPension = async (req: Request, res: Response) => {
    try {
      const pensionId = String(req.params.pensionId);
      const projectId = await this.service.getProyectoIdByPensionId(pensionId);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const pensionPasses = await this.service.getPensionPassesByPension(pensionId);
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassesByUsuario = async (req: Request, res: Response) => {
    try {
      const passes = await this.service.getPensionPassesByUsuario(
        String(req.params.usuarioId),
      );
      const visible = isSuperAdminRequest(req)
        ? passes
        : (
            await Promise.all(
              passes.map(async (pass) =>
                canAccessProjectFromRequest(
                  req,
                  await this.service.getProyectoIdByPensionPassId(pass.id),
                )
                  ? pass
                  : null,
              ),
            )
          ).filter((pass): pass is (typeof passes)[number] => pass !== null);
      return res.status(200).json({ pensionPasses: visible });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyPensionPasses = async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as Request & { uid?: string }).uid;
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      const pensionPasses = await this.service.getPensionPassCardsByUsuario(usuarioId);
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  openBarrierWithPensionPass = async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as Request & { uid?: string }).uid;
      const moduleToken = typeof req.body.moduleToken === "string"
        ? req.body.moduleToken.trim()
        : "";
      const pensionPassId = typeof req.body.pensionPass === "string"
        ? req.body.pensionPass.trim()
        : "";

      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      if (!moduleToken) return res.status(400).json({ error: "'moduleToken' es requerido" });
      if (!pensionPassId) return res.status(400).json({ error: "'pensionPass' es requerido" });

      const projectId = await this.service.getProyectoIdByPensionPassId(pensionPassId);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const pensionMove = await this.service.openBarrierWithPensionPass(
        usuarioId,
        pensionPassId,
        moduleToken,
      );
      return res.status(200).json({ pensionMove });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionMovesByPensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const projectId = await this.service.getProyectoIdByPensionPassId(id);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json(
        await this.service.getPensionMovesByPensionPass(id, req.query),
      );
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

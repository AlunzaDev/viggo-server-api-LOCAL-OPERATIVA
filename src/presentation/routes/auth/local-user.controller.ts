import { Request, Response } from "express";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";
import { ErrorService } from "../../services/error.service";

export class LocalUserController {
  constructor(private readonly repository: AuthRepository) {}

  list = async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50),
      );
      const result = await this.repository.listLocalUsers({
        page,
        limit,
        search: String(req.query.search ?? "").trim() || undefined,
      });
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getById = async (req: Request, res: Response) => {
    try {
      const usuario = await this.repository.findLocalUserSummaryById(
        String(req.params.id),
      );
      if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
      return res.status(200).json({ usuario });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

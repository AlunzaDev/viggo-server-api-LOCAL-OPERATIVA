import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { PensionService } from "../../services/pension/pension.service";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
} from "../../services/shared/pagination-query";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const parseBooleanQuery = (value: unknown): boolean | undefined | null => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return null;
};

export class PensionController {
  constructor(private readonly pensionService: PensionService) {}

  getPensiones = async (req: Request, res: Response) => {
    try {
      const estado = parseBooleanQuery(req.query.estado);
      if (estado === null) {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const proyecto =
        typeof req.query.proyecto === "string" ? req.query.proyecto.trim() : "";
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);
      const allowed = getAllowedProjectIdsFromRequest(req);
      const pensiones = await this.pensionService.getPensiones();
      let visible = isSuperAdminRequest(req)
        ? pensiones
        : pensiones.filter((pension) => allowed.includes(pension.proyecto));

      if (proyecto) {
        visible = visible.filter((pension) => pension.proyecto === proyecto);
      }

      if (estado !== undefined) {
        visible = visible.filter((pension) => pension.estado === estado);
      }

      if (search) {
        const normalizedSearch = normalizeText(search);
        visible = visible.filter((pension) =>
          [
            pension.nombre,
            pension.descripcion ?? "",
            String(pension.precio),
          ].some((value) => normalizeText(String(value ?? "")).includes(normalizedSearch)),
        );
      }

      if (!shouldPaginate) {
        return res.status(200).json({ pensiones: visible });
      }

      return res.status(200).json(
        buildPaginatedResponse(
          "pensiones",
          paginateArray(visible, page, limit),
          visible.length,
          page,
          limit,
        ),
      );
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

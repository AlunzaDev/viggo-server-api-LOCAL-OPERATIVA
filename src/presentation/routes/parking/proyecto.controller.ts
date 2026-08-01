import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { ProyectoService } from "../../services/parking/proyecto.service";
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

export class ProyectoController {
  constructor(private readonly proyectoService: ProyectoService) {}

  getProyectos = async (req: Request, res: Response) => {
    try {
      const estado = parseBooleanQuery(req.query.estado);
      if (estado === null) {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const ciudad =
        typeof req.query.ciudad === "string" ? req.query.ciudad.trim() : "";
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);
      const proyectos = await this.proyectoService.getProyectos();
      const allowed = getAllowedProjectIdsFromRequest(req);
      let visible = isSuperAdminRequest(req)
        ? proyectos
        : proyectos.filter((proyecto) => allowed.includes(proyecto.id));

      if (estado !== undefined) {
        visible = visible.filter((proyecto) => proyecto.estado === estado);
      }

      if (ciudad) {
        const normalizedCity = normalizeText(ciudad);
        visible = visible.filter((proyecto) =>
          normalizeText(proyecto.ciudad).includes(normalizedCity),
        );
      }

      if (search) {
        const normalizedSearch = normalizeText(search);
        visible = visible.filter((proyecto) =>
          [
            proyecto.nombre,
            proyecto.identificador,
            proyecto.ciudad,
            proyecto.direccion ?? "",
            proyecto.descripcion ?? "",
          ].some((value) => normalizeText(String(value ?? "")).includes(normalizedSearch)),
        );
      }

      if (!shouldPaginate) {
        return res.status(200).json({ proyectos: visible });
      }

      return res.status(200).json(
        buildPaginatedResponse(
          "proyectos",
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

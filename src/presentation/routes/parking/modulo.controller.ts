import type { Request, Response } from "express";
import { ModuloListQueryDto } from "../../../domain/dtos/parking/modulo-list-query.dto";
import type { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { projectAccessFromRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import type { DeviceBindingResolution, ModuloService } from "../../services/parking/modulo.service";
import { buildPaginatedResponse, paginateArray, parsePaginationDateQuery } from "../../services/shared/pagination-query";

const serializeModulo = (modulo: ModuloEntity) => ({
  id: modulo.id,
  nombre: modulo.nombre,
  proyecto: modulo.proyecto,
  tipo: modulo.tipo,
  capabilities: modulo.capabilities,
  estado: modulo.estado,
  identificador: modulo.identificador,
  ip: modulo.ip,
  mac: modulo.mac,
  ubicacion: modulo.ubicacion,
  coordinates: modulo.coordinates,
  descripcion: modulo.descripcion,
  deviceBinding: modulo.deviceBinding,
  deviceBindingRequests: modulo.deviceBindingRequests,
  deviceConnectionAudit: modulo.deviceConnectionAudit,
  deviceRuntime: modulo.deviceRuntime,
  remoteSupport: modulo.remoteSupport,
  submodulos: modulo.submodulos,
});

/** HTTP for the installation's modules; the rules and the user's scope live in ModuloService. */
export class ModuloController {
  constructor(private readonly modulos: ModuloService) {}

  /** Without `page`/`limit` the whole list; with them, a page. */
  getModulos = async (req: Request, res: Response) => this.list(req, res, req.query as Record<string, unknown>);

  getModulosByProyecto = async (req: Request, res: Response) =>
    this.list(req, res, { ...(req.query as Record<string, unknown>), proyecto: String(req.params.proyectoId) });

  private async list(req: Request, res: Response, rawQuery: Record<string, unknown>) {
    try {
      const [error, query] = ModuloListQueryDto.create(rawQuery);
      if (error || !query) return res.status(400).json({ error });
      const { page, limit } = parsePaginationDateQuery(req.query);
      const modulos = (await this.modulos.listModulos(query, projectAccessFromRequest(req))).map(serializeModulo);
      if (req.query.page === undefined && req.query.limit === undefined) return res.status(200).json({ modulos });
      return res.status(200).json(buildPaginatedResponse("modulos", paginateArray(modulos, page, limit), modulos.length, page, limit));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  }

  getPendingBindings = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ modulos: (await this.modulos.pendingBindings(projectAccessFromRequest(req))).map(serializeModulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloById = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ modulo: serializeModulo(await this.modulos.getAccessibleModulo(String(req.params.id), projectAccessFromRequest(req))) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getSubmodulos = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ submodulos: await this.modulos.getAccessibleSubmodulos(String(req.params.id), projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloByIdentificador = async (req: Request, res: Response) => {
    try {
      const modulo = await this.modulos.getAccessibleByIdentificador(String(req.params.identificador).trim(), projectAccessFromRequest(req));
      return res.status(200).json({ modulo: serializeModulo(modulo) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  resetDeviceBinding = this.resolveBinding("RESET");
  approveDeviceBindingRequest = this.resolveBinding("APPROVED");
  rejectDeviceBindingRequest = this.resolveBinding("REJECTED");
  reopenDeviceBindingRequest = this.resolveBinding("PENDING");

  resolveRemoteSupportDevice = async (req: Request, res: Response) => {
    try {
      const result = await this.modulos.resolveRemoteSupportDevice(String(req.params.id), projectAccessFromRequest(req));
      return res.status(result.resolved ? 200 : 404).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createRemoteSupportSessionUrl = async (req: Request, res: Response) => {
    try {
      const viewMode = (req.body as Record<string, unknown> | undefined)?.viewMode;
      return res.status(200).json(await this.modulos.createRemoteSupportSessionUrl(String(req.params.id), viewMode, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createProjectRemoteSupportSessionUrl = async (req: Request, res: Response) => {
    try {
      const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
      return res.status(200).json(await this.modulos.createProjectRemoteSupportSessionUrl(projectId, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  private resolveBinding(status: DeviceBindingResolution) {
    return async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const payload = {
          fingerprint: typeof body.fingerprint === "string" ? body.fingerprint.trim() : undefined,
          notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
        };
        const modulo = await this.modulos.resolveDeviceBinding(String(req.params.id), status, payload, projectAccessFromRequest(req));
        return res.status(200).json({ modulo: serializeModulo(modulo) });
      } catch (error) {
        return ErrorService.handleApiError(error, res);
      }
    };
  }
}

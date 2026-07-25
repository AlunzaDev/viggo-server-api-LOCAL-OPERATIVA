import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { ModuloService } from "../../services/parking/modulo.service";
import { SocketServerPlugin } from "../../sockets/socket-server";

export class ModuloController {
  constructor(private readonly moduloService: ModuloService) {}

  private readonly moduloTipos = ["ENTRADA", "SALIDA", "POS"] as const;

  private parseResolveBody(body: Record<string, unknown>): {
    fingerprint?: string;
    notes?: string;
  } {
    return {
      fingerprint:
        typeof body.fingerprint === "string" ? body.fingerprint.trim() : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
    };
  }

  private parseEstado(value: unknown): boolean | undefined | null {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return null;
  }

  private parseTipos(value: unknown): Array<"ENTRADA" | "SALIDA" | "POS"> | null {
    if (value === undefined) return [];
    const values = Array.isArray(value)
      ? value
      : String(value).split(",").map((item) => item.trim()).filter(Boolean);
    const normalized = values.map((item) => String(item).trim().toUpperCase());
    if (normalized.some((item) => !this.moduloTipos.includes(item as never))) {
      return null;
    }
    return normalized as Array<"ENTRADA" | "SALIDA" | "POS">;
  }

  getModulos = async (req: Request, res: Response) => {
    try {
      const allowed = getAllowedProjectIdsFromRequest(req);
      const proyecto = typeof req.query.proyecto === "string"
        ? req.query.proyecto.trim()
        : "";
      const tipos = this.parseTipos(req.query.tipos ?? req.query.tipo);
      const estado = this.parseEstado(req.query.estado);

      if (tipos === null) return res.status(400).json({ error: "'tipo' no es valido" });
      if (estado === null) return res.status(400).json({ error: "'estado' debe ser boolean" });
      if (proyecto && !canAccessProjectFromRequest(req, proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const effectiveProject = proyecto ||
        (!isSuperAdminRequest(req) && allowed.length === 1 ? allowed[0] : "");
      let modulos = effectiveProject || tipos.length || estado !== undefined
        ? await this.moduloService.getModulosFiltered({
            proyecto: effectiveProject || undefined,
            tipo: tipos[0],
            estado,
          })
        : await this.moduloService.getModulos();

      if (!isSuperAdminRequest(req)) {
        modulos = modulos.filter((modulo) => allowed.includes(modulo.proyecto));
      }
      if (tipos.length > 1) {
        modulos = modulos.filter((modulo) => tipos.includes(modulo.tipo));
      }
      return res.status(200).json({ modulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPendingBindings = async (req: Request, res: Response) => {
    try {
      const allowed = getAllowedProjectIdsFromRequest(req);
      let modulos = await this.moduloService.getModulosWithPendingDeviceBindingRequests();
      if (!isSuperAdminRequest(req)) {
        modulos = modulos.filter((modulo) => allowed.includes(modulo.proyecto));
      }
      return res.status(200).json({ modulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloById = async (req: Request, res: Response) => {
    try {
      const modulo = await this.moduloService.getModuloById(String(req.params.id));
      if (!canAccessProjectFromRequest(req, modulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getSubmodulos = async (req: Request, res: Response) => {
    try {
      const modulo = await this.moduloService.getModuloById(String(req.params.id));
      if (!canAccessProjectFromRequest(req, modulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const submodulos = await this.moduloService.getSubmodulos(modulo.id);
      return res.status(200).json({ submodulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloByIdentificador = async (req: Request, res: Response) => {
    try {
      const modulo = await this.moduloService.getModuloByIdentificador(
        String(req.params.identificador).trim(),
      );
      if (!canAccessProjectFromRequest(req, modulo.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulosByProyecto = async (req: Request, res: Response) => {
    req.query.proyecto = String(req.params.proyectoId);
    return this.getModulos(req, res);
  };

  resetDeviceBinding = this.resolveBinding("RESET");
  approveDeviceBindingRequest = this.resolveBinding("APPROVED");
  rejectDeviceBindingRequest = this.resolveBinding("REJECTED");
  reopenDeviceBindingRequest = this.resolveBinding("PENDING");

  private resolveBinding(status: "RESET" | "APPROVED" | "REJECTED" | "PENDING") {
    return async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id);
        const current = await this.moduloService.getModuloById(id);
        if (!canAccessProjectFromRequest(req, current.proyecto)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const payload = this.parseResolveBody(req.body as Record<string, unknown>);
        const modulo = status === "RESET"
          ? await this.moduloService.resetDeviceBinding(id)
          : status === "APPROVED"
            ? await this.moduloService.approveDeviceBindingRequest(id, payload)
            : status === "REJECTED"
              ? await this.moduloService.rejectDeviceBindingRequest(id, payload)
              : await this.moduloService.reopenDeviceBindingRequest(id, payload);

        SocketServerPlugin.emitDeviceBindingUpdated({
          moduleId: modulo.id,
          fingerprint: payload.fingerprint,
          status,
          reason: `${status}_DEVICE_BINDING`,
          timestamp: new Date().toISOString(),
        });
        return res.status(200).json({ modulo });
      } catch (error) {
        return ErrorService.handleApiError(error, res);
      }
    };
  }
}

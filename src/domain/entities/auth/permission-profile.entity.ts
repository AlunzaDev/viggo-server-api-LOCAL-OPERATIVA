import {
  isUserAppAccess,
  getInvalidUserModules,
  normalizeUserModules,
  type UserAppAccess,
  type UserModuleAccess,
} from "../../constants";

import { CustomError } from "../../errors/custom.error";

export interface PermissionProfileEntityOptions {
  id: string;
  app: UserAppAccess;
  nombre: string;
  descripcion?: string;
  modules: UserModuleAccess[];
  estado: boolean;
}

const parseBoolean = (value: unknown, defaultValue = true): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "activo", "active", "enabled"].includes(normalized)) {
      return true;
    }

    if (
      ["false", "0", "inactivo", "inactive", "disabled"].includes(normalized)
    ) {
      return false;
    }
  }

  return defaultValue;
};

export class PermissionProfileEntity {
  public id: string;
  public app: UserAppAccess;
  public nombre: string;
  public descripcion?: string;
  public modules: UserModuleAccess[];
  public estado: boolean;

  constructor(options: PermissionProfileEntityOptions) {
    this.id = options.id;
    this.app = options.app;
    this.nombre = options.nombre;
    this.descripcion = options.descripcion;
    this.modules = normalizeUserModules(options.modules);
    this.estado = options.estado;
  }

  static fromObject(object: Record<string, unknown>): PermissionProfileEntity {
    const profileId = object.id ?? object._id;

    if (!profileId) {
      throw CustomError.badRequest("Missing permission profile id");
    }

    const app = object.app;

    if (!isUserAppAccess(app)) {
      throw CustomError.badRequest("Missing or invalid permission profile app");
    }

    const nombre =
      typeof object.nombre === "string" ? object.nombre.trim() : "";

    if (!nombre) {
      throw CustomError.badRequest("Missing permission profile nombre");
    }

    if (!Array.isArray(object.modules)) {
      throw CustomError.badRequest("Invalid permission profile modules");
    }

    const invalidModules = getInvalidUserModules(object.modules);

    if (invalidModules.length > 0) {
      throw CustomError.badRequest(
        `Permission profile contains invalid operative modules: ${invalidModules.join(", ")}`,
      );
    }

    const descripcion =
      typeof object.descripcion === "string" &&
      object.descripcion.trim().length > 0
        ? object.descripcion.trim()
        : undefined;

    return new PermissionProfileEntity({
      id: String(profileId).trim(),
      app,
      nombre,
      descripcion,
      modules: normalizeUserModules(object.modules),
      estado: parseBoolean(object.estado, true),
    });
  }
}

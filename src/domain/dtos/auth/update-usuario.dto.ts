import {
  USER_APPS,
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserParkings,
  type UserAppAccess,
  type UsuarioRol,
} from "../../constants";

import type { UserAppPermission } from "../../entities/auth/usuario.entity";

interface UpdateUsuarioDtoOptions {
  nombre?: string;
  apellido?: string;
  correo?: string;
  telefono?: string;
  password?: string;
  rol?: UsuarioRol;
  parkings?: string[];
  allowedApps?: UserAppAccess[];
  appPermissions?: UserAppPermission[];
  coordinates?: number[];
  nacimiento?: number;
  img?: string;
  google?: boolean;
}

const normalizeAppPermissions = (
  value: unknown,
): UserAppPermission[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const permissions: UserAppPermission[] = [];
  const assignedApps = new Set<UserAppAccess>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const rawPermission = item as Record<string, unknown>;

    const app = rawPermission.app;

    const permissionProfileId = String(
      rawPermission.permissionProfileId ?? "",
    ).trim();

    if (
      !isUserAppAccess(app) ||
      !permissionProfileId ||
      assignedApps.has(app)
    ) {
      return null;
    }

    assignedApps.add(app);

    permissions.push({
      app,
      permissionProfileId,
    });
  }

  return permissions;
};

export class UpdateUsuarioDto {
  public readonly nombre?: string;
  public readonly apellido?: string;
  public readonly correo?: string;
  public readonly telefono?: string;
  public readonly password?: string;
  public readonly rol?: UsuarioRol;
  public readonly parkings?: string[];
  public readonly allowedApps?: UserAppAccess[];
  public readonly appPermissions?: UserAppPermission[];
  public readonly coordinates?: number[];
  public readonly nacimiento?: number;
  public readonly img?: string;
  public readonly google?: boolean;

  private constructor(options: UpdateUsuarioDtoOptions) {
    this.nombre = options.nombre;
    this.apellido = options.apellido;
    this.correo = options.correo;
    this.telefono = options.telefono;
    this.password = options.password;
    this.rol = options.rol;
    this.parkings = options.parkings;
    this.allowedApps = options.allowedApps;
    this.appPermissions = options.appPermissions;
    this.coordinates = options.coordinates;
    this.nacimiento = options.nacimiento;
    this.img = options.img;
    this.google = options.google;
  }

  static create(body: Record<string, unknown>): [string?, UpdateUsuarioDto?] {
    const options: UpdateUsuarioDtoOptions = {};

    if (body.nombre !== undefined) {
      const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";

      if (!nombre) {
        return ["'nombre' no puede ir vacío"];
      }

      options.nombre = nombre;
    }

    if (body.apellido !== undefined) {
      const apellido =
        typeof body.apellido === "string" ? body.apellido.trim() : "";

      if (!apellido) {
        return ["'apellido' no puede ir vacío"];
      }

      options.apellido = apellido;
    }

    if (body.correo !== undefined) {
      const correo =
        typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";

      if (!correo) {
        return ["'correo' no puede ir vacío"];
      }

      options.correo = correo;
    }

    if (body.telefono !== undefined) {
      const telefono =
        typeof body.telefono === "string" ? body.telefono.trim() : "";

      if (!telefono) {
        return ["'telefono' no puede ir vacío"];
      }

      options.telefono = telefono;
    }

    if (body.password !== undefined) {
      const password = typeof body.password === "string" ? body.password : "";

      if (password.length < 6) {
        return ["'password' debe tener al menos 6 caracteres"];
      }

      options.password = password;
    }

    if (body.rol !== undefined) {
      if (!isUsuarioRol(body.rol)) {
        return ["'rol' no es válido"];
      }

      options.rol = body.rol;
    }

    if (body.parkings !== undefined) {
      if (!Array.isArray(body.parkings)) {
        return ["'parkings' debe ser un arreglo"];
      }

      options.parkings = normalizeUserParkings(body.parkings);
    }

    const updatesApplicationAccess =
      body.allowedApps !== undefined || body.appPermissions !== undefined;

    if (updatesApplicationAccess) {
      if (body.allowedApps === undefined || body.appPermissions === undefined) {
        return ["'allowedApps' y 'appPermissions' deben enviarse juntos"];
      }

      if (
        !Array.isArray(body.allowedApps) ||
        !body.allowedApps.every(isUserAppAccess)
      ) {
        return ["'allowedApps' contiene aplicaciones inválidas"];
      }

      const allowedApps = normalizeUserApps(body.allowedApps);

      if (allowedApps.length === 0) {
        return ["Selecciona al menos una aplicación"];
      }

      const appPermissions = normalizeAppPermissions(body.appPermissions);

      if (!appPermissions) {
        return ["'appPermissions' contiene asignaciones inválidas"];
      }

      const missingProfile = allowedApps.find(
        (app) =>
          app !== USER_APPS.OPERATIVE_MOBILE &&
          !appPermissions.some((permission) => permission.app === app),
      );

      if (missingProfile) {
        return [`Selecciona un perfil para ${missingProfile}`];
      }

      const extraProfile = appPermissions.find(
        (permission) => !allowedApps.includes(permission.app),
      );

      if (extraProfile) {
        return [
          `El perfil de ${extraProfile.app} no corresponde a una aplicación habilitada`,
        ];
      }

      options.allowedApps = allowedApps;
      options.appPermissions = appPermissions;
    }

    if (body.coordinates !== undefined) {
      if (!Array.isArray(body.coordinates)) {
        return ["'coordinates' debe ser un arreglo"];
      }

      const coordinates = body.coordinates.map(Number);

      if (coordinates.some((coordinate) => !Number.isFinite(coordinate))) {
        return ["'coordinates' debe contener solo números"];
      }

      options.coordinates = coordinates;
    }

    if (body.nacimiento !== undefined) {
      const nacimiento =
        body.nacimiento === null || String(body.nacimiento).trim().length === 0
          ? undefined
          : Number(body.nacimiento);

      if (nacimiento !== undefined && !Number.isFinite(nacimiento)) {
        return ["'nacimiento' debe ser numérico"];
      }

      options.nacimiento = nacimiento;
    }

    if (body.img !== undefined) {
      if (typeof body.img !== "string") {
        return ["'img' no es válida"];
      }

      const img = body.img.trim();

      if (img) {
        options.img = img;
      }
    }

    if (body.google !== undefined) {
      if (typeof body.google !== "boolean") {
        return ["'google' debe ser booleano"];
      }

      options.google = body.google;
    }

    if (Object.keys(options).length === 0) {
      return ["Debes enviar al menos un campo para actualizar"];
    }

    return [undefined, new UpdateUsuarioDto(options)];
  }
}

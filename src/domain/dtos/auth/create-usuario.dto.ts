import {
  AUTH_ROLES,
  USER_APPS,
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserParkings,
  type UserAppAccess,
  type UsuarioRol,
} from "../../constants";

import type { UserAppPermission } from "../../entities/auth/usuario.entity";

interface CreateUsuarioDtoOptions {
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  password: string;
  rol: UsuarioRol;
  parkings: string[];
  allowedApps: UserAppAccess[];
  appPermissions: UserAppPermission[];
  coordinates?: number[];
  nacimiento?: number;
  img?: string;
  estado: boolean;
  google: boolean;
  emailValidated: boolean;
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

export class CreateUsuarioDto {
  public readonly nombre: string;
  public readonly apellido: string;
  public readonly correo: string;
  public readonly telefono: string;
  public readonly password: string;
  public readonly rol: UsuarioRol;
  public readonly parkings: string[];
  public readonly allowedApps: UserAppAccess[];
  public readonly appPermissions: UserAppPermission[];
  public readonly coordinates?: number[];
  public readonly nacimiento?: number;
  public readonly img?: string;
  public readonly estado: boolean;
  public readonly google: boolean;
  public readonly emailValidated: boolean;

  private constructor(options: CreateUsuarioDtoOptions) {
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
    this.estado = options.estado;
    this.google = options.google;
    this.emailValidated = options.emailValidated;
  }

  static create(body: Record<string, unknown>): [string?, CreateUsuarioDto?] {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";

    const apellido =
      typeof body.apellido === "string" ? body.apellido.trim() : "";

    const correo =
      typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";

    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : "";

    const password = typeof body.password === "string" ? body.password : "";

    const rol =
      body.rol === undefined
        ? AUTH_ROLES.CLIENT
        : isUsuarioRol(body.rol)
          ? body.rol
          : null;

    if (!nombre) {
      return ["'nombre' es requerido"];
    }

    if (!apellido) {
      return ["'apellido' es requerido"];
    }

    if (!correo) {
      return ["'correo' es requerido"];
    }

    if (!telefono) {
      return ["'telefono' es requerido"];
    }

    if (!password) {
      return ["'password' es requerido"];
    }

    if (password.length < 6) {
      return ["'password' debe tener al menos 6 caracteres"];
    }

    if (rol === null) {
      return ["'rol' no es válido"];
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

    const coordinates = Array.isArray(body.coordinates)
      ? body.coordinates.map(Number)
      : undefined;

    if (coordinates?.some((coordinate) => !Number.isFinite(coordinate))) {
      return ["'coordinates' debe contener solo números"];
    }

    const nacimiento =
      body.nacimiento === undefined ||
      body.nacimiento === null ||
      String(body.nacimiento).trim().length === 0
        ? undefined
        : Number(body.nacimiento);

    if (nacimiento !== undefined && !Number.isFinite(nacimiento)) {
      return ["'nacimiento' debe ser numérico"];
    }

    const img =
      typeof body.img === "string" && body.img.trim().length > 0
        ? body.img.trim()
        : undefined;

    return [
      undefined,
      new CreateUsuarioDto({
        nombre,
        apellido,
        correo,
        telefono,
        password,
        rol,

        parkings: normalizeUserParkings(body.parkings),

        allowedApps,
        appPermissions,
        coordinates,
        nacimiento,
        img,

        estado: typeof body.estado === "boolean" ? body.estado : true,

        google: typeof body.google === "boolean" ? body.google : false,

        emailValidated:
          typeof body.emailValidated === "boolean"
            ? body.emailValidated
            : false,
      }),
    ];
  }
}

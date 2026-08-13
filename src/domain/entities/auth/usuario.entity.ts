import { CustomError } from "../../errors/custom.error";

import {
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserParkings,
  type UserAppAccess,
  type UsuarioRol,
} from "../../constants";

export interface UserAppPermission {
  app: UserAppAccess;
  permissionProfileId: string;
}

export interface UsuarioEntityOptions {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  coordinates?: number[];
  password: string;
  emailValidated: boolean;
  rol: UsuarioRol;
  parkings: string[];
  allowedApps: UserAppAccess[];
  appPermissions: UserAppPermission[];
  nacimiento?: number;
  img?: string;
  estado: boolean;
  google: boolean;
  barrierBlasterHighScore: number;
}

const parseBoolean = (value: unknown, defaultValue = false): boolean => {
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

const normalizeAppPermissions = (value: unknown): UserAppPermission[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const permissions: UserAppPermission[] = [];
  const assignedApps = new Set<UserAppAccess>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
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
      continue;
    }

    assignedApps.add(app);

    permissions.push({
      app,
      permissionProfileId,
    });
  }

  return permissions;
};

export class UsuarioEntity {
  public id: string;
  public nombre: string;
  public apellido: string;
  public correo: string;
  public telefono: string;
  public coordinates?: number[];
  public password: string;
  public emailValidated: boolean;
  public rol: UsuarioRol;
  public parkings: string[];
  public allowedApps: UserAppAccess[];
  public appPermissions: UserAppPermission[];
  public nacimiento?: number;
  public img?: string;
  public estado: boolean;
  public google: boolean;
  public barrierBlasterHighScore: number;

  constructor(options: UsuarioEntityOptions) {
    this.id = options.id;
    this.nombre = options.nombre;
    this.apellido = options.apellido;
    this.correo = options.correo;
    this.telefono = options.telefono;
    this.coordinates = options.coordinates;
    this.password = options.password;
    this.emailValidated = options.emailValidated;
    this.rol = options.rol;
    this.parkings = normalizeUserParkings(options.parkings);
    this.allowedApps = normalizeUserApps(options.allowedApps);
    this.appPermissions = normalizeAppPermissions(options.appPermissions);
    this.nacimiento = options.nacimiento;
    this.img = options.img;
    this.estado = options.estado;
    this.google = options.google;
    this.barrierBlasterHighScore = options.barrierBlasterHighScore;
  }

  static fromObject(object: Record<string, unknown>): UsuarioEntity {
    const {
      _id,
      id,
      nombre,
      apellido,
      correo,
      telefono,
      coordinates,
      password,
      emailValidated,
      rol,
      parkings,
      allowedApps,
      appPermissions,
      nacimiento,
      img,
      estado,
      google,
      barrierBlasterHighScore,
    } = object;

    const usuarioId = id ?? (_id !== undefined ? String(_id) : undefined);

    if (!usuarioId) {
      throw CustomError.badRequest("Missing id");
    }

    if (!nombre) {
      throw CustomError.badRequest("Missing nombre");
    }

    if (!apellido) {
      throw CustomError.badRequest("Missing apellido");
    }

    if (!correo) {
      throw CustomError.badRequest("Missing correo");
    }

    if (!telefono) {
      throw CustomError.badRequest("Missing telefono");
    }

    if (!password) {
      throw CustomError.badRequest("Missing password");
    }

    if (!rol) {
      throw CustomError.badRequest("Missing rol");
    }

    if (estado === undefined || estado === null) {
      throw CustomError.badRequest("Missing estado");
    }

    if (google === undefined || google === null) {
      throw CustomError.badRequest("Missing google");
    }

    if (!isUsuarioRol(rol)) {
      throw CustomError.badRequest("Invalid rol");
    }

    const parsedCoordinates = Array.isArray(coordinates)
      ? coordinates.map(Number)
      : undefined;

    if (parsedCoordinates?.some((value) => !Number.isFinite(value))) {
      throw CustomError.badRequest("Invalid coordinates");
    }

    const parsedNacimiento =
      typeof nacimiento === "number"
        ? nacimiento
        : nacimiento !== undefined &&
            nacimiento !== null &&
            String(nacimiento).trim().length > 0
          ? Number(nacimiento)
          : undefined;

    if (parsedNacimiento !== undefined && !Number.isFinite(parsedNacimiento)) {
      throw CustomError.badRequest("Invalid nacimiento");
    }

    return new UsuarioEntity({
      id: String(usuarioId).trim(),

      nombre: String(nombre).trim(),

      apellido: String(apellido).trim(),

      correo: String(correo).trim().toLowerCase(),

      telefono: String(telefono).trim(),

      coordinates: parsedCoordinates,

      password: String(password),

      emailValidated: parseBoolean(emailValidated, false),

      rol,

      parkings: normalizeUserParkings(parkings),

      allowedApps: normalizeUserApps(allowedApps),

      appPermissions: normalizeAppPermissions(appPermissions),

      nacimiento: parsedNacimiento,

      img:
        typeof img === "string" && img.trim().length > 0
          ? img.trim()
          : undefined,

      estado: parseBoolean(estado, true),

      google: parseBoolean(google, false),

      barrierBlasterHighScore:
        typeof barrierBlasterHighScore === "number" &&
        Number.isFinite(barrierBlasterHighScore) &&
        barrierBlasterHighScore > 0
          ? Math.floor(barrierBlasterHighScore)
          : 0,
    });
  }
}

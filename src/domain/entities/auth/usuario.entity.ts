import { CustomError } from "../../errors/custom.error";
import {
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserModules,
  normalizeUserParkings,
  type UserAppAccess,
  type UserModuleAccess,
  type UsuarioRol,
} from "../../constants";

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
  permissionProfileId?: string;
  allowedApps: UserAppAccess[];
  modules: UserModuleAccess[];
  nacimiento?: number;
  img?: string;
  estado: boolean;
  google: boolean;
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
  public permissionProfileId?: string;
  public allowedApps: UserAppAccess[];
  public modules: UserModuleAccess[];
  public nacimiento?: number;
  public img?: string;
  public estado: boolean;
  public google: boolean;

  constructor(options: UsuarioEntityOptions) {
    const {
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
      permissionProfileId,
      allowedApps,
      modules,
      nacimiento,
      img,
      estado,
      google,
    } = options;

    this.id = id;
    this.nombre = nombre;
    this.apellido = apellido;
    this.correo = correo;
    this.telefono = telefono;
    this.coordinates = coordinates;
    this.password = password;
    this.emailValidated = emailValidated;
    this.rol = rol;
    this.parkings = normalizeUserParkings(parkings);
    this.permissionProfileId = permissionProfileId;
    this.allowedApps = normalizeUserApps(allowedApps);
    this.modules = normalizeUserModules(modules);
    this.nacimiento = nacimiento;
    this.img = img;
    this.estado = estado;
    this.google = google;
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
      permissionProfileId,
      allowedApps,
      modules,
      nacimiento,
      img,
      estado,
      google,
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
      ? coordinates.map((value) => Number(value))
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
      permissionProfileId:
        typeof permissionProfileId === "string" &&
        permissionProfileId.trim().length > 0
          ? permissionProfileId.trim()
          : undefined,
      allowedApps: normalizeUserApps(allowedApps),
      modules: normalizeUserModules(modules),
      nacimiento: parsedNacimiento,
      img:
        typeof img === "string" && img.trim().length > 0
          ? img.trim()
          : undefined,
      estado: parseBoolean(estado, true),
      google: parseBoolean(google, false),
    });
  }
}

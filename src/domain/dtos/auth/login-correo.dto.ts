import {
  isUserAppAccess,
  isWebOperativeApp,
  type WebOperativeApp,
} from "../../constants";

export class LoginCorreoDto {
  private constructor(
    public readonly correo: string,
    public readonly password: string,
    public readonly app: WebOperativeApp,
  ) {}

  static create(body: Record<string, unknown>): [string?, LoginCorreoDto?] {
    const correo =
      typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";

    const password = typeof body.password === "string" ? body.password : "";

    const app = body.app;

    if (!correo) {
      return ["'correo' es requerido"];
    }

    if (!password) {
      return ["'password' es requerido"];
    }

    if (!app) {
      return ["'app' es requerida"];
    }

    if (!isUserAppAccess(app)) {
      return ["'app' contiene un valor inválido"];
    }

    if (!isWebOperativeApp(app)) {
      return ["Esta API solo permite el acceso desde el Web Operativo"];
    }

    return [undefined, new LoginCorreoDto(correo, password, app)];
  }
}

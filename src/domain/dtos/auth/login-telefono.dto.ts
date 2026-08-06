import {
  isUserAppAccess,
  isWebOperativeApp,
  type WebOperativeApp,
} from "../../constants";

export class LoginTelefonoDto {
  private constructor(
    public readonly telefono: string,
    public readonly password: string,
    public readonly app: WebOperativeApp,
  ) {}

  static create(body: Record<string, unknown>): [string?, LoginTelefonoDto?] {
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : "";

    const password = typeof body.password === "string" ? body.password : "";

    const app = body.app;

    if (!telefono) {
      return ["'telefono' es requerido"];
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

    return [undefined, new LoginTelefonoDto(telefono, password, app)];
  }
}

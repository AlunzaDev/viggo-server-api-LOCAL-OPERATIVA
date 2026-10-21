import { randomBytes, createCipheriv } from "node:crypto";
import { envs } from "../../../config";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";

type MeshCentralViewMode = 10 | 11 | 12;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const buildLoginToken = (payload: Record<string, unknown>, keyHex: string): string => {
  const key = Buffer.from(keyHex.trim(), "hex");

  if (key.length < 32) {
    throw new Error("MESHCENTRAL_LOGIN_TOKEN_KEY no tiene formato valido");
  }

  const cookiePayload = {
    ...payload,
    time: Math.floor(Date.now() / 1000),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.subarray(0, 32), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(cookiePayload), "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
    .toString("base64")
    .replace(/\+/g, "@")
    .replace(/\//g, "$");
};

const normalizeViewMode = (value: unknown): MeshCentralViewMode => {
  const mode = Number(value);
  return mode === 11 || mode === 12 ? mode : 10;
};

export class MeshCentralSessionUrlService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async createModuleSessionUrl(moduleId: string, viewModeInput: unknown = 10) {
    if (!envs.MESHCENTRAL_LOGIN_TOKEN_KEY) {
      throw new Error("MESHCENTRAL_LOGIN_TOKEN_KEY no esta configurado");
    }
    if (!envs.MESHCENTRAL_LOGIN_USER) {
      throw new Error("MESHCENTRAL_LOGIN_USER no esta configurado");
    }

    const modulo = await this.moduloRepository.findById(moduleId);
    if (!modulo) {
      throw new Error("Modulo no encontrado");
    }

    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);
    const projectSupport = proyecto?.remoteSupport ?? null;
    const moduleSupport = modulo.remoteSupport ?? null;
    const provider = moduleSupport?.provider || projectSupport?.provider || "MESHCENTRAL";
    if (provider !== "MESHCENTRAL") {
      throw new Error(`El proveedor '${provider}' no es compatible con MeshCentral`);
    }
    const baseUrl = normalizeText(moduleSupport?.baseUrl || projectSupport?.baseUrl).replace(/\/+$/, "");
    const deviceId = normalizeText(moduleSupport?.deviceId);

    if (!baseUrl) {
      throw new Error("El modulo no tiene URL de soporte remoto configurada");
    }
    if (!deviceId) {
      throw new Error("El modulo no tiene deviceId de soporte remoto resuelto");
    }

    const viewMode = normalizeViewMode(viewModeInput);
    const loginToken = buildLoginToken(
      {
        u: `user//${envs.MESHCENTRAL_LOGIN_USER}`,
        a: 3,
      },
      envs.MESHCENTRAL_LOGIN_TOKEN_KEY,
    );
    const loginUrl = new URL(baseUrl);
    const targetUrl = `${baseUrl}/?viewmode=${viewMode}&gotonode=${deviceId}`;

    loginUrl.searchParams.set("login", loginToken);

    return {
      url: loginUrl.toString(),
      loginUrl: loginUrl.toString(),
      targetUrl,
      viewMode,
      expiresInSeconds: 3600,
      deviceId,
      deviceName: normalizeText(moduleSupport?.deviceName) || modulo.nombre,
    };
  }

  async createProjectSessionUrl(projectId: string) {
    if (!envs.MESHCENTRAL_LOGIN_TOKEN_KEY) {
      throw new Error("MESHCENTRAL_LOGIN_TOKEN_KEY no esta configurado");
    }
    if (!envs.MESHCENTRAL_LOGIN_USER) {
      throw new Error("MESHCENTRAL_LOGIN_USER no esta configurado");
    }

    const proyecto = await this.proyectoRepository.findById(projectId);
    if (!proyecto) {
      throw new Error("Proyecto no encontrado");
    }

    const projectSupport = proyecto.remoteSupport ?? null;
    const provider = projectSupport?.provider || "MESHCENTRAL";
    if (provider !== "MESHCENTRAL") {
      throw new Error(`El proveedor '${provider}' no es compatible con MeshCentral`);
    }

    const baseUrl = normalizeText(projectSupport?.baseUrl).replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("El proyecto no tiene URL de soporte remoto configurada");
    }

    const loginToken = buildLoginToken(
      {
        u: `user//${envs.MESHCENTRAL_LOGIN_USER}`,
        a: 3,
      },
      envs.MESHCENTRAL_LOGIN_TOKEN_KEY,
    );
    const loginUrl = new URL(baseUrl);
    loginUrl.searchParams.set("login", loginToken);

    return {
      url: loginUrl.toString(),
      loginUrl: loginUrl.toString(),
      targetUrl: baseUrl,
      viewMode: 0,
      expiresInSeconds: 3600,
      projectId: proyecto.id,
      projectName: proyecto.nombre,
    };
  }
}

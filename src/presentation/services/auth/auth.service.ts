import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { envs } from "../../../config/plugins/envs.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";
import { InstallationIdentityService } from "../installation/installation-identity.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const ADMINISTRATIVO_SYNC_RETRY_DELAYS_MS = [0, 450];

class AdministrativoUnavailableError extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async loginCorreo(
    correo: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByCorreo(correo);
    return this.login(usuario, password, {
      endpoint: "/api/auth/login-correo",
      credentials: { correo, password },
      syncEndpoint: `/api/sync/access-user/by-correo/${encodeURIComponent(correo)}`,
    });
  }

  async loginTelefono(
    telefono: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByTelefono(telefono);
    return this.login(usuario, password, {
      endpoint: "/api/auth/login-telefono",
      credentials: { telefono, password },
      syncEndpoint: `/api/sync/access-user/by-telefono/${encodeURIComponent(telefono)}`,
    });
  }

  async renewToken(
    id: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findById(id);
    if (!usuario) throw CustomError.unauthorized("Usuario no encontrado");

    this.ensureUserCanOperate(usuario);
    return this.issueSession(usuario);
  }

  private async login(
    usuario: UsuarioEntity | null,
    password: string,
    remoteLogin: {
      endpoint: string;
      credentials: Record<string, string>;
      syncEndpoint: string;
    },
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    try {
      const remoteUsuario = await this.loginAgainstAdministrativo(remoteLogin);
      this.ensureUserCanOperate(remoteUsuario);
      const cachedUsuario = await this.authRepository.upsertFromAdministrativo(remoteUsuario);
      return this.issueSession(cachedUsuario);
    } catch (error) {
      console.warn("[OPERATIVO auth] Remote login against ADMINISTRATIVO failed:", {
        endpoint: remoteLogin.endpoint,
        syncEndpoint: remoteLogin.syncEndpoint,
        reason: error instanceof Error ? error.message : String(error),
        hasLocalUser: Boolean(usuario),
      });
      if (!(error instanceof AdministrativoUnavailableError)) {
        throw error;
      }
    }

    if (!usuario || !bcryptPlugin.compare(password, usuario.password)) {
      throw CustomError.unauthorized(
        "El servidor central no esta disponible y no hay una sesion local valida",
      );
    }

    await this.ensureOfflineLoginAllowed(usuario);
    this.ensureUserCanOperate(usuario);
    return this.issueSession(usuario);
  }

  private ensureUserCanOperate(usuario: UsuarioEntity): void {
    if (!usuario.estado) throw CustomError.forbidden("Usuario inactivo");
    if (!usuario.emailValidated) {
      throw CustomError.forbidden("La cuenta aun no ha sido validada");
    }
  }

  private async issueSession(
    usuario: UsuarioEntity,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const token = await JwtPlugin.generateToken({ id: usuario.id });
    if (!token) throw CustomError.internalServer("No se pudo generar el token");

    const { password: _password, ...safeUsuario } = usuario;
    return { token, usuario: safeUsuario };
  }

  private async ensureOfflineLoginAllowed(usuario: UsuarioEntity): Promise<void> {
    const metadata = await this.authRepository.getSyncMetadataById(usuario.id);
    const lastCloudCheckAt = metadata?.lastCloudCheckAt ?? metadata?.lastSyncedAt;

    if (!lastCloudCheckAt) {
      throw CustomError.forbidden(
        "Este usuario aun no tiene una validacion reciente",
      );
    }

    const maxAgeMs = envs.OFFLINE_LOGIN_MAX_AGE_DAYS * DAY_MS;
    const ageMs = Date.now() - lastCloudCheckAt;
    if (ageMs > maxAgeMs) {
      throw CustomError.forbidden(
        "La validacion local expiro. Conecta con internet para renovar el acceso.",
      );
    }
  }

  private async loginAgainstAdministrativo({
    endpoint,
    credentials,
    syncEndpoint,
  }: {
    endpoint: string;
    credentials: Record<string, string>;
    syncEndpoint: string;
  }): Promise<UsuarioEntity> {
    const baseUrl = envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "");
    console.log("[OPERATIVO auth] Attempting remote login:", {
      baseUrl,
      endpoint,
      syncEndpoint,
    });

    let loginResponse: Response;
    try {
      loginResponse = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    } catch (_error) {
      console.warn("[OPERATIVO auth] ADMINISTRATIVO login request threw before response");
      throw new AdministrativoUnavailableError("ADMINISTRATIVO no disponible");
    }

    if (!loginResponse.ok) {
      console.warn("[OPERATIVO auth] ADMINISTRATIVO login responded with non-ok status", {
        status: loginResponse.status,
        statusText: loginResponse.statusText,
      });
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const installationId = await InstallationIdentityService.getInstallationId();
    console.log("[OPERATIVO auth] Requesting sync snapshot after remote login:", {
      syncEndpoint,
      installationId,
    });

    let syncResponse: Response | null = null;
    let lastSyncError: unknown = null;

    for (let attempt = 0; attempt < ADMINISTRATIVO_SYNC_RETRY_DELAYS_MS.length; attempt += 1) {
      const delayMs = ADMINISTRATIVO_SYNC_RETRY_DELAYS_MS[attempt];
      if (delayMs > 0) {
        await wait(delayMs);
      }

      try {
        syncResponse = await fetch(`${baseUrl}${syncEndpoint}`, {
          headers: {
            Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
            "X-Viggo-Installation-Id": installationId,
          },
        });
        lastSyncError = null;
        break;
      } catch (error) {
        lastSyncError = error;
        console.warn("[OPERATIVO auth] ADMINISTRATIVO sync request threw before response:", {
          reason: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
        });
      }
    }

    if (!syncResponse) {
      throw new AdministrativoUnavailableError(
        lastSyncError instanceof Error ? lastSyncError.message : "ADMINISTRATIVO no disponible",
      );
    }

    if (!syncResponse.ok) {
      console.warn("[OPERATIVO auth] ADMINISTRATIVO sync responded with non-ok status", {
        status: syncResponse.status,
        statusText: syncResponse.statusText,
      });
      throw new AdministrativoUnavailableError(
        "No se pudo sincronizar el usuario local",
      );
    }

    const data = (await syncResponse.json()) as { user?: Record<string, unknown> };
    const usuario = data.user;
    if (!usuario) {
      throw CustomError.unauthorized("El servidor central no regreso un usuario valido");
    }

    return UsuarioEntity.fromObject(usuario);
  }
}

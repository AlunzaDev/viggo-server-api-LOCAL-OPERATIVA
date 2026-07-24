import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { envs } from "../../../config/plugins/envs.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";
import { InstallationIdentityService } from "../installation/installation-identity.service";

const DAY_MS = 24 * 60 * 60 * 1000;

class NubeadminUnavailableError extends Error {}

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
      const remoteUsuario = await this.loginAgainstNubeadmin(remoteLogin);
      this.ensureUserCanOperate(remoteUsuario);
      const cachedUsuario = await this.authRepository.upsertFromNubeadmin(remoteUsuario);
      return this.issueSession(cachedUsuario);
    } catch (error) {
      if (!(error instanceof NubeadminUnavailableError)) {
        throw error;
      }
    }

    if (!usuario || !bcryptPlugin.compare(password, usuario.password)) {
      throw CustomError.unauthorized(
        "NUBEADMIN no esta disponible y no hay una sesion local valida",
      );
    }

    await this.ensureOfflineLoginAllowed(usuario);
    this.ensureUserCanOperate(usuario);
    return this.issueSession(usuario);
  }

  private ensureUserCanOperate(usuario: UsuarioEntity): void {
    if (!usuario.estado) throw CustomError.forbidden("Usuario inactivo");
    if (!usuario.emailValidated) {
      throw CustomError.forbidden("La cuenta no está validada en NUBEADMIN");
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
        "Este usuario aun no tiene validacion reciente de NUBEADMIN",
      );
    }

    const maxAgeMs = envs.OFFLINE_LOGIN_MAX_AGE_DAYS * DAY_MS;
    const ageMs = Date.now() - lastCloudCheckAt;
    if (ageMs > maxAgeMs) {
      throw CustomError.forbidden(
        `La validacion offline expiro. Conecta con NUBEADMIN para renovar acceso.`,
      );
    }
  }

  private async loginAgainstNubeadmin({
    endpoint,
    credentials,
    syncEndpoint,
  }: {
    endpoint: string;
    credentials: Record<string, string>;
    syncEndpoint: string;
  }): Promise<UsuarioEntity> {
    const baseUrl = envs.NUBEADMIN_API_URL.replace(/\/+$/, "");
    let loginResponse: Response;
    try {
      loginResponse = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    } catch (_error) {
      throw new NubeadminUnavailableError("NUBEADMIN no disponible");
    }

    if (!loginResponse.ok) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    let syncResponse: Response;
    try {
      syncResponse = await fetch(`${baseUrl}${syncEndpoint}`, {
        headers: {
          Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
          "X-Viggo-Installation-Id": await InstallationIdentityService.getInstallationId(),
        },
      });
    } catch (_error) {
      throw new NubeadminUnavailableError("NUBEADMIN no disponible");
    }
    if (!syncResponse.ok) {
      throw new NubeadminUnavailableError("No se pudo sincronizar el usuario local");
    }

    const data = (await syncResponse.json()) as { user?: Record<string, unknown> };
    const usuario = data.user;
    if (!usuario) {
      throw CustomError.unauthorized("NUBEADMIN no regreso usuario valido");
    }

    return UsuarioEntity.fromObject(usuario);
  }
}

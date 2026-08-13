import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { envs } from "../../../config/plugins/envs.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";

import {
  isRoleAllowedForOperativeWeb,
  isWebOperativeApp,
  type UserModuleAccess,
  type WebOperativeApp,
} from "../../../domain/constants";

import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { CustomError } from "../../../domain/errors/custom.error";

import { AuthRepository } from "../../../domain/repositories/auth/auth.repository";
import { PermissionProfileRepository } from "../../../domain/repositories/auth/permission-profile.repository";

import { InstallationIdentityService } from "../installation/installation-identity.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const ADMINISTRATIVO_SYNC_RETRY_DELAYS_MS = [0, 450];

class AdministrativoUnavailableError extends Error {}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

type ResolvedApplicationPermissions = {
  permissionProfileId: string;
  modules: UserModuleAccess[];
};

type AuthSessionUser = Omit<UsuarioEntity, "password"> &
  ResolvedApplicationPermissions;

type AuthSession = {
  token: string;
  usuario: AuthSessionUser;
};

type RemoteLoginConfig = {
  endpoint: string;
  credentials: Record<string, string>;
  syncEndpoint: string;
};

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,

    private readonly permissionProfileRepository: PermissionProfileRepository,
  ) {}

  async loginCorreo(
    correo: string,
    password: string,
    app: WebOperativeApp,
  ): Promise<AuthSession> {
    const usuario = await this.authRepository.findByCorreo(correo);

    return this.login(usuario, password, app, {
      endpoint: "/api/auth/login-correo",

      credentials: {
        correo,
        password,
        app,
      },

      syncEndpoint:
        `/api/sync/access-user/by-correo/` +
        `${encodeURIComponent(correo)}` +
        `?app=${encodeURIComponent(app)}`,
    });
  }

  async loginTelefono(
    telefono: string,
    password: string,
    app: WebOperativeApp,
  ): Promise<AuthSession> {
    const usuario = await this.authRepository.findByTelefono(telefono);

    return this.login(usuario, password, app, {
      endpoint: "/api/auth/login-telefono",

      credentials: {
        telefono,
        password,
        app,
      },

      syncEndpoint:
        `/api/sync/access-user/by-telefono/` +
        `${encodeURIComponent(telefono)}` +
        `?app=${encodeURIComponent(app)}`,
    });
  }

  async renewToken(id: string, app: WebOperativeApp): Promise<AuthSession> {
    this.ensureWebOperativeApp(app);

    const usuario = await this.authRepository.findById(id);

    if (!usuario) {
      throw CustomError.unauthorized("Usuario no encontrado");
    }

    this.ensureUserCanOperate(usuario, app);

    return this.issueSession(usuario, app);
  }

  async updateBarrierBlasterHighScore(id: string, score: number): Promise<number> {
    const usuario = await this.authRepository.updateBarrierBlasterHighScore(id, score);

    if (!usuario) {
      throw CustomError.unauthorized("Usuario no encontrado");
    }

    return usuario.barrierBlasterHighScore;
  }

  private async login(
    usuario: UsuarioEntity | null,
    password: string,
    app: WebOperativeApp,
    remoteLogin: RemoteLoginConfig,
  ): Promise<AuthSession> {
    this.ensureWebOperativeApp(app);

    try {
      const remoteUsuario = await this.loginAgainstAdministrativo(remoteLogin);

      this.ensureUserCanOperate(remoteUsuario, app);

      const cachedUsuario =
        await this.authRepository.upsertFromAdministrativo(remoteUsuario);

      return this.issueSession(cachedUsuario, app);
    } catch (error: unknown) {
      console.warn(
        "[OPERATIVO auth] Remote login against ADMINISTRATIVO failed:",
        {
          endpoint: remoteLogin.endpoint,

          syncEndpoint: remoteLogin.syncEndpoint,

          reason: error instanceof Error ? error.message : String(error),

          hasLocalUser: Boolean(usuario),

          app,
        },
      );

      if (!(error instanceof AdministrativoUnavailableError)) {
        throw error;
      }
    }

    if (!usuario || !bcryptPlugin.compare(password, usuario.password)) {
      throw CustomError.unauthorized(
        "El servidor central no está disponible y no hay una sesión local válida",
      );
    }

    await this.ensureOfflineLoginAllowed(usuario);

    this.ensureUserCanOperate(usuario, app);

    console.warn("[OPERATIVO auth] Offline login granted", {
      userId: usuario.id,
      app,
      maxAgeDays: envs.OFFLINE_LOGIN_MAX_AGE_DAYS,
      grantedAt: Date.now(),
    });

    return this.issueSession(usuario, app);
  }

  private ensureWebOperativeApp(app: unknown): asserts app is WebOperativeApp {
    if (!isWebOperativeApp(app)) {
      throw CustomError.forbidden(
        "Esta API solo permite el acceso desde el Web Operativo",
      );
    }
  }

  private ensureUserCanOperate(
    usuario: UsuarioEntity,
    app: WebOperativeApp,
  ): void {
    this.ensureWebOperativeApp(app);

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    if (!usuario.emailValidated) {
      throw CustomError.forbidden("La cuenta aún no ha sido validada");
    }

    if (!usuario.allowedApps.includes(app)) {
      throw CustomError.forbidden(
        "El usuario no tiene acceso al Web Operativo",
      );
    }

    if (!isRoleAllowedForOperativeWeb(usuario.rol)) {
      throw CustomError.forbidden(
        "El rol del usuario no permite acceder al Web Operativo",
      );
    }
  }

  private async resolveApplicationPermissions(
    usuario: UsuarioEntity,
    app: WebOperativeApp,
  ): Promise<ResolvedApplicationPermissions> {
    const assignment = usuario.appPermissions.find(
      (permission) => permission.app === app,
    );

    if (!assignment) {
      throw CustomError.forbidden(
        "El usuario no tiene un perfil de permisos asignado para el Web Operativo",
      );
    }

    const profile = await this.permissionProfileRepository.findById(
      assignment.permissionProfileId,
    );

    if (!profile) {
      throw CustomError.forbidden(
        "El perfil de permisos asignado no existe localmente",
      );
    }

    if (profile.app !== app) {
      throw CustomError.forbidden(
        "El perfil asignado no corresponde al Web Operativo",
      );
    }

    if (!profile.estado) {
      throw CustomError.forbidden(
        "El perfil de permisos asignado está inactivo",
      );
    }

    return {
      permissionProfileId: profile.id,

      modules: [...profile.modules],
    };
  }

  private async issueSession(
    usuario: UsuarioEntity,
    app: WebOperativeApp,
  ): Promise<AuthSession> {
    const resolvedPermissions = await this.resolveApplicationPermissions(
      usuario,
      app,
    );

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _password, ...safeUsuario } = usuario;

    return {
      token,

      usuario: {
        ...safeUsuario,

        permissionProfileId: resolvedPermissions.permissionProfileId,

        modules: resolvedPermissions.modules,
      },
    };
  }

  private async ensureOfflineLoginAllowed(
    usuario: UsuarioEntity,
  ): Promise<void> {
    const metadata = await this.authRepository.getSyncMetadataById(usuario.id);

    const lastCloudCheckAt =
      metadata?.lastCloudCheckAt ?? metadata?.lastSyncedAt;

    if (!lastCloudCheckAt) {
      throw CustomError.forbidden(
        "Este usuario aún no tiene una validación reciente",
      );
    }

    const maxAgeMs = envs.OFFLINE_LOGIN_MAX_AGE_DAYS * DAY_MS;

    const ageMs = Date.now() - lastCloudCheckAt;

    if (ageMs > maxAgeMs) {
      throw CustomError.forbidden(
        "La validación local expiró. Conecta con internet para renovar el acceso.",
      );
    }
  }

  private async loginAgainstAdministrativo({
    endpoint,
    credentials,
    syncEndpoint,
  }: RemoteLoginConfig): Promise<UsuarioEntity> {
    const baseUrl = envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "");

    console.log("[OPERATIVO auth] Attempting remote login:", {
      baseUrl,
      endpoint,
      syncEndpoint,
      app: credentials.app,
    });

    let loginResponse: Response;

    try {
      loginResponse = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(credentials),
      });
    } catch {
      console.warn(
        "[OPERATIVO auth] ADMINISTRATIVO login request threw before response",
      );

      throw new AdministrativoUnavailableError("ADMINISTRATIVO no disponible");
    }

    if (!loginResponse.ok) {
      console.warn(
        "[OPERATIVO auth] ADMINISTRATIVO login responded with non-ok status",
        {
          status: loginResponse.status,

          statusText: loginResponse.statusText,
        },
      );

      if (loginResponse.status >= 500) {
        throw new AdministrativoUnavailableError(
          "ADMINISTRATIVO no disponible",
        );
      }

      if (loginResponse.status === 403) {
        throw CustomError.forbidden(
          "El usuario no tiene acceso al Web Operativo",
          undefined,
          "OPERATIVE_APP_FORBIDDEN",
        );
      }

      throw CustomError.unauthorized(
        "Credenciales incorrectas",
        undefined,
        "INVALID_CREDENTIALS",
      );
    }

    const installationId =
      await InstallationIdentityService.getInstallationId();

    console.log(
      "[OPERATIVO auth] Requesting sync snapshot after remote login:",
      {
        syncEndpoint,
        installationId,
      },
    );

    let syncResponse: Response | null = null;

    let lastSyncError: unknown = null;

    for (
      let attempt = 0;
      attempt < ADMINISTRATIVO_SYNC_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
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
      } catch (error: unknown) {
        lastSyncError = error;

        console.warn(
          "[OPERATIVO auth] ADMINISTRATIVO sync request threw before response:",
          {
            reason: error instanceof Error ? error.message : String(error),

            attempt: attempt + 1,
          },
        );
      }
    }

    if (!syncResponse) {
      throw new AdministrativoUnavailableError(
        lastSyncError instanceof Error
          ? lastSyncError.message
          : "ADMINISTRATIVO no disponible",
      );
    }

    if (!syncResponse.ok) {
      console.warn(
        "[OPERATIVO auth] ADMINISTRATIVO sync responded with non-ok status",
        {
          status: syncResponse.status,

          statusText: syncResponse.statusText,
        },
      );

      if (syncResponse.status >= 500) {
        throw new AdministrativoUnavailableError(
          "No se pudo sincronizar el usuario local",
        );
      }

      if (syncResponse.status === 401) {
        throw new CustomError(
          503,
          "La autenticación del servicio de sincronización fue rechazada",
          "SYNC_SERVICE_AUTH_FAILED",
        );
      }

      if (syncResponse.status === 403 || syncResponse.status === 404) {
        throw CustomError.forbidden(
          "El acceso operativo no pudo sincronizarse desde el servidor central",
          { upstreamStatus: syncResponse.status },
          syncResponse.status === 404
            ? "SYNC_ACCESS_NOT_FOUND"
            : "SYNC_ACCESS_FORBIDDEN",
        );
      }

      throw new CustomError(
        502,
        "El servidor central rechazó la sincronización",
        "SYNC_UPSTREAM_REJECTED",
        { upstreamStatus: syncResponse.status },
      );
    }

    const data = (await syncResponse.json()) as {
      user?: Record<string, unknown>;
      permissionProfile?: Record<string, unknown> | null;
    };

    if (!data.user) {
      throw CustomError.unauthorized(
        "El servidor central no regresó un usuario válido",
      );
    }

    if (!data.permissionProfile) {
      throw CustomError.forbidden(
        "El servidor central no regresó el perfil operativo asignado",
      );
    }

    const permissionProfile = PermissionProfileEntity.fromObject(
      data.permissionProfile,
    );

    if (permissionProfile.app !== "OPERATIVE_WEB" || !permissionProfile.estado) {
      throw CustomError.forbidden(
        "El perfil sincronizado no es válido para el Web Operativo",
      );
    }

    await this.permissionProfileRepository.upsert(permissionProfile);

    return UsuarioEntity.fromObject(data.user);
  }
}

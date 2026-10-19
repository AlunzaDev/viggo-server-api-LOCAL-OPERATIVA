import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { createHmac } from "node:crypto";
import { InstallationTokenCryptoService } from "./installation-token-crypto.service";

/** Must match ADMINISTRATIVO (installation-sync-token.util). */
const ADMIN_CALL_TOKEN_LABEL = "viggo:administrativo->operativo";
/** Sent by the cloud on a sync call when an administrator asked for a new token. */
export const SYNC_TOKEN_ROTATION_HEADER = "x-viggo-sync-token-rotation";
import { LocalInstallationService } from "./local-installation.service";

/** What this server needs to call ADMINISTRATIVO's sync API. */
export interface CloudCredentials {
  installationId: string;
  proyectoId: string;
  /** The installation's own sync token, issued by the cloud when the link was approved. */
  token: string;
}

const normalizeInstallationId = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const createGeneratedInstallationId = () =>
  `viggo-local-${randomUUID().replace(/-/g, "").slice(0, 12)}`;

export class InstallationIdentityService {
  private static localInstallationService: LocalInstallationService | null = null;

  static configure(localInstallationService: LocalInstallationService) {
    this.localInstallationService = localInstallationService;
  }

  static async getInstallationId(): Promise<string> {
    if (!this.localInstallationService) {
      throw new Error("InstallationIdentityService no ha sido configurado");
    }

    const envInstallationId = normalizeInstallationId(envs.INSTALLATION_ID);

    const existing = await this.localInstallationService.findDefault();

    if (envInstallationId) {
      if (existing?.installationId !== envInstallationId) {
        await this.localInstallationService.upsertRequest({
          installationId: envInstallationId,
        });
      }
      return envInstallationId;
    }

    const persistedInstallationId = normalizeInstallationId(existing?.installationId);
    if (persistedInstallationId) return persistedInstallationId;

    const generatedInstallationId = createGeneratedInstallationId();
    await this.localInstallationService.upsertRequest({
      installationId: generatedInstallationId,
    });

    return generatedInstallationId;
  }

  /**
   * Credentials of the linked installation, or null while it is not linked (then the
   * cloud cannot be called: there is no shared or global token).
   */
  static async getCloudCredentials(): Promise<CloudCredentials | null> {
    if (!this.localInstallationService) {
      throw new Error("InstallationIdentityService no ha sido configurado");
    }
    const installation = await this.localInstallationService.findDefault();
    const proyectoId = String(installation?.proyectoId ?? "").trim();
    const encrypted = String(installation?.encryptedSyncToken ?? "").trim();
    if (installation?.status !== "linked" || !proyectoId || !encrypted) return null;

    try {
      const token = InstallationTokenCryptoService.decrypt(encrypted);
      return { installationId: await this.getInstallationId(), proyectoId, token };
    } catch (error) {
      console.warn("[OPERATIVO installation] No se pudo descifrar el token de la instalacion:", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Token ADMINISTRATIVO uses to call this server: an HMAC of the installation's own sync
   * token, so each installation has a different one and there is no shared secret.
   */
  static adminCallToken(credentials: Pick<CloudCredentials, "token">) {
    return createHmac("sha256", credentials.token).update(ADMIN_CALL_TOKEN_LABEL).digest("base64url");
  }

  private static rotation: Promise<boolean> | null = null;

  /**
   * Looks at a response from the cloud: when it asks for a new token, gets one (once, even if
   * several calls see the header at the same time).
   */
  static handleCloudResponse(response: Response | undefined) {
    if (response?.headers.get(SYNC_TOKEN_ROTATION_HEADER) !== "required") return;
    void this.rotateSyncToken();
  }

  /**
   * Asks the cloud for a new sync token and stores it. The current token keeps working in
   * the cloud until the new one is used, so a failure here is simply retried later.
   */
  static rotateSyncToken(): Promise<boolean> {
    this.rotation ??= (async () => {
      try {
        const credentials = await this.getCloudCredentials();
        if (!credentials || !this.localInstallationService) return false;
        const response = await fetch(
          `${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}/api/sync/sync-token/rotate`,
          { method: "POST", headers: this.cloudHeaders(credentials) },
        );
        const data = (await response.json().catch(() => ({}))) as { syncToken?: unknown };
        if (!response.ok || typeof data.syncToken !== "string" || !data.syncToken) {
          console.warn("[OPERATIVO installation] No se pudo rotar el token de la nube", { status: response.status });
          return false;
        }
        await this.localInstallationService.upsertRequest({
          encryptedSyncToken: InstallationTokenCryptoService.encrypt(data.syncToken),
          syncTokenRotatedAt: Date.now(),
        });
        console.info("[OPERATIVO installation] Token de la nube rotado");
        return true;
      } catch (error) {
        console.warn("[OPERATIVO installation] No se pudo rotar el token de la nube", {
          reason: error instanceof Error ? error.message : String(error),
        });
        return false;
      } finally {
        this.rotation = null;
      }
    })();
    return this.rotation;
  }

  static cloudHeaders(credentials: Pick<CloudCredentials, "installationId" | "token">) {
    return {
      Authorization: `Bearer ${credentials.token}`,
      "X-Viggo-Installation-Id": credentials.installationId,
      "Content-Type": "application/json",
    };
  }
}

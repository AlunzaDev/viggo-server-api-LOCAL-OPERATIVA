import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { InstallationTokenCryptoService } from "./installation-token-crypto.service";
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

  static cloudHeaders(credentials: Pick<CloudCredentials, "installationId" | "token">) {
    return {
      Authorization: `Bearer ${credentials.token}`,
      "X-Viggo-Installation-Id": credentials.installationId,
      "Content-Type": "application/json",
    };
  }
}

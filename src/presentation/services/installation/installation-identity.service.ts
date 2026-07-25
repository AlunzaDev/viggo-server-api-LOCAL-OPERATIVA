import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { LocalInstallationService } from "./local-installation.service";

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
}

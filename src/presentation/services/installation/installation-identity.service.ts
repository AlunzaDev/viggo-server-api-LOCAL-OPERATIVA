import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { LocalInstallationModel } from "../../../data/mongo/models/system/local-installation.schema";

const DEFAULT_INSTALLATION_KEY = "default";

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
  static async getInstallationId(): Promise<string> {
    const envInstallationId = normalizeInstallationId(envs.INSTALLATION_ID);

    const existing = await LocalInstallationModel.findOne({
      key: DEFAULT_INSTALLATION_KEY,
    }).lean();

    if (envInstallationId) {
      if (existing?.installationId !== envInstallationId) {
        await LocalInstallationModel.findOneAndUpdate(
          { key: DEFAULT_INSTALLATION_KEY },
          {
            key: DEFAULT_INSTALLATION_KEY,
            installationId: envInstallationId,
            updatedAt: Date.now(),
          },
          { upsert: true, setDefaultsOnInsert: true },
        );
      }
      return envInstallationId;
    }

    const persistedInstallationId = normalizeInstallationId(existing?.installationId);
    if (persistedInstallationId) return persistedInstallationId;

    const generatedInstallationId = createGeneratedInstallationId();
    await LocalInstallationModel.findOneAndUpdate(
      { key: DEFAULT_INSTALLATION_KEY },
      {
        key: DEFAULT_INSTALLATION_KEY,
        installationId: generatedInstallationId,
        updatedAt: Date.now(),
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    return generatedInstallationId;
  }
}

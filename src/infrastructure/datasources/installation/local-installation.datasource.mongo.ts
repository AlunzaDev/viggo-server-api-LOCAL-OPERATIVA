import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { LocalInstallationModel } from "../../../data/mongo/models/system/local-installation.schema";
import {
  LocalInstallationDatasource,
  type LinkLocalProjectPayload,
  type LocalInstallationSyncStatePayload,
} from "../../../domain/datasources/installation/local-installation.datasource";

const DEFAULT_INSTALLATION_KEY = "default";

export class LocalInstallationMongoDatasource implements LocalInstallationDatasource {
  findDefault() {
    return LocalInstallationModel.findOne({ key: DEFAULT_INSTALLATION_KEY }).lean();
  }

  upsertRequest(payload: Record<string, unknown>) {
    return LocalInstallationModel.findOneAndUpdate(
      { key: DEFAULT_INSTALLATION_KEY },
      { key: DEFAULT_INSTALLATION_KEY, ...payload, updatedAt: Date.now() },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  }

  upsertProject(id: string, payload: Record<string, unknown>) {
    return ProyectoModel.findByIdAndUpdate(id, payload, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
  }

  findProjectById(id: string) {
    return ProyectoModel.findById(id).lean();
  }

  linkProject(payload: LinkLocalProjectPayload) {
    return LocalInstallationModel.findOneAndUpdate(
      { key: DEFAULT_INSTALLATION_KEY },
      {
        key: DEFAULT_INSTALLATION_KEY,
        proyectoId: payload.proyectoId,
        proyectoNombre: payload.proyectoNombre,
        proyectoIdentificador: payload.proyectoIdentificador,
        source: payload.source,
        status: "linked",
        cloudRequestId: payload.cloudRequestId,
        ...(payload.encryptedSyncToken
          ? {
              encryptedSyncToken: payload.encryptedSyncToken,
              syncTokenIssuedAt: Date.now(),
              syncTokenRotatedAt: Date.now(),
            }
          : {}),
        assignedAt: Date.now(),
        updatedAt: Date.now(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  }

  updateSyncState(payload: LocalInstallationSyncStatePayload) {
    return LocalInstallationModel.findOneAndUpdate(
      { key: DEFAULT_INSTALLATION_KEY },
      {
        key: DEFAULT_INSTALLATION_KEY,
        lastConfigurationVersion: payload.lastConfigurationVersion ?? undefined,
        lastAccessVersion: payload.lastAccessVersion ?? undefined,
        lastSyncAt: payload.lastSyncAt,
        lastSyncStatus: payload.lastSyncStatus,
        lastSyncError: payload.lastSyncError ?? "",
        updatedAt: Date.now(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  }
}

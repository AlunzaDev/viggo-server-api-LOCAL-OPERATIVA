import type {
  LinkLocalProjectPayload,
  LocalInstallationSyncStatePayload,
  LocalInstallationDatasource,
} from "../../../domain/datasources/installation/local-installation.datasource";
import { LocalInstallationRepository } from "../../../domain/repository/installation/local-installation.repository";

export class LocalInstallationRepositoryImpl implements LocalInstallationRepository {
  constructor(private readonly datasource: LocalInstallationDatasource) {}

  findDefault() {
    return this.datasource.findDefault();
  }

  upsertRequest(payload: Record<string, unknown>) {
    return this.datasource.upsertRequest(payload);
  }

  upsertProject(id: string, payload: Record<string, unknown>) {
    return this.datasource.upsertProject(id, payload);
  }

  findProjectById(id: string) {
    return this.datasource.findProjectById(id);
  }

  linkProject(payload: LinkLocalProjectPayload) {
    return this.datasource.linkProject(payload);
  }

  updateSyncState(payload: LocalInstallationSyncStatePayload) {
    return this.datasource.updateSyncState(payload);
  }
}

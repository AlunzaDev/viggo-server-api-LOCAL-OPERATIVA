import type {
  LinkLocalProjectPayload,
  LocalInstallationSyncStatePayload,
} from "../../../domain/datasources/installation/local-installation.datasource";
import { LocalInstallationRepository } from "../../../domain/repositories/installation/local-installation.repository";

export class LocalInstallationService {
  constructor(private readonly repository: LocalInstallationRepository) {}

  findDefault() {
    return this.repository.findDefault();
  }

  upsertRequest(payload: Record<string, unknown>) {
    return this.repository.upsertRequest(payload);
  }

  upsertProject(id: string, payload: Record<string, unknown>) {
    return this.repository.upsertProject(id, payload);
  }

  findProjectById(id: string) {
    return this.repository.findProjectById(id);
  }

  linkProject(payload: LinkLocalProjectPayload) {
    return this.repository.linkProject(payload);
  }

  updateSyncState(payload: LocalInstallationSyncStatePayload) {
    return this.repository.updateSyncState(payload);
  }
}

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

  /**
   * Back to "not linked" so it can be linked again (to the same or another project). The
   * installation id is kept; the project and the cloud token are dropped. Local data of the
   * previous project (tickets, payments, cash) stays as history.
   */
  resetLink() {
    return this.repository.upsertRequest({
      status: "pending",
      source: "manual",
      proyectoId: "",
      proyectoNombre: "",
      proyectoIdentificador: "",
      cloudRequestId: "",
      encryptedSyncToken: "",
      reviewNote: "",
      assignedByUserId: "",
      requestedAt: 0,
      reviewedAt: 0,
      assignedAt: 0,
      syncTokenIssuedAt: 0,
      syncTokenRotatedAt: 0,
      lastSyncAt: 0,
      lastSyncStatus: "",
      lastSyncError: "",
      lastConfigurationVersion: null,
      lastAccessVersion: null,
    });
  }

  updateSyncState(payload: LocalInstallationSyncStatePayload) {
    return this.repository.updateSyncState(payload);
  }
}

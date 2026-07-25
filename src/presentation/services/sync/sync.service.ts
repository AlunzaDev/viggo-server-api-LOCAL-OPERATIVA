import type { SnapshotItem } from "../../../domain/datasources/sync/sync.datasource";
import { SyncRepository } from "../../../domain/repository/sync/sync.repository";

export class SyncService {
  constructor(private readonly repository: SyncRepository) {}

  applyAccessSnapshot(payload: {
    users: SnapshotItem[];
    permissionProfiles: SnapshotItem[];
  }) {
    return this.repository.applyAccessSnapshot(payload);
  }

  applyConfigurationSnapshot(payload: {
    proyecto?: SnapshotItem | null;
    modulos: SnapshotItem[];
    pensiones: SnapshotItem[];
    pensionPasses: SnapshotItem[];
  }) {
    return this.repository.applyConfigurationSnapshot(payload);
  }
}

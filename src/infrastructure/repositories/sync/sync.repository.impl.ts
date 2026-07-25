import type {
  AccessSnapshotPayload,
  ConfigurationSnapshotPayload,
  SyncDatasource,
} from "../../../domain/datasources/sync/sync.datasource";
import { SyncRepository } from "../../../domain/repository/sync/sync.repository";

export class SyncRepositoryImpl implements SyncRepository {
  constructor(private readonly datasource: SyncDatasource) {}

  applyAccessSnapshot(payload: AccessSnapshotPayload) {
    return this.datasource.applyAccessSnapshot(payload);
  }

  applyConfigurationSnapshot(payload: ConfigurationSnapshotPayload) {
    return this.datasource.applyConfigurationSnapshot(payload);
  }
}

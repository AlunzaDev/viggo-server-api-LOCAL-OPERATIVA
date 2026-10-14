import type {
  AccessSnapshotPayload,
  ConfigurationSnapshotPayload,
  SyncDatasource,
} from "../../../domain/datasources/sync/sync.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { SyncRepository } from "../../../domain/repositories/sync/sync.repository";

export class SyncRepositoryImpl implements SyncRepository {
  constructor(private readonly datasource: SyncDatasource) {}

  applyAccessSnapshot(payload: AccessSnapshotPayload, tx?: TransactionContext) {
    return this.datasource.applyAccessSnapshot(payload, tx);
  }

  applyConfigurationSnapshot(payload: ConfigurationSnapshotPayload, tx?: TransactionContext) {
    return this.datasource.applyConfigurationSnapshot(payload, tx);
  }
}

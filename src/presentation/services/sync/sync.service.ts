import type {
  AccessSnapshotPayload,
  ConfigurationSnapshotPayload,
} from "../../../domain/datasources/sync/sync.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { SyncRepository } from "../../../domain/repositories/sync/sync.repository";

export class SyncService {
  constructor(private readonly repository: SyncRepository) {}

  applyAccessSnapshot(payload: AccessSnapshotPayload, tx?: TransactionContext) {
    return this.repository.applyAccessSnapshot(payload, tx);
  }

  applyConfigurationSnapshot(payload: ConfigurationSnapshotPayload, tx?: TransactionContext) {
    return this.repository.applyConfigurationSnapshot(payload, tx);
  }
}

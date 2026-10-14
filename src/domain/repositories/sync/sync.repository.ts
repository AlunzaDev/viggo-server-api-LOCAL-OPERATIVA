import type {
  AccessSnapshotPayload,
  AccessSnapshotResult,
  ConfigurationSnapshotPayload,
  ConfigurationSnapshotResult,
} from "../../datasources/sync/sync.datasource";
import type { TransactionContext } from "../../datasources/system/transaction";

export abstract class SyncRepository {
  abstract applyAccessSnapshot(payload: AccessSnapshotPayload, tx?: TransactionContext): Promise<AccessSnapshotResult>;
  abstract applyConfigurationSnapshot(
    payload: ConfigurationSnapshotPayload,
    tx?: TransactionContext,
  ): Promise<ConfigurationSnapshotResult>;
}

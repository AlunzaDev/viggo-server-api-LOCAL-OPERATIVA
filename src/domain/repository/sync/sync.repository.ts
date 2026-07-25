import type {
  AccessSnapshotPayload,
  ConfigurationSnapshotPayload,
} from "../../datasources/sync/sync.datasource";

export abstract class SyncRepository {
  abstract applyAccessSnapshot(payload: AccessSnapshotPayload): Promise<any>;
  abstract applyConfigurationSnapshot(payload: ConfigurationSnapshotPayload): Promise<any>;
}

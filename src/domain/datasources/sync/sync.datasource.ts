export type SnapshotItem = Record<string, unknown> & {
  id?: unknown;
  _id?: unknown;
};

export type AccessSnapshotPayload = {
  users: SnapshotItem[];
  permissionProfiles: SnapshotItem[];
};

export type ConfigurationSnapshotPayload = {
  proyecto?: SnapshotItem | null;
  modulos: SnapshotItem[];
  pensiones: SnapshotItem[];
  pensionPasses: SnapshotItem[];
};

export abstract class SyncDatasource {
  abstract applyAccessSnapshot(payload: AccessSnapshotPayload): Promise<any>;
  abstract applyConfigurationSnapshot(payload: ConfigurationSnapshotPayload): Promise<any>;
}

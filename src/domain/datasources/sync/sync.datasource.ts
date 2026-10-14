import type { TransactionContext } from "../system/transaction";

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

/** What happened to the items of one collection of a snapshot. */
export type SnapshotApplySummary = {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
};

export type AccessSnapshotResult = {
  users: number;
  permissionProfiles: number;
  details: {
    users: SnapshotApplySummary;
    permissionProfiles: SnapshotApplySummary;
  };
};

export type ConfigurationSnapshotResult = {
  proyecto: number;
  modulos: number;
  pensiones: number;
  pensionPasses: number;
  details: {
    proyecto: SnapshotApplySummary;
    modulos: SnapshotApplySummary;
    pensiones: SnapshotApplySummary;
    pensionPasses: SnapshotApplySummary;
  };
};

/**
 * Applies the snapshots ADMINISTRATIVO sends: upserts the projections, never deletes them
 * and never overwrites the state this server owns (device state, pass inParking, high scores).
 * With `tx` the writes join that transaction; without it each snapshot is atomic on its own.
 */
export abstract class SyncDatasource {
  abstract applyAccessSnapshot(payload: AccessSnapshotPayload, tx?: TransactionContext): Promise<AccessSnapshotResult>;
  abstract applyConfigurationSnapshot(
    payload: ConfigurationSnapshotPayload,
    tx?: TransactionContext,
  ): Promise<ConfigurationSnapshotResult>;
}

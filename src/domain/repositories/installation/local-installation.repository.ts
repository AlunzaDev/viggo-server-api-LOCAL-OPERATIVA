import type {
  LinkLocalProjectPayload,
  LocalInstallationSyncStatePayload,
} from "../../datasources/installation/local-installation.datasource";

export abstract class LocalInstallationRepository {
  abstract findDefault(): Promise<any>;
  abstract upsertRequest(payload: Record<string, unknown>): Promise<any>;
  abstract upsertProject(id: string, payload: Record<string, unknown>): Promise<any>;
  abstract findProjectById(id: string): Promise<any>;
  abstract linkProject(payload: LinkLocalProjectPayload): Promise<any>;
  abstract updateSyncState(payload: LocalInstallationSyncStatePayload): Promise<any>;
}

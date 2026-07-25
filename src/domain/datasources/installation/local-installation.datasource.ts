export type LinkLocalProjectPayload = {
  proyectoId: string;
  proyectoNombre: string;
  proyectoIdentificador: string;
  source: "env" | "cloudApproval";
  cloudRequestId: string;
  encryptedSyncToken?: string;
};

export type LocalInstallationSyncStatePayload = {
  lastConfigurationVersion?: number | null;
  lastAccessVersion?: number | null;
  lastSyncAt: number;
  lastSyncStatus: "success" | "success_with_warnings" | "failed";
  lastSyncError?: string;
};

export abstract class LocalInstallationDatasource {
  abstract findDefault(): Promise<any>;
  abstract upsertRequest(payload: Record<string, unknown>): Promise<any>;
  abstract upsertProject(id: string, payload: Record<string, unknown>): Promise<any>;
  abstract findProjectById(id: string): Promise<any>;
  abstract linkProject(payload: LinkLocalProjectPayload): Promise<any>;
  abstract updateSyncState(payload: LocalInstallationSyncStatePayload): Promise<any>;
}

import type {
  ConfigIntegritySnapshot,
  ConfigSyncAuditInput,
} from "../../datasources/config/config-sync.datasource";

export abstract class ConfigSyncRepository {
  abstract getIntegritySnapshot(proyectoId: string): Promise<ConfigIntegritySnapshot>;
  abstract findExistingPermissionProfileIds(ids: string[], app: string): Promise<string[]>;
  abstract recordAudit(audit: ConfigSyncAuditInput): Promise<void>;
  abstract getAuditHistory(limit: number): Promise<Record<string, unknown>[]>;
}

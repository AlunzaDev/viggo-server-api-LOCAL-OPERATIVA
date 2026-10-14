import type {
  ConfigIntegritySnapshot,
  ConfigSyncAuditInput,
} from "../../datasources/config/config-sync.datasource";
import type { TransactionContext } from "../../datasources/system/transaction";

export abstract class ConfigSyncRepository {
  abstract getIntegritySnapshot(proyectoId: string, tx?: TransactionContext): Promise<ConfigIntegritySnapshot>;
  abstract findExistingPermissionProfileIds(ids: string[], app: string, tx?: TransactionContext): Promise<string[]>;
  abstract recordAudit(audit: ConfigSyncAuditInput): Promise<void>;
  abstract getAuditHistory(limit: number): Promise<Record<string, unknown>[]>;
}

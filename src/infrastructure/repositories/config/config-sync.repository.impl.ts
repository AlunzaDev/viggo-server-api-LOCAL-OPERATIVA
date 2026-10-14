import type {
  ConfigSyncAuditInput,
  ConfigSyncDatasource,
} from "../../../domain/datasources/config/config-sync.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { ConfigSyncRepository } from "../../../domain/repositories/config/config-sync.repository";

export class ConfigSyncRepositoryImpl implements ConfigSyncRepository {
  constructor(private readonly datasource: ConfigSyncDatasource) {}

  getIntegritySnapshot(proyectoId: string, tx?: TransactionContext) {
    return this.datasource.getIntegritySnapshot(proyectoId, tx);
  }

  findExistingPermissionProfileIds(ids: string[], app: string, tx?: TransactionContext) {
    return this.datasource.findExistingPermissionProfileIds(ids, app, tx);
  }

  recordAudit(audit: ConfigSyncAuditInput) {
    return this.datasource.recordAudit(audit);
  }

  getAuditHistory(limit: number) {
    return this.datasource.getAuditHistory(limit);
  }
}

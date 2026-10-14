import type {
  ConfigSyncAuditInput,
  ConfigSyncDatasource,
} from "../../../domain/datasources/config/config-sync.datasource";
import { ConfigSyncRepository } from "../../../domain/repositories/config/config-sync.repository";

export class ConfigSyncRepositoryImpl implements ConfigSyncRepository {
  constructor(private readonly datasource: ConfigSyncDatasource) {}

  getIntegritySnapshot(proyectoId: string) {
    return this.datasource.getIntegritySnapshot(proyectoId);
  }

  findExistingPermissionProfileIds(ids: string[], app: string) {
    return this.datasource.findExistingPermissionProfileIds(ids, app);
  }

  recordAudit(audit: ConfigSyncAuditInput) {
    return this.datasource.recordAudit(audit);
  }

  getAuditHistory(limit: number) {
    return this.datasource.getAuditHistory(limit);
  }
}

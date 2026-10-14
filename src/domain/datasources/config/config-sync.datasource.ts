import type { TransactionContext } from "../system/transaction";

export type ConfigSyncStatus = "success" | "success_with_warnings" | "failed";

/** Local copy of the configuration synced from ADMINISTRATIVO, as needed to check its integrity. */
export interface ConfigIntegritySnapshot {
  proyectoExists: boolean;
  modulos: {
    id: string;
    tipo: string;
    identificador: string;
    submodulos: { submoduloId?: string; tipo: string; nombre: string }[];
  }[];
  pensiones: { id: string; validezDays: number }[];
  pensionPasses: { id: string; pensionId: string }[];
  /** Users with access to the project (or SUPER_ROLE) and their OPERATIVE_WEB profile, if any. */
  usuarios: { id: string; operativeProfileId: string }[];
}

export interface ConfigSyncAuditInput {
  installationId: string;
  proyectoId: string;
  proyectoNombre: string;
  triggeredByUserId: string;
  triggeredByUserName: string;
  triggerSource: "manual" | "automatic" | "system";
  status: ConfigSyncStatus;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  configurationVersion: number | null;
  accessVersion: number | null;
  counts: Record<string, number>;
  errorMessage: string;
  errorCode: string;
  metadata: Record<string, unknown>;
}

export abstract class ConfigSyncDatasource {
  /** With `tx`, reads inside that transaction (sees the snapshot being applied). */
  abstract getIntegritySnapshot(proyectoId: string, tx?: TransactionContext): Promise<ConfigIntegritySnapshot>;
  /** Which of the given ids exist as permission profiles of the app. */
  abstract findExistingPermissionProfileIds(ids: string[], app: string, tx?: TransactionContext): Promise<string[]>;
  abstract recordAudit(audit: ConfigSyncAuditInput): Promise<void>;
  /** Most recent audits first. */
  abstract getAuditHistory(limit: number): Promise<Record<string, unknown>[]>;
}

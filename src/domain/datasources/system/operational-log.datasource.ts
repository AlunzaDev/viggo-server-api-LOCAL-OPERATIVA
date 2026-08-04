import {
  OperationalLogEntity,
  type OperationalLogKind,
  type OperationalLogScope,
  type OperationalLogSeverity,
} from "../../entities/system/operational-log.entity";

export interface OperationalLogListQuery {
  page: number;
  limit: number;
  kind?: OperationalLogKind;
  scope?: OperationalLogScope;
  severity?: OperationalLogSeverity;
  projectId?: string;
  projectIds?: string[];
  moduloId?: string;
  ticketId?: string;
  type?: string;
  search?: string;
  from?: number;
  to?: number;
}

export interface OperationalLogListResult {
  logs: OperationalLogEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

export abstract class OperationalLogDatasource {
  abstract create(
    log: Omit<OperationalLogEntity, "id">,
  ): Promise<OperationalLogEntity>;

  abstract list(
    query: OperationalLogListQuery,
  ): Promise<OperationalLogListResult>;

  abstract listByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<OperationalLogEntity[]>;

  abstract deleteByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<number>;
}

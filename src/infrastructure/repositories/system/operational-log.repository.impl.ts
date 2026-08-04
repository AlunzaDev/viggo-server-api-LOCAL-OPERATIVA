import {
  type OperationalLogListQuery,
  type OperationalLogListResult,
  OperationalLogDatasource,
} from "../../../domain/datasources/system/operational-log.datasource";
import { OperationalLogEntity } from "../../../domain/entities/system/operational-log.entity";
import { OperationalLogRepository } from "../../../domain/repository/system/operational-log.repository";

export class OperationalLogRepositoryImpl implements OperationalLogRepository {
  constructor(private readonly datasource: OperationalLogDatasource) {}

  create(log: Omit<OperationalLogEntity, "id">): Promise<OperationalLogEntity> {
    return this.datasource.create(log);
  }

  list(query: OperationalLogListQuery): Promise<OperationalLogListResult> {
    return this.datasource.list(query);
  }

  listByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<OperationalLogEntity[]> {
    return this.datasource.listByCreatedAtRange(range);
  }

  deleteByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<number> {
    return this.datasource.deleteByCreatedAtRange(range);
  }
}

import {
  type OperationalLogListQuery,
  type OperationalLogListResult,
  OperationalLogDatasource,
} from "../../datasources/system/operational-log.datasource";
import { OperationalLogEntity } from "../../entities/system/operational-log.entity";

export abstract class OperationalLogRepository extends OperationalLogDatasource {
  abstract override create(
    log: Omit<OperationalLogEntity, "id">,
  ): Promise<OperationalLogEntity>;

  abstract override list(
    query: OperationalLogListQuery,
  ): Promise<OperationalLogListResult>;

  abstract override listByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<OperationalLogEntity[]>;

  abstract override deleteByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<number>;
}

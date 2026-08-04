import { OperationalLogMongoDatasource } from "../../infrastructure/datasources/system/operational-log.datasource.mongo";
import { MonthlyFlushMongoDatasource } from "../../infrastructure/datasources/system/monthly-flush.datasource.mongo";
import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { OperationalLogRepositoryImpl } from "../../infrastructure/repositories/system/operational-log.repository.impl";
import { MonthlyFlushRepositoryImpl } from "../../infrastructure/repositories/system/monthly-flush.repository.impl";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { OperationalLogsController } from "../routes/operational-logs/operational-logs.controller";
import { OperationalLogsService } from "../services/operational-logs/operational-logs.service";

let cachedOperationalLogsService: OperationalLogsService | null = null;

export const buildOperationalLogsService = (): OperationalLogsService => {
  if (cachedOperationalLogsService) {
    return cachedOperationalLogsService;
  }

  cachedOperationalLogsService = new OperationalLogsService(
    new OperationalLogRepositoryImpl(new OperationalLogMongoDatasource()),
    new MonthlyFlushRepositoryImpl(new MonthlyFlushMongoDatasource()),
    new ModuloRepositoryImpl(new ModuloMongoDatasource()),
    new ProyectoRepositoryImpl(new ProyectoMongoDatasource()),
  );

  return cachedOperationalLogsService;
};

export const buildOperationalLogsController = (): OperationalLogsController =>
  new OperationalLogsController(buildOperationalLogsService());

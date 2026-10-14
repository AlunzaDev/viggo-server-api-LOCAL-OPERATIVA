import { buildModuloRepository, buildMonthlyFlushRepository, buildOperationalLogRepository, buildProyectoRepository } from "./repositories.dependencies";
import { OperationalLogsController } from "../routes/operational-logs/operational-logs.controller";
import { OperationalLogsService } from "../services/operational-logs/operational-logs.service";

let cachedOperationalLogsService: OperationalLogsService | null = null;

export const buildOperationalLogsService = (): OperationalLogsService => {
  if (cachedOperationalLogsService) {
    return cachedOperationalLogsService;
  }

  cachedOperationalLogsService = new OperationalLogsService(
    buildOperationalLogRepository(),
    buildMonthlyFlushRepository(),
    buildModuloRepository(),
    buildProyectoRepository(),
  );

  return cachedOperationalLogsService;
};

export const buildOperationalLogsController = (): OperationalLogsController =>
  new OperationalLogsController(buildOperationalLogsService());

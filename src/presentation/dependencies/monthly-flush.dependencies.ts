import { MonthlyFlushMongoDatasource } from "../../infrastructure/datasources/system/monthly-flush.datasource.mongo";
import { OperationalLogMongoDatasource } from "../../infrastructure/datasources/system/operational-log.datasource.mongo";
import { MonthlyFlushRepositoryImpl } from "../../infrastructure/repositories/system/monthly-flush.repository.impl";
import { OperationalLogRepositoryImpl } from "../../infrastructure/repositories/system/operational-log.repository.impl";
import { MonthlyFlushController } from "../routes/monthly-flush/monthly-flush.controller";
import { MonthlyFlushAdminService } from "../services/monthly-flush/monthly-flush-admin.service";
import { MonthlyFlushSchedulerService } from "../services/monthly-flush/monthly-flush-scheduler.service";

let cachedMonthlyFlushAdminService: MonthlyFlushAdminService | null = null;
let cachedMonthlyFlushScheduler: MonthlyFlushSchedulerService | null = null;

export const buildMonthlyFlushAdminService = () => {
  if (cachedMonthlyFlushAdminService) {
    return cachedMonthlyFlushAdminService;
  }

  cachedMonthlyFlushAdminService = new MonthlyFlushAdminService(
    new MonthlyFlushRepositoryImpl(new MonthlyFlushMongoDatasource()),
    new OperationalLogRepositoryImpl(new OperationalLogMongoDatasource()),
  );
  return cachedMonthlyFlushAdminService;
};

export const buildMonthlyFlushController = () =>
  new MonthlyFlushController(
    buildMonthlyFlushAdminService(),
    buildMonthlyFlushScheduler(),
  );

export const buildMonthlyFlushScheduler = () => {
  if (cachedMonthlyFlushScheduler) {
    return cachedMonthlyFlushScheduler;
  }

  cachedMonthlyFlushScheduler = new MonthlyFlushSchedulerService(
    buildMonthlyFlushAdminService(),
  );
  return cachedMonthlyFlushScheduler;
};

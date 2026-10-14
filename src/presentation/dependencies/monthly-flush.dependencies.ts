import { buildMonthlyFlushRepository, buildOperationalLogRepository } from "./repositories.dependencies";
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
    buildMonthlyFlushRepository(),
    buildOperationalLogRepository(),
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

import { buildLocalReportsRepository } from "./repositories.dependencies";
import { LocalReportsController } from "../routes/local-reports/local-reports.controller";
import { LocalReportsService } from "../services/local-reports/local-reports.service";
import { buildModuloService } from "./parking.dependencies";

export const buildLocalReportsController = (): LocalReportsController => {
  const repository = buildLocalReportsRepository();
  return new LocalReportsController(
    new LocalReportsService(repository, buildModuloService()),
  );
};

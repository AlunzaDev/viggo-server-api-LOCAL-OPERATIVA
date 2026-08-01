import { LocalReportsMongoDatasource } from "../../infrastructure/datasources/local-reports/local-reports.datasource.mongo";
import { LocalReportsRepositoryImpl } from "../../infrastructure/repositories/local-reports/local-reports.repository.impl";
import { LocalReportsController } from "../routes/local-reports/local-reports.controller";
import { LocalReportsService } from "../services/local-reports/local-reports.service";
import { buildModuloService } from "./parking.dependencies";

export const buildLocalReportsController = (): LocalReportsController => {
  const repository = new LocalReportsRepositoryImpl(
    new LocalReportsMongoDatasource(),
  );
  return new LocalReportsController(
    new LocalReportsService(repository, buildModuloService()),
  );
};

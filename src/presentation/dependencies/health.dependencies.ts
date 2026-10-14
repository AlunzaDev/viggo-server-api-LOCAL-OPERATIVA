import { HealthMongoDatasource } from "../../infrastructure/datasources/system/health.datasource.mongo";
import { HealthRepositoryImpl } from "../../infrastructure/repositories/system/health.repository.impl";
import { HealthController } from "../routes/health/health.controller";
import { buildLocalInstallationService } from "./installation.dependencies";

export const buildHealthController = (): HealthController =>
  new HealthController(
    new HealthRepositoryImpl(new HealthMongoDatasource()),
    buildLocalInstallationService(),
  );

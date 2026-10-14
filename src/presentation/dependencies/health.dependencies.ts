import { buildHealthRepository } from "./repositories.dependencies";
import { HealthController } from "../routes/health/health.controller";
import { buildLocalInstallationService } from "./installation.dependencies";

export const buildHealthController = (): HealthController =>
  new HealthController(
    buildHealthRepository(),
    buildLocalInstallationService(),
  );

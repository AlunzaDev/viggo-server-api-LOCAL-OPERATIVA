import { buildMobileCommandRepository, buildTransactionRunner } from "./repositories.dependencies";
import { MobileCommandScheduler } from "../services/mobile/mobile-command.scheduler";
import { MobileCommandService } from "../services/mobile/mobile-command.service";
import { buildLocalInstallationService } from "./installation.dependencies";

export const buildMobileCommandScheduler = () => {
  return new MobileCommandScheduler(
    new MobileCommandService(
      buildLocalInstallationService(),
      buildMobileCommandRepository(),
      buildTransactionRunner(),
    ),
  );
};

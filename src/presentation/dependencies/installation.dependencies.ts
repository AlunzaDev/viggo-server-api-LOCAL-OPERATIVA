import { buildLocalInstallationRepository } from "./repositories.dependencies";
import { InstallationController } from "../routes/installation/installation.controller";
import { InstallationServiceFactory } from "../services/installation/installation-service.factory";
import { LocalInstallationService } from "../services/installation/local-installation.service";

export const buildLocalInstallationService = (): LocalInstallationService =>
  new LocalInstallationService(buildLocalInstallationRepository());

export const buildInstallationController = (): InstallationController => {
  return new InstallationController(
    InstallationServiceFactory.create(buildLocalInstallationRepository()),
  );
};

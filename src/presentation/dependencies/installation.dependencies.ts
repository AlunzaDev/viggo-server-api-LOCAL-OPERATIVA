import { buildLocalInstallationRepository, buildOutboxRepository } from "./repositories.dependencies";
import { InstallationController } from "../routes/installation/installation.controller";
import { InstallationServiceFactory } from "../services/installation/installation-service.factory";
import { LocalInstallationService } from "../services/installation/local-installation.service";
import { InstallationLinkService } from "../services/installation/installation-link.service";

export const buildLocalInstallationService = (): LocalInstallationService =>
  new LocalInstallationService(buildLocalInstallationRepository());

/** `onCloudLinked` runs once the cloud approved the link (e.g. to sync the configuration). */
export const buildInstallationController = (onCloudLinked?: () => void): InstallationController => {
  return new InstallationController(new InstallationLinkService(
    InstallationServiceFactory.create(buildLocalInstallationRepository()),
    buildOutboxRepository(),
    onCloudLinked,
  ));
};

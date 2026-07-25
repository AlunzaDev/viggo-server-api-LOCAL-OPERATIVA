import { LocalInstallationRepository } from "../../../domain/repository/installation/local-installation.repository";
import { InstallationIdentityService } from "./installation-identity.service";
import { LocalInstallationService } from "./local-installation.service";

export type InstallationServices = {
  localInstallationService: LocalInstallationService;
};

export class InstallationServiceFactory {
  static create(
    localInstallationRepository: LocalInstallationRepository,
  ): InstallationServices {
    const localInstallationService = new LocalInstallationService(
      localInstallationRepository,
    );
    InstallationIdentityService.configure(localInstallationService);

    return {
      localInstallationService,
    };
  }
}

import { LocalInstallationMongoDatasource } from "../../infrastructure/datasources/installation/local-installation.datasource.mongo";
import { LocalInstallationRepositoryImpl } from "../../infrastructure/repositories/installation/local-installation.repository.impl";
import { LocalInstallationService } from "../services/installation/local-installation.service";
import { MobileCommandScheduler } from "../services/mobile/mobile-command.scheduler";
import { MobileCommandService } from "../services/mobile/mobile-command.service";

export const buildMobileCommandScheduler = () => {
  const installations = new LocalInstallationService(
    new LocalInstallationRepositoryImpl(new LocalInstallationMongoDatasource()),
  );
  return new MobileCommandScheduler(new MobileCommandService(installations));
};

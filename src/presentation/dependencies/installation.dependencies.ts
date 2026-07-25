import { LocalInstallationMongoDatasource } from "../../infrastructure/datasources/installation/local-installation.datasource.mongo";
import { LocalInstallationRepositoryImpl } from "../../infrastructure/repositories/installation/local-installation.repository.impl";
import { InstallationController } from "../routes/installation/installation.controller";
import { InstallationServiceFactory } from "../services/installation/installation-service.factory";

export const buildInstallationController = (): InstallationController => {
  const localInstallationRepository = new LocalInstallationRepositoryImpl(
    new LocalInstallationMongoDatasource(),
  );
  return new InstallationController(
    InstallationServiceFactory.create(localInstallationRepository),
  );
};

import { LocalInstallationMongoDatasource } from "../../infrastructure/datasources/installation/local-installation.datasource.mongo";
import { LocalInstallationRepositoryImpl } from "../../infrastructure/repositories/installation/local-installation.repository.impl";
import { InstallationController } from "../routes/installation/installation.controller";
import { InstallationServiceFactory } from "../services/installation/installation-service.factory";
import { LocalInstallationService } from "../services/installation/local-installation.service";

export const buildLocalInstallationRepository = () =>
  new LocalInstallationRepositoryImpl(new LocalInstallationMongoDatasource());

export const buildLocalInstallationService = (): LocalInstallationService =>
  new LocalInstallationService(buildLocalInstallationRepository());

export const buildInstallationController = (): InstallationController => {
  return new InstallationController(
    InstallationServiceFactory.create(buildLocalInstallationRepository()),
  );
};

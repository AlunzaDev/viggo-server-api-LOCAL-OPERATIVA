import { MobileCommandScheduler } from "../services/mobile/mobile-command.scheduler";
import { MobileCommandService } from "../services/mobile/mobile-command.service";
import { MobileCommandMongoDatasource } from "../../infrastructure/datasources/mobile/mobile-command.datasource.mongo";
import { MobileCommandRepositoryImpl } from "../../infrastructure/repositories/mobile/mobile-command.repository.impl";
import { MongoTransactionRunner } from "../../infrastructure/datasources/system/transaction-runner.mongo";
import { buildLocalInstallationService } from "./installation.dependencies";

export const buildMobileCommandScheduler = () => {
  return new MobileCommandScheduler(
    new MobileCommandService(
      buildLocalInstallationService(),
      new MobileCommandRepositoryImpl(new MobileCommandMongoDatasource()),
      new MongoTransactionRunner(),
    ),
  );
};
